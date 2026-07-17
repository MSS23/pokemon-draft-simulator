/**
 * CSV Parser for Custom Pokemon Pricing
 *
 * Supports two CSV formats:
 *
 * 1. Simple format:
 *    pokemon,cost
 *    Pikachu,10
 *    Charizard,25
 *
 * 2. Tiered column format (e.g. Google Sheets draft pools):
 *    ,S Tier (60),,,,A Tier (50),,,,B Tier (40),,,,Banned,
 *    ,,Dragonite,,,,Arcanine,,,,Alcremie,,,,Mewtwo
 *    Each tier header contains the cost in parentheses.
 *    Pokemon under "Banned" column are excluded (cost 0).
 */
import { createLogger } from '@/lib/logger'
const log = createLogger('CsvParser')

export interface PokemonPricing {
  [pokemonNameOrId: string]: number
}

export interface TierInfo {
  name: string
  cost: number
  count: number
}

export interface ParsedCSVResult {
  success: boolean
  data?: PokemonPricing
  error?: string
  /** Banned pokemon names (from "Banned" column in tiered format) */
  banned?: string[]
  /** Tier breakdown when parsed from tiered format */
  tiers?: TierInfo[]
  stats?: {
    totalPokemon: number
    minCost: number
    maxCost: number
    avgCost: number
  }
}

/**
 * Normalizes Pokemon names for consistent matching
 * - Converts to lowercase
 * - Removes spaces, hyphens, special characters
 * - Handles common variations (e.g., "Mr. Mime" -> "mrmime")
 */
export function normalizePokemonName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .replace(/[^a-z0-9]+/g, '')
}

/** Small RFC-4180 parser: quoted commas, escaped quotes, CRLF and BOM. */
function parseCSVRows(csvContent: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = csvContent.replace(/^\uFEFF/, '')

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i += 1
      row.push(cell.trim())
      if (row.some(value => value.length > 0)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell.trim())
  if (row.some(value => value.length > 0)) rows.push(row)
  return rows
}

function normalizeTierName(value: string): string {
  return value.replace(/\s*tier\s*/gi, '').trim().toUpperCase()
}

function isMarker(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return ['x', '✓', '✗', '✔', 'âœ“', 'âœ—'].includes(normalized)
}

/**
 * Detects if a CSV header row uses the tiered column format.
 * Looks for headers matching patterns like "S Tier (60)", "A Tier (50)", "Banned", etc.
 */
function detectTieredFormat(headerParts: string[]): { tierColumns: { col: number; name: string; cost: number }[]; bannedCol: number | null } | null {
  const tierPattern = /^([A-Z]\+?)\s*Tier\s*\((\d+)\)$/i
  const tierColumns: { col: number; name: string; cost: number }[] = []
  let bannedCol: number | null = null

  for (let i = 0; i < headerParts.length; i++) {
    const cell = headerParts[i].trim()
    if (!cell) continue

    const tierMatch = cell.match(tierPattern)
    if (tierMatch) {
      tierColumns.push({
        col: i,
        name: tierMatch[1].toUpperCase(),
        cost: parseInt(tierMatch[2])
      })
    } else if (cell.toLowerCase() === 'banned') {
      bannedCol = i
    }
  }

  // Need at least 2 tier columns to consider this a tiered format
  if (tierColumns.length >= 2) {
    return { tierColumns, bannedCol }
  }
  return null
}

/**
 * Parses a tiered column CSV (e.g. from a Google Sheets draft pool).
 * Each tier header column is followed by a pokemon name column at header_col + 1.
 */
