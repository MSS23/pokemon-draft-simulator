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
  gender?: string
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

    // Check for nickname: "Nickname (Species)"
    const parenMatch = namePartRaw.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
    if (parenMatch) {
      const inner = parenMatch[2].trim()
      // Could be gender "(M)" / "(F)" or species name
      if (inner === 'M' || inner === 'F') {
        set.name = parenMatch[1].trim()
        set.gender = inner
      } else {
        set.nickname = parenMatch[1].trim()
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
