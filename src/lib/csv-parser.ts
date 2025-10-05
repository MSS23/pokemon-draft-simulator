/**
 * CSV Parser for Custom Pokemon Pricing
 *
 * Expected CSV format:
 * pokemon,cost
 * Pikachu,10
 * Charizard,25
 * Mewtwo,30
 */

export interface PokemonPricing {
  [pokemonNameOrId: string]: number
}

export interface ParsedCSVResult {
  success: boolean
  data?: PokemonPricing
  error?: string
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
function normalizePokemonName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.\s-]+/g, '')
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
}

/**
 * Parses CSV content and returns Pokemon pricing data
 */
export function parseCustomPricingCSV(csvContent: string): ParsedCSVResult {
  try {
    const lines = csvContent.trim().split('\n')

    if (lines.length === 0) {
      return {
        success: false,
        error: 'CSV file is empty'
      }
    }

    // Parse header
    const header = lines[0].toLowerCase().trim()
    const headerParts = header.split(',').map(h => h.trim())

    // Validate header format
    const pokemonColIndex = headerParts.findIndex(h =>
      h === 'pokemon' || h === 'name' || h === 'pokemon_name'
    )
    const costColIndex = headerParts.findIndex(h =>
      h === 'cost' || h === 'points' || h === 'price' || h === 'value'
    )

    if (pokemonColIndex === -1 || costColIndex === -1) {
      return {
        success: false,
        error: 'Invalid CSV header. Expected columns: "pokemon" and "cost" (or similar)'
      }
    }

    // Parse data rows
    const pricing: PokemonPricing = {}
    const errors: string[] = []
    const costs: number[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()

      // Skip empty lines
      if (!line) continue

      const parts = line.split(',').map(p => p.trim())

      if (parts.length < 2) {
        errors.push(`Line ${i + 1}: Invalid format - expected at least 2 columns`)
        continue
      }

      const pokemonName = parts[pokemonColIndex]
      const costStr = parts[costColIndex]

      // Validate pokemon name
      if (!pokemonName || pokemonName.length === 0) {
        errors.push(`Line ${i + 1}: Missing Pokemon name`)
        continue
      }

      // Validate and parse cost
      const cost = parseInt(costStr)
      if (isNaN(cost)) {
        errors.push(`Line ${i + 1}: Invalid cost value "${costStr}" for ${pokemonName}`)
        continue
      }

      if (cost < 0) {
        errors.push(`Line ${i + 1}: Cost cannot be negative for ${pokemonName}`)
        continue
      }

      if (cost > 1000) {
        errors.push(`Line ${i + 1}: Cost seems too high (${cost}) for ${pokemonName}`)
        continue
      }

      // Normalize and store
      const normalizedName = normalizePokemonName(pokemonName)

      // Check for duplicates
      if (pricing[normalizedName] !== undefined) {
        errors.push(`Line ${i + 1}: Duplicate Pokemon "${pokemonName}" (already defined with cost ${pricing[normalizedName]})`)
        continue
      }

      pricing[normalizedName] = cost
      costs.push(cost)
    }

    // Check if we have any valid data
    if (Object.keys(pricing).length === 0) {
      return {
        success: false,
        error: 'No valid Pokemon pricing found in CSV. Errors:\n' + errors.join('\n')
      }
    }

    // Calculate statistics
    const stats = {
      totalPokemon: Object.keys(pricing).length,
      minCost: Math.min(...costs),
      maxCost: Math.max(...costs),
      avgCost: Math.round(costs.reduce((a, b) => a + b, 0) / costs.length)
    }

    // Warn about errors but still return data if we have some
    if (errors.length > 0) {
      console.warn('CSV parsing completed with warnings:', errors)
    }

    return {
      success: true,
      data: pricing,
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