function parseTieredCSV(rows: string[][], tierColumns: { col: number; name: string; cost: number }[], bannedCol: number | null): ParsedCSVResult {
  const pricing: PokemonPricing = {}
  const banned: string[] = []
  const costs: number[] = []
  const tierCounts: Record<string, number> = {}
  const errors: string[] = []

  // Initialize tier counts
  for (const tier of tierColumns) {
    tierCounts[tier.name] = 0
  }

  // Process data rows (skip header)
  for (let i = 1; i < rows.length; i++) {
    const parts = rows[i]

    // Extract pokemon from each tier column
    for (const tier of tierColumns) {
      // Pokemon name is at header_col + 1 (header col has the checkmark/marker)
      const nameCol = tier.col + 1
      if (nameCol >= parts.length) continue

      const pokemonName = parts[nameCol]?.trim()
      if (!pokemonName) continue

      // Skip checkmarks or other non-name values
      if (isMarker(pokemonName)) continue

      const normalizedName = normalizePokemonName(pokemonName)

      if (pricing[normalizedName] !== undefined) {
        errors.push(`Row ${i + 1}: Duplicate "${pokemonName}" (already in pool)`)
        continue
      }

      pricing[normalizedName] = tier.cost
      costs.push(tier.cost)
      tierCounts[tier.name] = (tierCounts[tier.name] || 0) + 1
    }

    // Extract banned pokemon
    if (bannedCol !== null) {
      const bannedNameCol = bannedCol + 1
      if (bannedNameCol < parts.length) {
        const pokemonName = parts[bannedNameCol]?.trim()
        if (pokemonName && !isMarker(pokemonName)) {
          banned.push(pokemonName)
        }
      }
    }
  }

  if (Object.keys(pricing).length === 0) {
    return {
      success: false,
      error: 'No valid Pokemon found in tiered CSV. Check that the column format matches: "S Tier (60)", "A Tier (50)", etc.'
    }
  }

  const tiers: TierInfo[] = tierColumns
    .sort((a, b) => b.cost - a.cost)
    .map(t => ({ name: `${t.name} Tier`, cost: t.cost, count: tierCounts[t.name] || 0 }))

  const stats = {
    totalPokemon: Object.keys(pricing).length,
    minCost: Math.min(...costs),
    maxCost: Math.max(...costs),
    avgCost: Math.round(costs.reduce((a, b) => a + b, 0) / costs.length)
  }

  if (errors.length > 0) {
    log.warn('Tiered CSV parsing completed with warnings:', errors)
  }

  log.info(`Parsed tiered CSV: ${stats.totalPokemon} Pokemon across ${tiers.length} tiers, ${banned.length} banned`)

  return {
    success: true,
    data: pricing,
    banned: banned.length > 0 ? banned : undefined,
    tiers,
    stats,
    error: errors.length > 0 ? `Parsed successfully with ${errors.length} warnings` : undefined
  }
}

/**
 * Parses CSV content and returns Pokemon pricing data.
 * Auto-detects simple (pokemon,cost) or tiered column format.
 */
