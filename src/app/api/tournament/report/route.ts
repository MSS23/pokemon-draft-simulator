import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { reportMatchResult, type Tournament } from '@/lib/tournament-service'
import { createLogger } from '@/lib/logger'

const log = createLogger('api/tournament/report')

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface ReportBody {
  leagueId?: string
  matchId?: string
  winnerId?: string
  score?: { home?: number; away?: number }
}

/**
 * Report a knockout match result and advance the bracket.
 *
 * This must run server-side with the service role: leagues.settings (where the
 * bracket lives) is commissioner-only under RLS, so a normal participant's
 * client-side save silently updated 0 rows and the bracket never advanced.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'You must be signed in to report a result.' }, { status: 401 })
  }

  let body: ReportBody
  try {
    body = await request.json() as ReportBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { leagueId, matchId, winnerId, score } = body
  if (!leagueId || !UUID_PATTERN.test(leagueId) || !matchId || !UUID_PATTERN.test(matchId)
      || !winnerId || typeof score?.home !== 'number' || typeof score?.away !== 'number') {
    return NextResponse.json({ error: 'Invalid report payload.' }, { status: 400 })
  }

  const db = createServiceRoleClient()

  const [{ data: league }, { data: match }] = await Promise.all([
    db.from('leagues').select('id, draft_id, status, settings').eq('id', leagueId).maybeSingle(),
    db.from('matches').select('id, league_id, home_team_id, away_team_id, status').eq('id', matchId).maybeSingle(),
  ])

  if (!league) return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 })
  if (!match || match.league_id !== leagueId) {
    return NextResponse.json({ error: 'Match not found in this tournament.' }, { status: 404 })
  }
  if (winnerId !== match.home_team_id && winnerId !== match.away_team_id) {
    return NextResponse.json({ error: 'Winner must be one of the two teams in the match.' }, { status: 400 })
  }

  const settings = (league.settings ?? {}) as Record<string, unknown>
  const tournament = settings.tournament as Tournament | undefined
  if (!tournament) {
    return NextResponse.json({ error: 'No bracket exists for this tournament.' }, { status: 409 })
  }

  // Authorization: a participant of THIS match, or the commissioner/draft host
  const { data: matchTeams } = await db
    .from('teams')
    .select('id, owner_id')
    .in('id', [match.home_team_id, match.away_team_id])
  const isParticipant = (matchTeams ?? []).some(t => t.owner_id === userId)

  let isCommissioner = settings.commissionerId === userId
  if (!isCommissioner) {
    const { data: draft } = await db.from('drafts').select('host_id').eq('id', league.draft_id).maybeSingle()
    isCommissioner = draft?.host_id === userId
  }

  if (!isParticipant && !isCommissioner) {
    return NextResponse.json({ error: 'Only a player in this match or the host can report its result.' }, { status: 403 })
  }

  // Locate the bracket match by its two participants
  const bracketMatch = tournament.rounds
    .flatMap(r => r.matches)
    .find(m =>
      (m.participant1?.teamId === match.home_team_id && m.participant2?.teamId === match.away_team_id) ||
      (m.participant1?.teamId === match.away_team_id && m.participant2?.teamId === match.home_team_id)
    )
  if (!bracketMatch) {
    return NextResponse.json({ error: 'Bracket match not found.' }, { status: 409 })
  }
  if (bracketMatch.status === 'completed') {
    return NextResponse.json({ error: 'This match has already been reported.' }, { status: 409 })
  }

  const p1IsHome = bracketMatch.participant1?.teamId === match.home_team_id
  let updated: Tournament
  try {
    updated = reportMatchResult(tournament, bracketMatch.id, winnerId, {
      participant1: p1IsHome ? score.home : score.away,
      participant2: p1IsHome ? score.away : score.home,
    })
  } catch (err) {
    log.error('Bracket advancement failed', { leagueId, matchId, error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Could not advance the bracket.' }, { status: 500 })
  }

  // Persist the match result
  const { error: matchError } = await db
    .from('matches')
    .update({
      status: 'completed',
      home_score: score.home,
      away_score: score.away,
      winner_team_id: winnerId,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId)
  if (matchError) {
    log.error('Match update failed', { matchId, error: matchError.message })
    return NextResponse.json({ error: 'Could not save the match result.' }, { status: 500 })
  }

  // Persist the advanced bracket
  const currentRound = (() => {
    for (const round of updated.rounds) {
      if (round.matches.some(m => m.status === 'pending' || m.status === 'in-progress')) return round.roundNumber
    }
    return updated.rounds.length
  })()

  const { error: saveError } = await db
    .from('leagues')
    .update({
      current_week: currentRound,
      status: updated.status === 'completed' ? 'completed' : 'active',
      settings: { ...settings, tournament: JSON.parse(JSON.stringify(updated)) },
      updated_at: new Date().toISOString(),
    })
    .eq('id', leagueId)
  if (saveError) {
    log.error('Bracket save failed', { leagueId, error: saveError.message })
    return NextResponse.json({ error: 'Could not save the bracket.' }, { status: 500 })
  }

  // Create DB rows for newly-unlocked bracket matches
  const { data: existingMatches } = await db
    .from('matches')
    .select('home_team_id, away_team_id')
    .eq('league_id', leagueId)
  const existingPairs = new Set(
    (existingMatches ?? []).flatMap(m => [`${m.home_team_id}-${m.away_team_id}`, `${m.away_team_id}-${m.home_team_id}`])
  )
  const matchFormat = typeof settings.matchFormat === 'string' ? settings.matchFormat : 'best_of_3'
  let matchNum = (existingMatches?.length || 0) + 1
  const newMatches = updated.rounds.flatMap(round =>
    round.matches
      .filter(m => m.participant1?.teamId && m.participant2?.teamId && m.participant2.name !== 'BYE')
      .filter(m => !existingPairs.has(`${m.participant1!.teamId}-${m.participant2!.teamId}`))
      .map(m => ({
        league_id: leagueId,
        week_number: round.roundNumber,
        match_number: matchNum++,
        home_team_id: m.participant1!.teamId!,
        away_team_id: m.participant2!.teamId!,
        status: 'scheduled' as const,
        home_score: 0,
        away_score: 0,
        winner_team_id: null,
        battle_format: matchFormat,
        scheduled_date: null,
        notes: JSON.stringify({ bracketMatchId: m.id }),
      }))
  )
  if (newMatches.length > 0) {
    const { error: syncError } = await db.from('matches').insert(newMatches)
    if (syncError) log.error('Failed to sync new bracket matches', { leagueId, error: syncError.message })
  }

  return NextResponse.json({ success: true, tournament: updated })
}
