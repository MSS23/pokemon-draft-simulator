/**
 * POST /api/tournament/create
 *
 * Server-side tournament-lobby creation. Same rationale as
 * /api/draft/create — bypasses RLS via the service role key + Clerk auth().
 */

import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { generateRoomCode } from '@/lib/room-utils'
import { validateName } from '@/lib/profanity'
import { createLogger } from '@/lib/logger'

const log = createLogger('api/tournament/create')

const MAX_PLAYERS = 32

interface CreateTournamentBody {
  name: string
  formatId: string
  tournamentType: 'single-elimination' | 'double-elimination'
  matchFormat: 'best_of_1' | 'best_of_3'
  hostName: string
}

export async function POST(request: NextRequest) {
  // 1. Authenticate via Clerk
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'You must be signed in to create a tournament.' }, { status: 401 })
  }

  // 2. Validate Supabase config
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    log.error('Service role key not configured', { hasUrl: !!supabaseUrl, hasKey: !!supabaseServiceKey })
    return NextResponse.json(
      { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY. Set it in Vercel project env vars.' },
      { status: 503 },
    )
  }

  // 3. Parse + validate
  let body: CreateTournamentBody
  try {
    body = (await request.json()) as CreateTournamentBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const nameCheck = validateName(body.name, { fieldLabel: 'Tournament name', maxLength: 60 })
  if (!nameCheck.ok) return NextResponse.json({ error: nameCheck.reason }, { status: 400 })
  const hostCheck = validateName(body.hostName, { fieldLabel: 'Host name', maxLength: 50 })
  if (!hostCheck.ok) return NextResponse.json({ error: hostCheck.reason }, { status: 400 })

  if (body.tournamentType !== 'single-elimination') {
    return NextResponse.json(
      { error: 'Double elimination is not available yet. Choose single elimination.' },
      { status: 400 },
    )
  }
  if (!['best_of_1', 'best_of_3'].includes(body.matchFormat)) {
    return NextResponse.json({ error: 'Invalid matchFormat' }, { status: 400 })
  }
  if (!body.formatId) {
    return NextResponse.json({ error: 'formatId is required' }, { status: 400 })
  }

  // 4. Privileged client
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const roomCode = generateRoomCode()

  // 5. Placeholder draft row
  const { data: draftRow, error: draftErr } = await supabase
    .from('drafts')
    .insert({
      name: body.name,
      host_id: userId,
      format: 'snake',
      ruleset: body.formatId,
      budget_per_team: 0,
      max_teams: MAX_PLAYERS,
      status: 'setup',
      room_code: roomCode,
      settings: {
        draftType: 'points',
        formatId: body.formatId,
        tournamentOnly: true,
      },
    })
    .select('id')
    .single()

  if (draftErr || !draftRow) {
    log.error('drafts insert failed', draftErr)
    return NextResponse.json(
      { error: `Failed to create tournament lobby: ${draftErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }
  const draftId = (draftRow as { id: string }).id

  // 6. Host's team
  const { error: teamErr } = await supabase
    .from('teams')
    .insert({
      draft_id: draftId,
      name: body.hostName,
      owner_id: userId,
      budget_remaining: 0,
      draft_order: 1,
      undos_remaining: 0,
    })
  if (teamErr) {
    log.error('host team insert failed; rolling back', teamErr)
    await supabase.from('drafts').delete().eq('id', draftId)
    return NextResponse.json(
      { error: `Failed to register host team: ${teamErr.message}` },
      { status: 500 },
    )
  }

  // 7. League row
  const { data: leagueRow, error: leagueErr } = await supabase
    .from('leagues')
    .insert({
      draft_id: draftId,
      name: body.name,
      league_type: 'knockout',
      status: 'scheduled',
      current_week: 0,
      total_weeks: 0,
      settings: {
        matchFormat: body.matchFormat,
        tournamentType: body.tournamentType,
        commissionerId: userId,
        formatId: body.formatId,
        roomCode,
      },
    })
    .select('id')
    .single()

  if (leagueErr || !leagueRow) {
    log.error('leagues insert failed; rolling back', leagueErr)
    await supabase.from('drafts').delete().eq('id', draftId)
    return NextResponse.json(
      { error: `Failed to create tournament: ${leagueErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    leagueId: (leagueRow as { id: string }).id,
    roomCode,
  })
}
