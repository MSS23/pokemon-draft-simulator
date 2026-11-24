/**
 * POST /api/tournament/create-from-draft
 *
 * Turn a completed draft into a knockout tournament. Server-side so the host
 * check is enforced and the league/roster/match writes can be reconciled: a
 * retry after a partial failure heals the existing tournament instead of
 * throwing "already exists". (The path shares the /api/tournament/create
 * rate-limit bucket by prefix.)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createTournament, startTournament, type Tournament } from '@/lib/tournament-service'
import { syncBracketRows } from '@/app/api/tournament/bracket-sync'
import { validateName } from '@/lib/profanity'
import { createLogger } from '@/lib/logger'

const log = createLogger('api/tournament/create-from-draft')

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_PLAYERS = 32

interface Body {
  draftId?: string
  name?: string
  matchFormat?: string
  seedByDraftOrder?: boolean
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'You must be signed in to create a tournament.' }, { status: 401 })
  }

  let body: Body
  try {
    body = await request.json() as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { draftId } = body
  if (!draftId || !UUID_PATTERN.test(draftId)) {
    return NextResponse.json({ error: 'Invalid draft ID.' }, { status: 400 })
  }
  const nameCheck = validateName(body.name ?? '', { fieldLabel: 'Tournament name', maxLength: 60 })
  if (!nameCheck.ok) return NextResponse.json({ error: nameCheck.reason }, { status: 400 })
  const name = body.name!.trim()
  const matchFormat = body.matchFormat ?? 'best_of_3'
  if (matchFormat !== 'best_of_1' && matchFormat !== 'best_of_3') {
    return NextResponse.json({ error: 'Invalid matchFormat.' }, { status: 400 })
  }

  const db = createServiceRoleClient()

  const { data: draft, error: draftError } = await db
    .from('drafts')
    .select('id, host_id, status')
    .eq('id', draftId)
    .maybeSingle()
  if (draftError) {
    log.error('Draft lookup failed', { draftId, error: draftError.message })
    return NextResponse.json({ error: 'Could not load the draft.' }, { status: 500 })
  }
  if (!draft) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 })
  if (draft.host_id !== userId) {
    return NextResponse.json({ error: 'Only the draft host can create a tournament.' }, { status: 403 })
  }
  if (draft.status !== 'completed') {
    return NextResponse.json({ error: 'Draft must be completed.' }, { status: 400 })
  }

  const leagueColumns = 'id, draft_id, name, league_type, battle_type, season_number, status, start_date, end_date, current_week, total_weeks, settings, created_at, updated_at'
  const findKnockout = () => db
    .from('leagues')
    .select(leagueColumns)
    .eq('draft_id', draftId)
    .order('created_at')
    .order('id')

  const { data: existing, error: existingError } = await findKnockout()
  if (existingError) {
    log.error('League lookup failed', { draftId, error: existingError.message })
    return NextResponse.json({ error: 'Could not check for an existing tournament.' }, { status: 500 })
  }

  let league = (existing ?? []).find(l =>
    l.league_type === 'knockout' && (l.settings as Record<string, unknown> | null)?.tournament)
  if (!league && (existing ?? []).length > 0) {
    return NextResponse.json({ error: 'A league or tournament already exists for this draft.' }, { status: 409 })
  }

  if (!league) {
    const { data: teams, error: teamsError } = await db
      .from('teams')
      .select('id, name, draft_order')
      .eq('draft_id', draftId)
    if (teamsError) {
      log.error('Team lookup failed', { draftId, error: teamsError.message })
      return NextResponse.json({ error: 'Could not load the draft teams.' }, { status: 500 })
    }
    if (!teams || teams.length < 2) return NextResponse.json({ error: 'Need at least 2 teams.' }, { status: 400 })
    if (teams.length > MAX_PLAYERS) {
      return NextResponse.json({ error: `Max ${MAX_PLAYERS} teams supported.` }, { status: 400 })
    }

    const sorted = body.seedByDraftOrder !== false ? [...teams].sort((a, b) => a.draft_order - b.draft_order) : teams
    const tournament = startTournament(createTournament(name, 'single-elimination',
      sorted.map((t, i) => ({ id: t.id, name: t.name, teamId: t.id, seed: i + 1 }))))

    const { data: inserted, error: insertError } = await db
      .from('leagues')
      .insert({
        draft_id: draftId,
        name,
        league_type: 'knockout',
        status: 'active',
        current_week: 1,
        total_weeks: tournament.rounds.length,
        settings: {
          matchFormat,
          commissionerId: draft.host_id,
          tournament: JSON.parse(JSON.stringify(tournament)),
        },
      })
      .select('id')
      .single()
    if (insertError || !inserted) {
      log.error('League insert failed', { draftId, error: insertError?.message })
      return NextResponse.json({ error: 'Failed to create tournament.' }, { status: 500 })
    }

    // Two fast clicks can both pass the existence check (no unique index on
    // leagues.draft_id yet). The oldest knockout wins; the loser removes its own.
    const { data: after } = await findKnockout().eq('league_type', 'knockout')
    league = (after ?? [])[0]
    if (league && league.id !== inserted.id) {
      await db.from('leagues').delete().eq('id', inserted.id)
    }
    if (!league) return NextResponse.json({ error: 'Failed to create tournament.' }, { status: 500 })
  }

  const settings = (league.settings ?? {}) as Record<string, unknown>
  const tournament = settings.tournament as Tournament
  const format = typeof settings.matchFormat === 'string' ? settings.matchFormat : matchFormat
  const { error: syncError } = await syncBracketRows(db, league.id, tournament, format)
  if (syncError) {
    log.error('Tournament reconciliation failed', { leagueId: league.id, error: syncError })
    return NextResponse.json({ error: 'Tournament created, but its teams or matches could not be prepared. Try again.' }, { status: 500 })
  }

  return NextResponse.json({ league, tournament })
}
