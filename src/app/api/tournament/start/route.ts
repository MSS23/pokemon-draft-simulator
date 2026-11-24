import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createTournament, startTournament, type Tournament } from '@/lib/tournament-service'
import { createLogger } from '@/lib/logger'
import { syncBracketRows } from '@/app/api/tournament/bracket-sync'

const log = createLogger('api/tournament/start')

interface StartTournamentBody {
  leagueId?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'You must be signed in to start a tournament.' }, { status: 401 })
  }

  let body: StartTournamentBody
  try {
    body = await request.json() as StartTournamentBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!body.leagueId || !UUID_PATTERN.test(body.leagueId)) {
    return NextResponse.json({ error: 'Invalid tournament ID.' }, { status: 400 })
  }

  const db = createServiceRoleClient()
  const { data: league, error: leagueError } = await db
    .from('leagues')
    .select('id, draft_id, name, status, settings')
    .eq('id', body.leagueId)
    .maybeSingle()

  if (leagueError) {
    log.error('Tournament lookup failed', { leagueId: body.leagueId, error: leagueError.message })
    return NextResponse.json({ error: 'Could not load the tournament.' }, { status: 500 })
  }
  if (!league) return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 })

  const settings = (league.settings ?? {}) as Record<string, unknown>
  if (settings.commissionerId !== userId) {
    return NextResponse.json({ error: 'Only the tournament host can start it.' }, { status: 403 })
  }

  let tournament: Tournament
  let alreadyStarted = false
  const convertedToSingle = league.status === 'scheduled' && settings.tournamentType === 'double-elimination'

  if (league.status === 'scheduled') {
    // Close the lobby BEFORE reading teams: join_draft_atomic only seats players
    // while drafts.status = 'setup', so nobody can join after our teams read and
    // end up holding a team with no bracket slot.
    const { error: closeError } = await db
      .from('drafts')
      .update({ status: 'completed' })
      .eq('id', league.draft_id)
      .eq('status', 'setup')
    if (closeError) {
      log.error('Tournament lobby close failed', { leagueId: league.id, error: closeError.message })
      return NextResponse.json({ error: 'Could not start the tournament.' }, { status: 500 })
    }
    // Any failure before the bracket is claimed must reopen the lobby, or a
    // 1-player 400 would lock everyone out for good.
    const reopenLobby = () => db
      .from('drafts')
      .update({ status: 'setup' })
      .eq('id', league.draft_id)
      .eq('status', 'completed')

    const { data: teams, error: teamsError } = await db
      .from('teams')
      .select('id, name, draft_order')
      .eq('draft_id', league.draft_id)
      .order('draft_order')

    if (teamsError) {
      await reopenLobby()
      log.error('Tournament team lookup failed', { leagueId: league.id, error: teamsError.message })
      return NextResponse.json({ error: 'Could not load tournament players.' }, { status: 500 })
    }
    if (!teams || teams.length < 2) {
      await reopenLobby()
      return NextResponse.json({ error: 'At least 2 players are required to start.' }, { status: 400 })
    }
    if (teams.length > 32) {
      await reopenLobby()
      return NextResponse.json({ error: 'Tournaments support at most 32 players.' }, { status: 400 })
    }

    const participants = teams.map((team, index) => ({
      id: team.id,
      teamId: team.id,
      name: team.name,
      seed: index + 1,
    }))
    tournament = startTournament(createTournament(league.name, 'single-elimination', participants))

    // Compare-and-set prevents two rapid Start clicks from generating two
    // competing brackets. A retry can safely reconcile the stored bracket.
    const { data: claimed, error: updateError } = await db
      .from('leagues')
      .update({
        status: 'active',
        current_week: 1,
        total_weeks: tournament.rounds.length,
        settings: {
          ...settings,
          tournamentType: 'single-elimination',
          tournament: JSON.parse(JSON.stringify(tournament)),
        },
      })
      .eq('id', league.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle()

    if (updateError) {
      await reopenLobby()
      log.error('Tournament start update failed', { leagueId: league.id, error: updateError.message })
      return NextResponse.json({ error: 'Could not start the tournament.' }, { status: 500 })
    }

    if (!claimed) {
      const { data: current } = await db
        .from('leagues')
        .select('status, settings')
        .eq('id', league.id)
        .maybeSingle()
      const currentSettings = (current?.settings ?? {}) as Record<string, unknown>
      if (current?.status !== 'active' || !currentSettings.tournament) {
        await reopenLobby()
        return NextResponse.json({ error: 'Tournament state changed. Refresh and try again.' }, { status: 409 })
      }
      tournament = currentSettings.tournament as unknown as Tournament
      alreadyStarted = true
    }
  } else if (league.status === 'active' && settings.tournament) {
    tournament = settings.tournament as unknown as Tournament
    alreadyStarted = true
  } else {
    return NextResponse.json({ error: 'Tournament has already finished or cannot be started.' }, { status: 409 })
  }

  const matchFormat = typeof settings.matchFormat === 'string' ? settings.matchFormat : 'best_of_3'
  const { error: syncError } = await syncBracketRows(db, league.id, tournament, matchFormat)
  if (syncError) {
    log.error('Tournament reconciliation failed', { leagueId: league.id, error: syncError })
    return NextResponse.json({ error: 'Tournament started, but its roster or matches could not be prepared. Try again.' }, { status: 500 })
  }

  // Lobbies started by older code may still be open on a reconcile retry.
  await db.from('drafts').update({ status: 'completed' }).eq('id', league.draft_id).eq('status', 'setup')

  return NextResponse.json({ success: true, alreadyStarted, convertedToSingle, leagueId: league.id })
}
