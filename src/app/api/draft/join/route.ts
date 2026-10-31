import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import bcrypt from 'bcryptjs'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { validateName } from '@/lib/profanity'
import { createLogger } from '@/lib/logger'
import { isPasswordAttemptBlocked, recordPasswordFailure } from '@/lib/password-attempt-limit'

const log = createLogger('api/draft/join')

interface JoinDraftBody {
  roomCode?: string
  teamName?: string
  displayName?: string
  password?: string
  asSpectator?: boolean
}

/**
 * Room preview for the join page. RLS hides private drafts from non-members,
 * but anyone holding the room code must be able to see the room before
 * joining it (the POST below already lets them join). Service role, minimal
 * non-sensitive fields only.
 */
export async function GET(request: NextRequest) {
  const roomCode = request.nextUrl.searchParams.get('roomCode')?.trim().toLowerCase()
  if (!roomCode || !/^[a-z0-9]{6}$/.test(roomCode)) {
    return NextResponse.json({ error: 'Enter a valid 6-character room code.' }, { status: 400 })
  }
  const { data } = await createServiceRoleClient()
    .from('drafts')
    .select('room_code, status, format, max_teams, has_password, settings, teams(id), participants(display_name, is_host)')
    .ilike('room_code', roomCode)
    .is('deleted_at', null)
    .maybeSingle()
  // Generated types lack the drafts->participants relation (same cast as getDraftState).
  const draft = data as unknown as {
    room_code: string; status: string; format: string; max_teams: number; has_password: boolean | null
    settings: unknown; teams: { id: string }[]; participants: { display_name: string | null; is_host: boolean }[]
  } | null
  if (!draft) {
    return NextResponse.json({ error: 'Draft room not found.' }, { status: 404 })
  }
  const settings = (draft.settings ?? {}) as { timeLimit?: number; pokemonPerTeam?: number }
  return NextResponse.json({
    roomCode: draft.room_code.toUpperCase(),
    maxTeams: draft.max_teams,
    currentTeams: draft.teams.length,
    draftType: draft.format,
    timeLimit: settings.timeLimit ?? 60,
    pokemonPerTeam: settings.pokemonPerTeam ?? 6,
    createdBy: draft.participants.find((p) => p.is_host)?.display_name || 'Unknown',
    status: draft.status === 'setup' ? 'waiting' : draft.status,
    hasPassword: !!draft.has_password,
  })
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'You must be signed in to join a draft.' }, { status: 401 })
  }

  let body: JoinDraftBody
  try {
    body = await request.json() as JoinDraftBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const roomCode = body.roomCode?.trim().toLowerCase()
  if (!roomCode || !/^[a-z0-9]{6}$/.test(roomCode)) {
    return NextResponse.json({ error: 'Enter a valid 6-character room code.' }, { status: 400 })
  }

  const asSpectator = body.asSpectator === true
  const teamName = body.teamName?.trim() || ''
  if (!asSpectator) {
    const teamCheck = validateName(teamName, { fieldLabel: 'Team name', maxLength: 50 })
    if (!teamCheck.ok) return NextResponse.json({ error: teamCheck.reason }, { status: 400 })
  }

  const db = createServiceRoleClient()
  const { data: draft, error: draftError } = await db
    .from('drafts')
    .select('id, has_password, settings')
    // Older draft rooms use lowercase codes while tournament rooms use
    // uppercase. Room codes are user-facing and intentionally case-insensitive.
    .ilike('room_code', roomCode)
    .maybeSingle()

  if (draftError || !draft) {
    return NextResponse.json({ error: 'Draft room not found.' }, { status: 404 })
  }

  if (draft.has_password) {
    if (!body.password) {
      return NextResponse.json({ error: 'This draft requires a password.' }, { status: 401 })
    }
    const attemptKey = `user:${userId}`
    if (await isPasswordAttemptBlocked(attemptKey)) {
      return NextResponse.json(
        { error: 'Too many incorrect passwords. Try again in a minute.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }
    const { data: passwordRow } = await db
      .from('draft_passwords')
      .select('password')
      .eq('draft_id', draft.id)
      .maybeSingle()
    if (!passwordRow || !(await bcrypt.compare(body.password, passwordRow.password))) {
      await recordPasswordFailure(attemptKey)
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
    }
  }

  const settings = (draft.settings ?? {}) as Record<string, unknown>
  const isTournament = settings.tournamentOnly === true
  let leagueId: string | null = null

  if (isTournament) {
    const { data: league, error: leagueError } = await db
      .from('leagues')
      .select('id, status')
      .eq('draft_id', draft.id)
      .maybeSingle()

    if (leagueError || !league) {
      return NextResponse.json({ error: 'Tournament lobby not found.' }, { status: 404 })
    }
    if (league.status !== 'scheduled') {
      return NextResponse.json({ error: 'This tournament has already started.' }, { status: 409 })
    }
    leagueId = league.id

    // Tournament joins before the atomic join RPC existed created a team but
    // no participant row. Treat that legacy team as a rejoin instead of
    // creating a duplicate team for the same Clerk user.
    const { data: existingTeam } = await db
      .from('teams')
      .select('id')
      .eq('draft_id', draft.id)
      .eq('owner_id', userId)
      .maybeSingle()

    if (existingTeam) {
      return NextResponse.json({
        draftId: roomCode,
        leagueId,
        teamId: existingTeam.id,
        asSpectator: false,
        displayName: body.displayName?.trim() || `Player-${userId.slice(0, 6)}`,
        rejoined: true,
      })
    }
  }

  const { data: profile } = await db
    .from('user_profiles')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle()

  const proposedDisplayName = profile?.display_name || body.displayName || `Player-${userId.slice(0, 6)}`
  const displayCheck = validateName(proposedDisplayName, { fieldLabel: 'Display name', maxLength: 50 })
  const displayName = displayCheck.ok ? proposedDisplayName.trim() : `Player-${userId.slice(0, 6)}`

  const { data, error } = await db.rpc('join_draft_atomic', {
    p_draft_id: draft.id,
    p_user_id: userId,
    p_display_name: displayName,
    p_team_name: asSpectator ? null : teamName,
    p_as_spectator: asSpectator,
  })

  if (error) {
    log.error('join_draft_atomic failed', { draftId: draft.id, error: error.message })
    return NextResponse.json({ error: 'Could not join this draft. Please try again.' }, { status: 500 })
  }
  if (!data?.success) {
    const message = data?.error || 'Could not join this draft.'
    const status = message.includes('already taken') ? 409 : message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({
    draftId: roomCode,
    leagueId,
    teamId: data.teamId || '',
    asSpectator: data.asSpectator === true,
    displayName,
    rejoined: data.rejoined === true,
  })
}
