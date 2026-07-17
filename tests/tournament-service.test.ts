import { describe, expect, it } from 'vitest'
import {
  createTournament,
  reportMatchResult,
  startTournament,
  type Tournament,
} from '@/lib/tournament-service'

function makeTournament(playerCount: number): Tournament {
  const participants = Array.from({ length: playerCount }, (_, index) => ({
    id: `team-${index + 1}`,
    teamId: `team-${index + 1}`,
    name: `Team ${index + 1}`,
    seed: index + 1,
  }))
  return startTournament(createTournament('Test Cup', 'single-elimination', participants))
}

describe('single-elimination tournament brackets', () => {
  it('creates the final for a four-player field', () => {
    const tournament = makeTournament(4)

    expect(tournament.rounds).toHaveLength(2)
    expect(tournament.rounds[0].matches).toHaveLength(2)
    expect(tournament.rounds[1].name).toBe('Finals')
    expect(tournament.rounds[1].matches).toHaveLength(1)
  })

  it('creates complete bracket shapes through 32 players', () => {
    for (let playerCount = 2; playerCount <= 32; playerCount++) {
      const tournament = makeTournament(playerCount)
      const bracketSize = 2 ** Math.ceil(Math.log2(playerCount))

      expect(tournament.rounds).toHaveLength(Math.log2(bracketSize))
      expect(tournament.rounds.at(-1)?.matches).toHaveLength(1)
      expect(tournament.rounds.reduce((total, round) => total + round.matches.length, 0))
        .toBe(bracketSize - 1)
    }
  })

  it('auto-advances byes without creating bye-vs-bye matches', () => {
    const tournament = makeTournament(5)
    const firstRound = tournament.rounds[0]
    const final = tournament.rounds.at(-1)!

    expect(firstRound.matches.filter(match => match.status === 'completed')).toHaveLength(3)
    expect(firstRound.matches.every(match =>
      !(match.participant1?.name === 'BYE' && match.participant2?.name === 'BYE')
    )).toBe(true)
    expect(final.matches).toHaveLength(1)
  })

  it('advances each winner into a stable final slot and completes the event', () => {
    let tournament = makeTournament(4)
    const [semiOne, semiTwo] = tournament.rounds[0].matches

    tournament = reportMatchResult(tournament, semiOne.id, semiOne.participant1!.id, {
      participant1: 2,
      participant2: 0,
    })
    tournament = reportMatchResult(tournament, semiTwo.id, semiTwo.participant2!.id, {
      participant1: 1,
      participant2: 2,
    })

    const final = tournament.rounds[1].matches[0]
    expect(final.participant1?.id).toBe(semiOne.participant1!.id)
    expect(final.participant2?.id).toBe(semiTwo.participant2!.id)

    tournament = reportMatchResult(tournament, final.id, final.participant2!.id, {
      participant1: 0,
      participant2: 2,
    })

    expect(tournament.status).toBe('completed')
    expect(tournament.winner?.id).toBe(final.participant2!.id)
  })

  it('rejects a winner who is not in the match', () => {
    const tournament = makeTournament(2)
    const match = tournament.rounds[0].matches[0]

    expect(() => reportMatchResult(tournament, match.id, 'not-a-player'))
      .toThrow('Winner is not a participant')
  })

  it('does not advertise a partial double-elimination implementation as working', () => {
    const tournament = createTournament('Double Cup', 'double-elimination', [
      { id: 'one', name: 'One', seed: 1 },
      { id: 'two', name: 'Two', seed: 2 },
    ])

    expect(() => startTournament(tournament)).toThrow('Double-elimination tournaments are not available yet')
  })
})
