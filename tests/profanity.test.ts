import { describe, it, expect } from 'vitest'
import { checkProfanity, validateName } from '@/lib/profanity'

describe('profanity filter — hate speech', () => {
  it.each([
    "Hitler's Team",
    'hitler',
    'Heil Hitler',
    'h1tl3r',
    'H!tl3r',
    'h_i_t_l_e_r',
    'NaziSquad',
    'n4z1',
    'N4Z1S',
    'sieg heil',
    'SiegHeil',
    'KKK Team',
    'aryan brotherhood',
    '14words',
    '1488',
    'whitepower',
    'gas the jews',
  ])('blocks %s', (name) => {
    expect(checkProfanity(name).ok).toBe(false)
  })
})

describe('profanity filter — slurs', () => {
  it.each(['nigger', 'n1gger', 'nigga', 'faggot', 'f4gg0t', 'retard'])(
    'blocks %s',
    (name) => {
      expect(checkProfanity(name).ok).toBe(false)
    },
  )
})

describe('profanity filter — innocuous names allowed', () => {
  it.each([
    'Team Rocket',
    'Pokemon Masters',
    'Charizard Squad',
    'The Garchomps',
    'Hitomi',           // legit Japanese name (substring check would only fail if too aggressive)
    'Scunthorpe United',
    'Assassins',
    'Class A',
    'Massive Pokemon',
    'Cumbria Trainers',
    'BassMan',
    'Hello World',
  ])('allows %s', (name) => {
    expect(checkProfanity(name).ok).toBe(true)
  })
})

describe('validateName policy', () => {
  it('rejects empty when allowEmpty=false', () => {
    expect(validateName('', { fieldLabel: 'Name' }).ok).toBe(false)
  })

  it('allows empty when allowEmpty=true', () => {
    expect(validateName('', { allowEmpty: true }).ok).toBe(true)
  })

  it('rejects too-long names', () => {
    expect(validateName('a'.repeat(100), { maxLength: 50 }).ok).toBe(false)
  })

  it('rejects zero-width characters', () => {
    expect(validateName('hi​there').ok).toBe(false) // zero-width space
  })

  it('rejects "Hitler\'s Team"', () => {
    const r = validateName("Hitler's Team", { fieldLabel: 'Team name' })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/not allowed/i)
  })

  it('accepts a normal team name', () => {
    expect(validateName('Team Garchomp', { fieldLabel: 'Team name' }).ok).toBe(true)
  })
})
