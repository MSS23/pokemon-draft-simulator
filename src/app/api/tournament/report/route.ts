import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { reportMatchResult, type Tournament } from '@/lib/tournament-service'
import { createLogger } from '@/lib/logger'
import { syncBracketRows } from '@/app/api/tournament/bracket-sync'

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
    db.from('leagues').select('id, draft_id, status, settings, updated_at').eq('id', leagueId).maybeSingle(),
    db.from('matches')
      .select('id, league_id, home_team_id, away_team_id, status, winner_team_id, home_score, away_score')
      .eq('id', matchId)
      .maybeSingle(),
  ])

  if (!league) return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 })
  if (!match || match.league_id !== leagueId) {
    return NextResponse.json({ error: 'Match not found in this tournament.' }, { status: 404 })
  }
  if (winnerId !== match.home_team_id && winnerId !== match.away_team_id) {
    return NextResponse.json({ error: 'Winner must be one of the two teams in the match.' }, { status: 400 })
  }

  const initialSettings = (league.settings ?? {}) as Record<string, unknown>
  if (!initialSettings.tournament) {
    return NextResponse.json({ error: 'No bracket exists for this tournament.' }, { status: 409 })
  }

  // Authorization: a participant of THIS match, or the commissioner/draft host
  const { data: matchTeams } = await db
    .from('teams')
    .select('id, owner_id')
    .in('id', [match.home_team_id, match.away_team_id])
  const isParticipant = (matchTeams ?? []).some(t => t.owner_id === userId)

  let isCommissioner = initialSettings.commissionerId === userId
  if (!isCommissioner) {
    const { data: draft } = await db.from('drafts').select('host_id').eq('id', league.draft_id).maybeSingle()
    isCommissioner = draft?.host_id === userId
  }

  if (!isParticipant && !isCommissioner) {
    return NextResponse.json({ error: 'Only a player in this match or the host can report its result.' }, { status: 403 })
  }

  // A player may only advance a result both sides already confirmed (the
  // dual-confirmation flow marks the row completed with the agreed winner);
  // only the host can record an unconfirmed match. Players advance with the
  // confirmed score, never one they supply here.
  if (!isCommissioner && (match.status !== 'completed' || match.winner_team_id !== winnerId)) {
    return NextResponse.json({ error: 'Both players must confirm this result before the bracket advances.' }, { status: 403 })
  }
  const finalScore = isCommissioner
    ? { home: score.home, away: score.away }
    : { home: match.home_score, away: match.away_score }

  // Compare-and-set on leagues.updated_at (also bumped by trigger on every
  // write): two reports in one league must not overwrite each other's bracket.
  let current: { settings: unknown; updated_at: string } = league
  let updated: Tournament | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const settings = (current.settings ?? {}) as Record<string, unknown>
    const tournament = settings.tournament as Tournament | undefined
    if (!tournament) {
      return NextResponse.json({ error: 'No bracket exists for this tournament.' }, { status: 409 })
    }

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
      if (bracketMatch.winner?.teamId !== winnerId) {
        return NextResponse.json({ error: 'This match has already been reported.' }, { status: 409 })
      }
      // Same result already in the bracket: finish the row and next-round
      // writes an earlier attempt may not have reached.
      updated = tournament
      break
    }

    const p1IsHome = bracketMatch.participant1?.teamId === match.home_team_id
    let next: Tournament
    try {
      next = reportMatchResult(tournament, bracketMatch.id, winnerId, {
        participant1: p1IsHome ? finalScore.home : finalScore.away,
        participant2: p1IsHome ? finalScore.away : finalScore.home,
      })
    } catch (err) {
      log.error('Bracket advancement failed', { leagueId, matchId, error: err instanceof Error ? err.message : String(err) })
      return NextResponse.json({ error: 'Could not advance the bracket.' }, { status: 500 })
    }

    const currentRound = next.rounds
      .find(r => r.matches.some(m => m.status === 'pending' || m.status === 'in-progress'))
      ?.roundNumber ?? next.rounds.length

    const { data: saved, error: saveError } = await db
      .from('leagues')
      .update({
        current_week: currentRound,
        status: next.status === 'completed' ? 'completed' : 'active',
        settings: { ...settings, tournament: JSON.parse(JSON.stringify(next)) },
        updated_at: new Date().toISOString(),
      })
      .eq('id', leagueId)
      .eq('updated_at', current.updated_at)
      .select('id')
      .maybeSingle()
    if (saveError) {
      log.error('Bracket save failed', { leagueId, error: saveError.message })
      return NextResponse.json({ error: 'Could not save the bracket.' }, { status: 500 })
    }
    if (saved) {
      updated = next
      break
    }

    const { data: fresh } = await db.from('leagues').select('settings, updated_at').eq('id', leagueId).maybeSingle()
    if (!fresh) return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 })
    current = fresh
  }
  if (!updated) {
    return NextResponse.json({ error: 'The bracket changed while saving. Try again.' }, { status: 409 })
  }

  // Bracket first, then the row: losing the race above never leaves a
  // completed match row whose bracket slot is still pending.
  if (match.status !== 'completed' || match.winner_team_id !== winnerId) {
    const { error: matchError } = await db
      .from('matches')
      .update({
        status: 'completed',
        home_score: finalScore.home,
        away_score: finalScore.away,
        winner_team_id: winnerId,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId)
    if (matchError) {
      log.error('Match update failed', { matchId, error: matchError.message })
      return NextResponse.json({ error: 'Could not save the match result.' }, { status: 500 })
    }
  }

  // Create rows for newly-unlocked bracket matches. Failing loudly is safe:
  // a retry takes the idempotent "already in the bracket" path above.
  const finalSettings = (current.settings ?? {}) as Record<string, unknown>
  const matchFormat = typeof finalSettings.matchFormat === 'string' ? finalSettings.matchFormat : 'best_of_3'
  const { error: syncError } = await syncBracketRows(db, leagueId, updated, matchFormat)
  if (syncError) {
    log.error('Failed to sync new bracket matches', { leagueId, error: syncError })
    return NextResponse.json({ error: 'Result saved, but the next round could not be prepared. Try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, tournament: updated })
}
