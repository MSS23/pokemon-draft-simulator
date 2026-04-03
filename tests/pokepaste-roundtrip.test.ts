import { describe, it, expect } from 'vitest'
import {
  parsePokePaste,
  toPokePaste,
  teamToPokePaste,
  toBasicPokePasteTemplate,
  type PokemonSet,
} from '@/lib/pokepaste-parser'

describe('PokePaste round-trip validation (PASTE-04)', () => {
  it('toBasicPokePasteTemplate round-trips species name', () => {
    const paste = toBasicPokePasteTemplate('Garchomp')
    const parsed = parsePokePaste(paste)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('Garchomp')
  })

  it('full PokemonSet round-trips all fields', () => {
    const original: PokemonSet = {
      name: 'Incineroar',
      item: 'Assault Vest',
      ability: 'Intimidate',
      teraType: 'Ghost',
      evs: { hp: 244, atk: 12, def: 76, spd: 92, spe: 84 },
      ivs: {},
      nature: 'Careful',
      moves: ['Fake Out', 'Flare Blitz', 'Knock Off', 'U-turn'],
    }
    const paste = toPokePaste(original)
    const parsed = parsePokePaste(paste)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('Incineroar')
    expect(parsed[0].item).toBe('Assault Vest')
    expect(parsed[0].ability).toBe('Intimidate')
    expect(parsed[0].teraType).toBe('Ghost')
    expect(parsed[0].nature).toBe('Careful')
    expect(parsed[0].moves).toEqual([
      'Fake Out',
      'Flare Blitz',
      'Knock Off',
      'U-turn',
    ])
    expect(parsed[0].evs.hp).toBe(244)
  })

  it('teamToPokePaste produces parseable multi-Pokemon paste', () => {
    const team: PokemonSet[] = Array.from({ length: 6 }, (_, i) => ({
      name: `Pokemon${i + 1}`,
      evs: {},
      ivs: {},
      moves: ['Move A', 'Move B'],
    }))
    const paste = teamToPokePaste(team)
    const parsed = parsePokePaste(paste)
    expect(parsed).toHaveLength(6)
    parsed.forEach((set, i) => {
      expect(set.name).toBe(`Pokemon${i + 1}`)
    })
  })

  it('parses real VGC paste format', () => {
    const paste = `Incineroar @ Assault Vest
Ability: Intimidate
Tera Type: Ghost
EVs: 244 HP / 12 Atk / 76 Def / 92 SpD / 84 Spe
Careful Nature
- Fake Out
- Flare Blitz
- Knock Off
- U-turn`
    const parsed = parsePokePaste(paste)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('Incineroar')
    expect(parsed[0].moves).toHaveLength(4)
  })

  it('handles nickname syntax', () => {
    const paste = `Inci (Incineroar) @ Assault Vest
Ability: Intimidate
- Fake Out`
    const parsed = parsePokePaste(paste)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('Incineroar')
    expect(parsed[0].nickname).toBe('Inci')
  })
})
