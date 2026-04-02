/**
 * Parse PokePaste format text into structured Pokemon set data.
 * PokePaste format example:
 *
 * Incineroar @ Assault Vest
 * Ability: Intimidate
 * Tera Type: Ghost
 * EVs: 244 HP / 12 Atk / 76 Def / 92 SpD / 84 Spe
 * Careful Nature
 * - Fake Out
 * - Flare Blitz
 * - Knock Off
 * - U-turn
 */

export interface PokemonSet {
  name: string
  nickname?: string
  item?: string
  ability?: string
  teraType?: string
  evs: Record<string, number>
  ivs: Record<string, number>
  nature?: string
  moves: string[]
  level?: number
  shiny?: boolean
  happiness?: number
  gender?: 'M' | 'F'
}

const STAT_NAMES: Record<string, string> = {
  'HP': 'hp', 'Atk': 'atk', 'Def': 'def',
  'SpA': 'spa', 'SpD': 'spd', 'Spe': 'spe'
}

export function parsePokePaste(text: string): PokemonSet[] {
  const sets: PokemonSet[] = []
  const blocks = text.trim().split(/\n\s*\n/)

  for (const block of blocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue
    // Skip header lines like "=== [format] ==="
    if (lines[0].startsWith('===')) continue

    const set: PokemonSet = {
      name: '',
      evs: {},
      ivs: {},
      moves: []
    }

    // First line: "Pokemon @ Item" or "Nickname (Pokemon) @ Item" or "Pokemon (F) @ Item"
    const firstLine = lines[0]
    const itemSplit = firstLine.split(' @ ')
    const namePartRaw = itemSplit[0].trim()
    if (itemSplit.length > 1) set.item = itemSplit[1].trim()

    // Check for nickname/species/gender combinations:
    // "Nickname (Species) (F) " | "Nickname (Species)" | "Pokemon (F)" | "Pokemon"
    const nickSpeciesGender = namePartRaw.match(/^(.+?)\s*\(([^)]+)\)\s*\((M|F)\)\s*$/)
    const singleParen = namePartRaw.match(/^(.+?)\s*\(([^)]+)\)\s*$/)

    if (nickSpeciesGender) {
      // Nickname (Species) (Gender)
      set.nickname = nickSpeciesGender[1].trim()
      set.name = nickSpeciesGender[2].trim()
      set.gender = nickSpeciesGender[3] as 'M' | 'F'
    } else if (singleParen) {
      const inner = singleParen[2].trim()
      // Could be gender "(M)" / "(F)" or species name
      if (inner === 'M' || inner === 'F') {
        set.name = singleParen[1].trim()
        set.gender = inner as 'M' | 'F'
      } else {
        set.nickname = singleParen[1].trim()
        set.name = inner
      }
    } else {
      set.name = namePartRaw
    }

    // Parse remaining lines
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]

      if (line.startsWith('Ability:')) {
        set.ability = line.replace('Ability:', '').trim()
      } else if (line.startsWith('Tera Type:')) {
        set.teraType = line.replace('Tera Type:', '').trim()
      } else if (line.startsWith('Level:')) {
        set.level = parseInt(line.replace('Level:', '').trim(), 10)
      } else if (line.startsWith('Shiny:')) {
        set.shiny = line.replace('Shiny:', '').trim().toLowerCase() === 'yes'
      } else if (line.startsWith('Happiness:')) {
        set.happiness = parseInt(line.replace('Happiness:', '').trim(), 10)
      } else if (line.startsWith('EVs:')) {
        const evStr = line.replace('EVs:', '').trim()
        for (const part of evStr.split('/')) {
          const match = part.trim().match(/(\d+)\s+(\w+)/)
          if (match) {
            const stat = STAT_NAMES[match[2]] || match[2].toLowerCase()
            set.evs[stat] = parseInt(match[1], 10)
          }
        }
      } else if (line.startsWith('IVs:')) {
        const ivStr = line.replace('IVs:', '').trim()
        for (const part of ivStr.split('/')) {
          const match = part.trim().match(/(\d+)\s+(\w+)/)
          if (match) {
            const stat = STAT_NAMES[match[2]] || match[2].toLowerCase()
            set.ivs[stat] = parseInt(match[1], 10)
          }
        }
      } else if (line.endsWith('Nature')) {
        set.nature = line.replace('Nature', '').trim()
      } else if (line.startsWith('-')) {
        const move = line.replace(/^-\s*/, '').trim()
        if (move) set.moves.push(move)
      }
    }

    if (set.name) sets.push(set)
  }

  return sets
}

