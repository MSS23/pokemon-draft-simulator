import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import bcrypt from 'bcryptjs'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { validateName } from '@/lib/profanity'
import { createLogger } from '@/lib/logger'

const log = createLogger('api/draft/join')

interface JoinDraftBody {
  roomCode?: string
  teamName?: string
  displayName?: string
  password?: string
  asSpectator?: boolean
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
    .select('id, has_password')
    .eq('room_code', roomCode)
    .maybeSingle()

  if (draftError || !draft) {
    return NextResponse.json({ error: 'Draft room not found.' }, { status: 404 })
  }

  if (draft.has_password) {
    if (!body.password) {
      return NextResponse.json({ error: 'This draft requires a password.' }, { status: 401 })
    }
    const { data: passwordRow } = await db
      .from('draft_passwords')
      .select('password')
      .eq('draft_id', draft.id)
      .maybeSingle()
    if (!passwordRow || !(await bcrypt.compare(body.password, passwordRow.password))) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
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
    teamId: data.teamId || '',
    asSpectator: data.asSpectator === true,
    displayName,
    rejoined: data.rejoined === true,
  })
}
