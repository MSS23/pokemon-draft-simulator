/**
 * Regression tests for the 2026-08-23 league-engine fix pass.
 */
import { describe, it, expect } from 'vitest'
import { LeagueService } from '@/lib/league-service'
import { toShowdownName } from '@/utils/pokemon'
import { getTeamColor } from '@/utils/team-colors'
import { createTournament, startTournament } from '@/lib/tournament-service'
import type { Team } from '@/types'

const mkTeam = (id: string): Team => ({
  id, name: id, draftId: 'd', ownerId: `owner-${id}`,
  budgetRemaining: 0, draftOrder: 0, undosRemaining: 0, picks: [],
})

describe('round-robin schedule generation', () => {
  const build = (teams: Team[]): [Team, Team][][] =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (LeagueService as any).buildRoundRobinRounds(teams)

  for (const n of [3, 4, 5, 6, 8]) {
    it(`produces a valid round robin for ${n} teams`, () => {
      const teams = Array.from({ length: n }, (_, i) => mkTeam(`T${i + 1}`))
      const rounds = build(teams)

      const pairs = new Set<string>()
      for (const round of rounds) {
        const seenThisRound = new Set<string>()
        for (const [a, b] of round) {
          // no self-pairing (the old rotating[n-2-i] bug produced CvC etc.)
          expect(a.id).not.toBe(b.id)
          // one match per team per round
          expect(seenThisRound.has(a.id)).toBe(false)
          expect(seenThisRound.has(b.id)).toBe(false)
          seenThisRound.add(a.id)
          seenThisRound.add(b.id)
          const key = [a.id, b.id].sort().join('-')
          // every pair meets exactly once
          expect(pairs.has(key)).toBe(false)
          pairs.add(key)
        }
      }
      // every pair of real teams meets exactly once
      expect(pairs.size).toBe((n * (n - 1)) / 2)
    })
  }
})

describe('toShowdownName sprite ids', () => {
  it('collapses species-internal hyphens', () => {
    expect(toShowdownName('great-tusk')).toBe('greattusk')
    expect(toShowdownName('mr-mime')).toBe('mrmime')
    expect(toShowdownName('ho-oh')).toBe('hooh')
    expect(toShowdownName('iron-valiant')).toBe('ironvaliant')
    expect(toShowdownName('tapu-koko')).toBe('tapukoko')
    expect(toShowdownName('Flutter Mane')).toBe('fluttermane')
  })

  it('keeps one dash between species and forme', () => {
    expect(toShowdownName('urshifu-rapid-strike')).toBe('urshifu-rapidstrike')
    expect(toShowdownName('tauros-paldea-aqua')).toBe('tauros-paldeaaqua')
    expect(toShowdownName('landorus-therian')).toBe('landorus-therian')
    expect(toShowdownName('zygarde-10')).toBe('zygarde-10')
  })

  it('handles punctuation and gender markers', () => {
    expect(toShowdownName("Farfetch'd")).toBe('farfetchd')
    expect(toShowdownName('Mr. Mime')).toBe('mrmime')
    expect(toShowdownName('Nidoran♀')).toBe('nidoranf')
    expect(toShowdownName('Flabébé')).toBe('flabebe')
    expect(toShowdownName('Pikachu')).toBe('pikachu')
  })
})

describe('getTeamColor', () => {
  it('does not crash on a findIndex miss (-1)', () => {
    expect(getTeamColor(-1)).toBeDefined()
    expect(getTeamColor(-1).bg).toBeTruthy()
  })
})

describe('single-elimination bye seeding', () => {
  it('gives byes to top seeds and keeps seeds 1 and 2 in opposite halves (6 players)', () => {
    const participants = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i + 1}`, name: `P${i + 1}`, seed: i + 1,
    }))
    const t = startTournament(createTournament('T', 'single-elimination', participants))
    const r1 = t.rounds[0]

    // 8-slot bracket → 4 first-round matches
    expect(r1.matches).toHaveLength(4)

    // Byes go to seeds 1 and 2 (not to whoever sat in the first slots)
    const byeMatches = r1.matches.filter(m => m.participant2?.name === 'BYE')
    const byeSeeds = byeMatches.map(m => m.participant1?.seed).sort()
    expect(byeSeeds).toEqual([1, 2])

    // Seeds 1 and 2 feed DIFFERENT semi-final matches
    const seed1Match = r1.matches.find(m => m.participant1?.seed === 1)!
    const seed2Match = r1.matches.find(m => m.participant1?.seed === 2)!
    expect(seed1Match.nextMatchId).not.toBe(seed2Match.nextMatchId)
  })

  it('completes with no BYE-vs-BYE matches (5 players)', () => {
    const participants = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i + 1}`, name: `P${i + 1}`, seed: i + 1,
    }))
    const t = startTournament(createTournament('T', 'single-elimination', participants))
    for (const round of t.rounds) {
      for (const m of round.matches) {
        expect(m.participant1?.name === 'BYE' && m.participant2?.name === 'BYE').toBe(false)
      }
    }
  })
})

describe('parseMatchNotes', () => {
  it('tolerates legacy plain-text notes', () => {
    expect(LeagueService.parseMatchNotes('Cross-conference')).toEqual({ note: 'Cross-conference' })
    expect(LeagueService.parseMatchNotes(null)).toEqual({})
    expect(LeagueService.parseMatchNotes('{"submissions":{"home":{}}}')).toEqual({ submissions: { home: {} } })
  })
})