export function parseCustomPricingCSV(csvContent: string): ParsedCSVResult {
  try {
    const rows = parseCSVRows(csvContent)
    if (rows.length === 0) return { success: false, error: 'CSV file is empty' }

    const headerParts = rows[0].map(header => header.trim())

    // Check if this is a tiered column format (e.g. "S Tier (60), A Tier (50), ...")
    const tieredFormat = detectTieredFormat(headerParts)
    if (tieredFormat) {
      log.info('Detected tiered column CSV format')
      return parseTieredCSV(rows, tieredFormat.tierColumns, tieredFormat.bannedCol)
    }

    const headerLower = headerParts.map(h => h.toLowerCase())
    const pokemonColIndex = headerLower.findIndex(h =>
      h === 'pokemon' || h === 'name' || h === 'pokemon_name'
    )
    const costColIndex = headerLower.findIndex(h =>
      h === 'cost' || h === 'points' || h === 'price' || h === 'value' ||
      h === 'tier points' || h === 'tier_points'
    )
    const tierColIndex = headerLower.findIndex(h =>
      h === 'tier' || h === 'tier name' || h === 'tier_name' || h === 'rank' || h === 'grade'
    )

    if (pokemonColIndex === -1 || (costColIndex === -1 && tierColIndex === -1)) {
      return {
        success: false,
        error: 'Invalid CSV header. Expected "pokemon,cost", "pokemon,tier", or columns such as "S Tier (60)".'
      }
    }

    const pricing: PokemonPricing = {}
    const errors: string[] = []
    const costs: number[] = []
    const tierCounts: Record<string, number> = {}
    const tierCosts: Record<string, number> = {}
    const defaultTierCosts: Record<string, number> = {
      'S+': 70, S: 60, A: 50, B: 40, C: 30, D: 20, E: 10, F: 0,
    }
    const unknownTiers: string[] = []

    for (let i = 1; i < rows.length; i++) {
      const parts = rows[i]

      const pokemonName = parts[pokemonColIndex]
      if (!pokemonName) {
        errors.push(`Line ${i + 1}: Missing Pokemon name`)
        continue
      }

      const costValue = costColIndex >= 0 ? (parts[costColIndex] || '') : ''
      let tierName = tierColIndex >= 0 ? normalizeTierName(parts[tierColIndex] || '') : ''
      let cost = Number.parseInt(costValue, 10)

      // A two-column "Pokemon,Tier Points" sheet may contain S/A/B labels.
      if (Number.isNaN(cost)) {
        tierName = tierName || normalizeTierName(costValue)
        if (!tierName) {
          errors.push(`Line ${i + 1}: Add a numeric cost or tier for ${pokemonName}`)
          continue
        }
        if (!(tierName in defaultTierCosts) && !unknownTiers.includes(tierName)) {
          unknownTiers.push(tierName)
        }
        cost = defaultTierCosts[tierName] ?? Math.max(0, 90 - unknownTiers.indexOf(tierName) * 10)
      }

      if (cost < 0) {
        errors.push(`Line ${i + 1}: Cost cannot be negative for ${pokemonName}`)
        continue
      }

      if (cost > 5000) {
        errors.push(`Line ${i + 1}: Cost seems too high (${cost}) for ${pokemonName}`)
        continue
      }

      const normalizedName = normalizePokemonName(pokemonName)
      if (pricing[normalizedName] !== undefined) {
        errors.push(`Line ${i + 1}: Duplicate Pokemon "${pokemonName}" (already defined with cost ${pricing[normalizedName]})`)
        continue
      }

      pricing[normalizedName] = cost
      costs.push(cost)
      if (tierName) {
        tierCounts[tierName] = (tierCounts[tierName] || 0) + 1
        tierCosts[tierName] = Math.max(tierCosts[tierName] ?? cost, cost)
      }
    }

    if (Object.keys(pricing).length === 0) {
      return {
        success: false,
        error: 'No valid Pokemon pricing found in CSV. Errors:\n' + errors.join('\n')
      }
    }

    const stats = {
      totalPokemon: Object.keys(pricing).length,
      minCost: Math.min(...costs),
      maxCost: Math.max(...costs),
      avgCost: Math.round(costs.reduce((a, b) => a + b, 0) / costs.length)
    }

    if (errors.length > 0) {
      log.warn('CSV parsing completed with warnings:', errors)
    }

    const tiers = Object.keys(tierCounts)
      .map(name => ({ name: `${name} Tier`, cost: tierCosts[name], count: tierCounts[name] }))
      .sort((a, b) => b.cost - a.cost)

    return {
      success: true,
      data: pricing,
      tiers: tiers.length > 0 ? tiers : undefined,
      stats,
      error: errors.length > 0 ? `Parsed successfully with ${errors.length} warnings` : undefined
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Validates a CSV file before parsing
 */
export function validateCSVFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    return {
      valid: false,
      error: 'Please upload a CSV file (.csv)'
    }
  }

  // Check file size (max 5MB)
  const maxSize = 5 * 1024 * 1024 // 5MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File size too large. Maximum size is 5MB'
    }
  }

  // Check if file is empty
  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty'
    }
  }

  return { valid: true }
}

/**
 * Reads a File object and returns its text content
 */
export function readCSVFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text === 'string') {
        resolve(text)
      } else {
        reject(new Error('Failed to read file as text'))
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsText(file)
  })
}

/**
 * Main function to process a CSV file upload
 */
export async function processCustomPricingFile(file: File): Promise<ParsedCSVResult> {
  // Validate file
  const validation = validateCSVFile(file)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error
    }
  }

  try {
    // Read file content
    const content = await readCSVFile(file)

    // Parse CSV
    return parseCustomPricingCSV(content)
  } catch (error) {
    return {
      success: false,
      error: `Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Generates a sample CSV template
 */
export function generateSampleCSV(): string {
  return `pokemon,cost
Pikachu,10
Charizard,25
Mewtwo,30
Dragonite,28
Garchomp,26
Tyranitar,24
Salamence,27
Gengar,22
Alakazam,20
Machamp,18`
}

/**
 * Downloads a sample CSV file
 */
export function downloadSampleCSV() {
  const csv = generateSampleCSV()
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'pokemon-pricing-template.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Checks if a string looks like a Google Sheets URL.
 */
export function isGoogleSheetsUrl(input: string): boolean {
  return input.includes('docs.google.com/spreadsheets')
}

/**
 * Fetches CSV data from a Google Sheets URL via our proxy API route.
 * The sheet must be shared publicly ("Anyone with the link").
 */
export async function fetchGoogleSheetCSV(sheetsUrl: string): Promise<ParsedCSVResult> {
  try {
    const response = await fetch(`/api/sheets?url=${encodeURIComponent(sheetsUrl)}`)
    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Failed to fetch Google Sheet (HTTP ${response.status})`
      }
    }

    if (!data.csv || typeof data.csv !== 'string') {
      return {
        success: false,
        error: 'No CSV data returned from Google Sheet'
      }
    }

    return parseCustomPricingCSV(data.csv)
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch Google Sheet: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}
