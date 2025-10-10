/**
 * Format Export Service
 * Exports Pokemon formats as CSV files for easy editing and custom format creation
 */

import { fetchPokemonForFormat } from './pokemon-api'
import { getFormatById } from './formats'
import { createFormatRulesEngine } from '@/domain/rules'

interface PokemonExportRow {
  pokemonName: string
  pokemonId: string | number
  draftPoints: number
  types: string
  bst: number
  tier?: string
  isLegal: boolean
}

/**
 * Generate CSV content for a Pokemon format
 */
export async function exportFormatToCSV(
  formatId: string,
  options: {
    includeIllegal?: boolean // Include banned/illegal Pokemon
    includeTier?: boolean    // Include tier information
    includeBST?: boolean     // Include base stat total
  } = {}
): Promise<string> {
  const {
    includeIllegal = false,
    includeTier = true,
    includeBST = true
  } = options

  // Get format configuration
  const format = getFormatById(formatId)
  if (!format) {
    throw new Error(`Format ${formatId} not found`)
  }

  // Load all Pokemon for the format
  const allPokemon = await fetchPokemonForFormat(formatId, 1025) // Fetch all Pokemon

  // Create rules engine to check legality
  const rulesEngine = createFormatRulesEngine(format.id)

  // Build export rows
  const rows: PokemonExportRow[] = []

  for (const pokemon of allPokemon) {
    const isLegal = rulesEngine.isLegal(pokemon)

    // Skip illegal Pokemon unless requested
    if (!isLegal && !includeIllegal) {
      continue
    }

    const bst = pokemon.stats.hp +
                pokemon.stats.attack +
                pokemon.stats.defense +
                pokemon.stats.specialAttack +
                pokemon.stats.specialDefense +
                pokemon.stats.speed

    rows.push({
      pokemonName: pokemon.name,
      pokemonId: pokemon.id,
      draftPoints: pokemon.cost || 0,
      types: pokemon.types.map(t => typeof t === 'string' ? t : t.name).join('/'),
      bst: bst,
      tier: pokemon.tier,
      isLegal: isLegal
    })
  }

  // Sort by draft points descending, then by name
  rows.sort((a, b) => {
    if (b.draftPoints !== a.draftPoints) {
      return b.draftPoints - a.draftPoints
    }
    return a.pokemonName.localeCompare(b.pokemonName)
  })

  // Generate CSV header
  const headers = ['Pokemon Name', 'Pokemon ID', 'Draft Points', 'Types']
  if (includeBST) headers.push('BST')
  if (includeTier) headers.push('Tier')
  if (includeIllegal) headers.push('Legal')

  // Generate CSV rows
  const csvRows = [headers.join(',')]

  for (const row of rows) {
    const values = [
      `"${row.pokemonName}"`,
      row.pokemonId.toString(),
      row.draftPoints.toString(),
      `"${row.types}"`
    ]
    if (includeBST) values.push(row.bst.toString())
    if (includeTier) values.push(`"${row.tier || 'Untiered'}"`)
    if (includeIllegal) values.push(row.isLegal ? 'Yes' : 'No')

    csvRows.push(values.join(','))
  }

  return csvRows.join('\n')
}

/**
 * Download format as CSV file
 */