/**
 * Fetch and parse a PokePaste URL
 */
export async function fetchPokePaste(url: string): Promise<PokemonSet[]> {
  // Normalize URL: pokepast.es/abc123 -> pokepast.es/abc123/raw
  let rawUrl = url.trim()
  if (rawUrl.includes('pokepast.es')) {
    rawUrl = rawUrl.replace(/\/+$/, '')
    if (!rawUrl.endsWith('/raw')) rawUrl += '/raw'
  }

  const response = await fetch(rawUrl)
  if (!response.ok) throw new Error('Failed to fetch PokePaste')

  const text = await response.text()
  return parsePokePaste(text)
}

/**
 * Format EVs for display: "244 HP / 12 Atk / 76 Def"
 */
export function formatEVs(evs: Record<string, number>): string {
  const DISPLAY_NAMES: Record<string, string> = {
    hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'
  }
  return Object.entries(evs)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${DISPLAY_NAMES[k] || k}`)
    .join(' / ')
}

/**
 * Format IVs for display, only showing non-31 values: "0 Atk / 0 Spe"
 */
export function formatIVs(ivs: Record<string, number>): string {
  const DISPLAY_NAMES: Record<string, string> = {
    hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'
  }
  return Object.entries(ivs)
    .filter(([, v]) => v < 31)
    .map(([k, v]) => `${v} ${DISPLAY_NAMES[k] || k}`)
    .join(' / ')
}

/**
 * Convert a PokemonSet back to PokePaste format string.
 */
export function toPokePaste(set: PokemonSet): string {
  const lines: string[] = []

  // First line: [Nickname (]Species[)] [(Gender)] [@ Item]
  let firstLine = ''
  if (set.nickname) {
    firstLine = `${set.nickname} (${set.name})`
  } else {
    firstLine = set.name
  }
  if (set.gender) {
    firstLine += ` (${set.gender})`
  }
  if (set.item) {
    firstLine += ` @ ${set.item}`
  }
  lines.push(firstLine)

  if (set.ability) lines.push(`Ability: ${set.ability}`)
  if (set.level && set.level !== 100) lines.push(`Level: ${set.level}`)
  if (set.shiny) lines.push('Shiny: Yes')
  if (set.happiness !== undefined && set.happiness !== 255) lines.push(`Happiness: ${set.happiness}`)
  if (set.teraType) lines.push(`Tera Type: ${set.teraType}`)

  if (Object.keys(set.evs).length > 0) {
    const evStr = formatEVs(set.evs)
    if (evStr) lines.push(`EVs: ${evStr}`)
  }

  if (set.nature) lines.push(`${set.nature} Nature`)

  if (Object.keys(set.ivs).length > 0) {
    const ivStr = formatIVs(set.ivs)
    if (ivStr) lines.push(`IVs: ${ivStr}`)
  }

  for (const move of set.moves) {
    lines.push(`- ${move}`)
  }

  return lines.join('\n')
}

/**
 * Convert an array of PokemonSet to a full PokePaste team string,
 * with blank lines separating each Pokemon.
 */
export function teamToPokePaste(team: PokemonSet[]): string {
  return team.map(set => toPokePaste(set)).join('\n\n')
}

/**
 * Generate a basic PokePaste template for a Pokemon that only has a name.
 * Useful for exporting draft picks that don't have moveset data.
 */
export function toBasicPokePasteTemplate(name: string): string {
  return `${name}\nAbility: \nEVs: \n- \n- \n- \n- `
}
