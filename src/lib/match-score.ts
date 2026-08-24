/**
 * Canonical match-score convention.
 *
 * matches.home_score / away_score are TOTAL KOs (kills) across the played
 * games — the same unit the live KO scorer produces — so dual-confirmation
 * submissions from the recorder modal and the live scorer agree. Standings
 * PF/PA therefore read as kill totals, the usual draft-league convention.
 * W/L always comes from winner_team_id (series winner), never the score.
 *
 * Rosterless matches (room-code tournaments have no picks to log KOs
 * against) fall back to games won.
 */

export interface GameResultInput {
  gameNumber: number
  winnerTeamId: string | null
  isDnf?: boolean
}

export interface GameKOEntry {
  koCount: number
}

export interface GameKOSides {
  home: GameKOEntry[]
  away: GameKOEntry[]
}

const playedOf = (games: GameResultInput[]) =>
  games.filter(g => !g.isDnf && g.winnerTeamId !== null)

const gameKills = (side: GameKOEntry[] | undefined) =>
  (side ?? []).reduce((sum, e) => sum + e.koCount, 0)

export function computeCanonicalScore(
  games: GameResultInput[],
  gameKOs: Record<number, GameKOSides | undefined>,
  homeTeamId: string,
  awayTeamId: string,
  hasRosters: boolean
): { home: number; away: number } {
  const played = playedOf(games)
  if (!hasRosters) {
    return {
      home: played.filter(g => g.winnerTeamId === homeTeamId).length,
      away: played.filter(g => g.winnerTeamId === awayTeamId).length,
    }
  }
  let home = 0
  let away = 0
  for (const g of played) {
    const data = gameKOs[g.gameNumber]
    home += gameKills(data?.home)
    away += gameKills(data?.away)
  }
  return { home, away }
}

export interface MatchGameRow {
  match_id: string
  game_number: number
  winner_team_id: string | null
  home_team_score: number
  away_team_score: number
}

/** Per-game rows for the match_games table (KO score per game when rosters
 *  exist, otherwise 1–0 by game winner). */
export function buildMatchGameRows(
  matchId: string,
  games: GameResultInput[],
  gameKOs: Record<number, GameKOSides | undefined>,
  homeTeamId: string,
  awayTeamId: string,
  hasRosters: boolean
): MatchGameRow[] {
  return playedOf(games).map(g => {
    const data = gameKOs[g.gameNumber]
    const home = hasRosters ? gameKills(data?.home) : (g.winnerTeamId === homeTeamId ? 1 : 0)
    const away = hasRosters ? gameKills(data?.away) : (g.winnerTeamId === awayTeamId ? 1 : 0)
    return {
      match_id: matchId,
      game_number: g.gameNumber,
      winner_team_id: g.winnerTeamId,
      home_team_score: home,
      away_team_score: away,
    }
  })
}