export function downloadFormatCSV(formatId: string, csvContent: string): void {
  const fileName = `${formatId}-pokemon-pricing.csv`

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', fileName)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}

/**
 * Export format with progress callback
 */
export async function exportFormatWithProgress(
  formatId: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<string> {
  const format = getFormatById(formatId)
  if (!format) {
    throw new Error(`Format ${formatId} not found`)
  }

  // Notify start
  if (onProgress) onProgress(0, 100)

  // Load Pokemon
  if (onProgress) onProgress(25, 100)
  const allPokemon = await fetchPokemonForFormat(formatId, 1025)

  // Process data
  if (onProgress) onProgress(50, 100)
  const rulesEngine = createFormatRulesEngine(format.id)

  const rows: PokemonExportRow[] = allPokemon
    .filter(p => rulesEngine.isLegal(p))
    .map(pokemon => {
      const bst = pokemon.stats.hp +
                  pokemon.stats.attack +
                  pokemon.stats.defense +
                  pokemon.stats.specialAttack +
                  pokemon.stats.specialDefense +
                  pokemon.stats.speed

      return {
        pokemonName: pokemon.name,
        pokemonId: pokemon.id,
        draftPoints: pokemon.cost || 0,
        types: pokemon.types.map(t => typeof t === 'string' ? t : t.name).join('/'),
        bst: bst,
        tier: pokemon.tier,
        isLegal: true
      }
    })
    .sort((a, b) => {
      if (b.draftPoints !== a.draftPoints) {
        return b.draftPoints - a.draftPoints
      }
      return a.pokemonName.localeCompare(b.pokemonName)
    })

  // Generate CSV
  if (onProgress) onProgress(75, 100)

  const headers = ['Pokemon Name', 'Pokemon ID', 'Draft Points', 'Types', 'BST', 'Tier']
  const csvRows = [headers.join(',')]

  for (const row of rows) {
    const values = [
      `"${row.pokemonName}"`,
      row.pokemonId.toString(),
      row.draftPoints.toString(),
      `"${row.types}"`,
      row.bst.toString(),
      `"${row.tier || 'Untiered'}"`
    ]
    csvRows.push(values.join(','))
  }

  if (onProgress) onProgress(100, 100)

  return csvRows.join('\n')
}

/**
 * Create a template CSV for custom format creation
 */
export function createCustomFormatTemplate(): string {
  const headers = [
    'Pokemon Name',
    'Pokemon ID',
    'Draft Points',
    'Notes (optional)'
  ]

  const exampleRows = [
    '"Pikachu",25,5,"Iconic starter Pokemon"',
    '"Charizard",6,15,"Popular fire/flying type"',
    '"Mewtwo",150,30,"Legendary psychic type"',
    '"Eevee",133,8,"Multi-evolution Pokemon"'
  ]

  const instructions = [
    '# Instructions for creating a custom format:',
    '# 1. Fill in Pokemon Name and Pokemon ID (get from PokeAPI or any Pokedex)',
    '# 2. Assign Draft Points based on your desired balance (1-50 typical range)',
    '# 3. Add any notes for your reference (optional)',
    '# 4. Upload this CSV when creating a custom format draft',
    '# 5. Lines starting with # are ignored',
    ''
  ]

  return [...instructions, headers.join(','), ...exampleRows].join('\n')
}

/**
 * Validate uploaded custom format CSV
 */
export function validateCustomFormatCSV(csvContent: string): {
  valid: boolean
  errors: string[]
  pokemonCount: number
} {
  const errors: string[] = []
  let pokemonCount = 0

  const lines = csvContent.split('\n').filter(line =>
    line.trim() && !line.trim().startsWith('#')
  )

  if (lines.length < 2) {
    errors.push('CSV must have at least a header row and one Pokemon row')
    return { valid: false, errors, pokemonCount: 0 }
  }

  // Validate header
  const header = lines[0].toLowerCase()
  const requiredColumns = ['pokemon name', 'draft points']

  for (const col of requiredColumns) {
    if (!header.includes(col)) {
      errors.push(`Missing required column: ${col}`)
    }
  }

  // Validate data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))

    if (values.length < 2) {
      errors.push(`Row ${i + 1}: Invalid format, need at least name and points`)
      continue
    }

    const pokemonName = values[0]
    const draftPoints = parseInt(values[2] || values[1])

    if (!pokemonName) {
      errors.push(`Row ${i + 1}: Pokemon name is required`)
    }

    if (isNaN(draftPoints) || draftPoints < 0) {
      errors.push(`Row ${i + 1}: Draft points must be a positive number`)
    }

    pokemonCount++
  }

  return {
    valid: errors.length === 0,
    errors,
    pokemonCount
  }
}
