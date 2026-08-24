import { describe, it, expect } from 'vitest'
import { computeCanonicalScore, buildMatchGameRows } from '@/lib/match-score'

const HOME = 'team-home'
const AWAY = 'team-away'

describe('computeCanonicalScore', () => {
  it('uses total KOs for a Bo1 with rosters (matches the live scorer unit)', () => {
    const games = [{ gameNumber: 1, winnerTeamId: HOME }]
    const gameKOs = {
      1: {
        home: [{ koCount: 3 }, { koCount: 1 }],
        away: [{ koCount: 2 }],
      },
    }
    expect(computeCanonicalScore(games, gameKOs, HOME, AWAY, true)).toEqual({ home: 4, away: 2 })
  })

  it('sums KOs across played games for a Bo3, skipping DNF games', () => {
    const games = [
      { gameNumber: 1, winnerTeamId: HOME },
      { gameNumber: 2, winnerTeamId: HOME },
      { gameNumber: 3, winnerTeamId: null, isDnf: true },
    ]
    const gameKOs = {
      1: { home: [{ koCount: 4 }], away: [{ koCount: 2 }] },
      2: { home: [{ koCount: 4 }], away: [{ koCount: 3 }] },
      3: { home: [{ koCount: 9 }], away: [{ koCount: 9 }] }, // DNF — ignored
    }
    expect(computeCanonicalScore(games, gameKOs, HOME, AWAY, true)).toEqual({ home: 8, away: 5 })
  })

  it('falls back to games won for rosterless (room-code) matches', () => {
    const games = [
      { gameNumber: 1, winnerTeamId: HOME },
      { gameNumber: 2, winnerTeamId: AWAY },
      { gameNumber: 3, winnerTeamId: HOME },
    ]
    expect(computeCanonicalScore(games, {}, HOME, AWAY, false)).toEqual({ home: 2, away: 1 })
  })
})

describe('buildMatchGameRows', () => {
  it('builds one row per played game with per-game KO scores', () => {
    const games = [
      { gameNumber: 1, winnerTeamId: HOME },
      { gameNumber: 2, winnerTeamId: AWAY },
      { gameNumber: 3, winnerTeamId: null, isDnf: true },
    ]
    const gameKOs = {
      1: { home: [{ koCount: 4 }], away: [{ koCount: 1 }] },
      2: { home: [{ koCount: 2 }], away: [{ koCount: 4 }] },
    }
    const rows = buildMatchGameRows('match-1', games, gameKOs, HOME, AWAY, true)
    expect(rows).toEqual([
      { match_id: 'match-1', game_number: 1, winner_team_id: HOME, home_team_score: 4, away_team_score: 1 },
      { match_id: 'match-1', game_number: 2, winner_team_id: AWAY, home_team_score: 2, away_team_score: 4 },
    ])
  })

  it('uses 1-0 by game winner when no rosters exist', () => {
    const games = [{ gameNumber: 1, winnerTeamId: AWAY }]
    const rows = buildMatchGameRows('match-1', games, {}, HOME, AWAY, false)
    expect(rows).toEqual([
      { match_id: 'match-1', game_number: 1, winner_team_id: AWAY, home_team_score: 0, away_team_score: 1 },
    ])
  })
})
