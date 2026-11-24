import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import type { Tournament } from '@/lib/tournament-service'

/**
 * Idempotently create the league_teams and matches rows a stored bracket needs.
 * Rows come from the bracket itself (never a fresh teams read), so a late
 * joiner can't get a league_teams row without a bracket slot. Safe to re-run:
 * every start/report/create retry calls it to heal a half-finished write.
 */
export async function syncBracketRows(
  db: SupabaseClient<Database>,
  leagueId: string,
  tournament: Tournament,
  matchFormat: string,
): Promise<{ error: string | null }> {
  const leagueTeams = tournament.participants
    .filter(p => p.teamId)
    .map((p, index) => ({ league_id: leagueId, team_id: p.teamId!, seed: p.seed ?? index + 1 }))
  if (leagueTeams.length > 0) {
    const { error } = await db
      .from('league_teams')
      .upsert(leagueTeams, { onConflict: 'league_id,team_id', ignoreDuplicates: true })
    if (error) return { error: `roster: ${error.message}` }
  }

  const playableMatches = tournament.rounds.flatMap(round =>
    round.matches
      .filter(m => m.participant1?.teamId && m.participant2?.teamId && m.participant2.name !== 'BYE')
      .map((m, index) => ({
        league_id: leagueId,
        week_number: round.roundNumber,
        match_number: index + 1,
        home_team_id: m.participant1!.teamId!,
        away_team_id: m.participant2!.teamId!,
        status: 'scheduled' as const,
        home_score: 0,
        away_score: 0,
        winner_team_id: null,
        battle_format: matchFormat,
        scheduled_date: null,
        notes: JSON.stringify({ bracketMatchId: m.id }),
      })),
  )
  if (playableMatches.length > 0) {
    const { error } = await db
      .from('matches')
      .upsert(playableMatches, { onConflict: 'league_id,week_number,home_team_id,away_team_id', ignoreDuplicates: true })
    if (error) return { error: `matches: ${error.message}` }
  }
  return { error: null }
}
