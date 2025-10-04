/**
 * Pokémon Showdown Data Sync Service
 *
 * Fetches format data from Pokémon Showdown's official data files
 * and syncs it with our local format definitions.
 *
 * Sources:
 * - https://play.pokemonshowdown.com/data/formats-data.js
 * - https://play.pokemonshowdown.com/data/formats.js
 * - https://github.com/smogon/pokemon-showdown
 */

const SHOWDOWN_DATA_URL = 'https://play.pokemonshowdown.com/data'

export interface ShowdownFormat {
  name: string
  id: string
  ruleset?: string[]
  banlist?: string[]
  unbanlist?: string[]
  restricted?: string[]
  teamLength?: {
    validate?: [number, number]
    battle?: number
  }
}

export interface ShowdownFormatData {
  formats: Record<string, ShowdownFormat>
  lastUpdated: string
  source: string
}

export interface SyncResult {
  success: boolean
  formatsUpdated: number
  errors: string[]
  lastSynced: string
}

/**
 * Fetch formats data from Pokémon Showdown
 */
export async function fetchShowdownFormats(): Promise<ShowdownFormatData> {
  try {
    // Fetch the formats.js file
    const response = await fetch(`${SHOWDOWN_DATA_URL}/formats.js`, {
      cache: 'no-cache',
      headers: {
        'Accept': 'application/javascript, text/javascript, */*'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch Showdown formats: ${response.statusText}`)
    }

    const jsContent = await response.text()

    // Parse the JavaScript content
    // The file exports formats as: exports.Formats = { ... }
    const formats = parseShowdownFormatsJS(jsContent)

    return {
      formats,
      lastUpdated: new Date().toISOString(),
      source: SHOWDOWN_DATA_URL
    }
  } catch (error) {
    console.error('Error fetching Showdown formats:', error)
    throw error
  }
}

/**
 * Parse Showdown's formats.js file
 * The file uses CommonJS exports, so we need to extract the data
 */
function parseShowdownFormatsJS(jsContent: string): Record<string, ShowdownFormat> {
  try {
    // Remove comments and extract the formats object
    const cleaned = jsContent
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\/\/.*/g, '') // Remove single-line comments

    // Extract VGC formats
    const vgcFormats: Record<string, ShowdownFormat> = {}

    // Match VGC format definitions
    // Looking for patterns like: gen9vgc2024regh: { name: "...", ruleset: [...], banlist: [...] }
    const formatRegex = /(gen\d+vgc\d+\w*|gen\d+battlestadium\w*):\s*\{([^}]+)\}/gi

    let match
    while ((match = formatRegex.exec(cleaned)) !== null) {
      const formatId = match[1]
      const formatContent = match[2]

      // Extract name
      const nameMatch = formatContent.match(/name:\s*["']([^"']+)["']/)
      const name = nameMatch ? nameMatch[1] : formatId

      // Extract ruleset
      const rulesetMatch = formatContent.match(/ruleset:\s*\[([^\]]+)\]/)
      const ruleset = rulesetMatch
        ? rulesetMatch[1].split(',').map(r => r.trim().replace(/['"]/g, ''))
        : []

      // Extract banlist
      const banlistMatch = formatContent.match(/banlist:\s*\[([^\]]+)\]/)
      const banlist = banlistMatch
        ? banlistMatch[1].split(',').map(b => b.trim().replace(/['"]/g, ''))
        : []

      vgcFormats[formatId] = {
        id: formatId,
        name,
        ruleset,
        banlist
      }
    }

    return vgcFormats
  } catch (error) {
    console.error('Error parsing Showdown formats:', error)
    return {}
  }
}

/**
 * Sync Showdown data with local storage
 */
export async function syncShowdownData(): Promise<SyncResult> {
  const errors: string[] = []
  let formatsUpdated = 0

  try {
    const showdownData = await fetchShowdownFormats()

    // Store in localStorage for client-side caching
    if (typeof window !== 'undefined') {
      localStorage.setItem('showdown-formats', JSON.stringify(showdownData))
      localStorage.setItem('showdown-last-sync', new Date().toISOString())
    }

    formatsUpdated = Object.keys(showdownData.formats).length

    return {
      success: true,
      formatsUpdated,
      errors,
      lastSynced: new Date().toISOString()
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error')
    return {
      success: false,
      formatsUpdated: 0,
      errors,
      lastSynced: new Date().toISOString()
    }
  }
}

/**
 * Get cached Showdown data
 */
export function getCachedShowdownData(): ShowdownFormatData | null {
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem('showdown-formats')
    if (!cached) return null

    return JSON.parse(cached)
  } catch (error) {
    console.error('Error reading cached Showdown data:', error)
    return null
  }
}

/**
 * Get last sync timestamp
 */
export function getLastSyncTime(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('showdown-last-sync')
}

/**
 * Check if sync data is stale (older than 7 days)
 */
export function isSyncStale(): boolean {
  const lastSync = getLastSyncTime()
  if (!lastSync) return true

  const lastSyncDate = new Date(lastSync)
  const now = new Date()
  const daysSinceSync = (now.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60 * 24)

  return daysSinceSync > 7
}

/**
 * Convert Showdown format to our format structure
 */
export function convertShowdownFormat(showdownFormat: ShowdownFormat, formatId: string): Partial<any> {
  // Map common Showdown format IDs to our format IDs
  const formatMapping: Record<string, string> = {
    'gen9vgc2024regh': 'vgc-reg-h',
    'gen9vgc2024regg': 'vgc-reg-g',
    'gen9battlestadiumsingles': 'gen9-ou'
  }

  const mappedId = formatMapping[formatId] || formatId

  return {
    id: mappedId,
    name: showdownFormat.name,
    bannedPokemon: showdownFormat.banlist || [],
    ruleset: showdownFormat.ruleset || [],
    source: 'pokemonshowdown',
    lastUpdated: new Date().toISOString()
  }
}

/**
 * Clear cached Showdown data
 */
export function clearShowdownCache(): void {
  if (typeof window === 'undefined') return

  localStorage.removeItem('showdown-formats')
  localStorage.removeItem('showdown-last-sync')
}
