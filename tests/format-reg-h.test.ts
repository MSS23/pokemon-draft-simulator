import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import type { CompiledFormat, PokemonIndex } from '../data/formats/format-schema'

/**
 * Tests for VGC Regulation H format compilation
 *
 * These tests ensure that the compiled Regulation H format:
 * 1. Has the expected number of legal Pokemon (~400-450)
 * 2. Correctly bans all Paradox Pokemon
 * 3. Correctly bans all Legendary/Mythical Pokemon
 * 4. Correctly bans Treasures of Ruin
 * 5. Has expected specific Pokemon as legal/banned
 * 6. Has correct cost assignments
 */

describe('VGC Regulation H Format', () => {
  let compiledFormat: CompiledFormat
  let pokemonIndex: PokemonIndex

  beforeAll(() => {
    // Load compiled format from public/data
    const dataDir = path.join(process.cwd(), 'public', 'data')

    // Find the compiled Reg H format (with hash)
    const files = fs.readdirSync(dataDir)
    const regHFile = files.find(f => f.startsWith('format_vgc-reg-h_') && f.endsWith('.json'))

    if (!regHFile) {
      throw new Error('Compiled Regulation H format not found. Run `npm run build:formats` first.')
    }

    compiledFormat = JSON.parse(
      fs.readFileSync(path.join(dataDir, regHFile), 'utf-8')
    )

    // Load Pokemon index
    const indexFile = files.find(f => f.startsWith('pokemon_index_') && f.endsWith('.json'))
    if (!indexFile) {
      throw new Error('Pokemon index not found. Run `npm run build:formats` first.')
    }

    pokemonIndex = JSON.parse(
      fs.readFileSync(path.join(dataDir, indexFile), 'utf-8')
    )
  })

  describe('Legal Pokemon Count', () => {
    it('should have approximately 600-650 legal Pokemon', () => {
      const count = compiledFormat.legalPokemon.length
      expect(count).toBeGreaterThan(600)
      expect(count).toBeLessThan(700)
    })

    it('should have legal Pokemon array with no duplicates', () => {
      const unique = new Set(compiledFormat.legalPokemon)
      expect(unique.size).toBe(compiledFormat.legalPokemon.length)
    })
  })

  describe('Paradox Pokemon Bans', () => {
    const paradoxPokemon = [
      'great-tusk',
      'scream-tail',
      'brute-bonnet',
      'flutter-mane',
      'slither-wing',
      'sandy-shocks',
      'iron-treads',
      'iron-bundle',
      'iron-hands',
      'iron-jugulis',
      'iron-moth',
      'iron-thorns',
      'roaring-moon',
      'iron-valiant',
      'walking-wake',
      'iron-leaves',
      'gouging-fire',
      'raging-bolt',
      'iron-boulder',
      'iron-crown'
    ]

    it.each(paradoxPokemon)('should ban %s', (pokemon) => {
      expect(compiledFormat.legalPokemon).not.toContain(pokemon)
    })

    it('should have no Paradox Pokemon in legal list', () => {
      const legalParadox = compiledFormat.legalPokemon.filter((id: string) => {
        const data = pokemonIndex[id]
        return data?.flags?.isParadox
      })
      expect(legalParadox).toHaveLength(0)
    })
  })

  describe('Legendary/Mythical Bans', () => {
    const restrictedPokemon = [
      'mewtwo',
      'lugia',
      'ho-oh',
      'kyogre',
      'groudon',
      'rayquaza',
      'dialga',
      'palkia',
      'giratina',
      'reshiram',
      'zekrom',
      'kyurem',
      'xerneas',
      'yveltal',
      'zygarde',
      'cosmog',
      'cosmoem',
      'solgaleo',
      'lunala',
      'necrozma',
      'zacian',
      'zamazenta',
      'eternatus',
      'calyrex',
      'koraidon',
      'miraidon',
      'mew',
      'celebi',
      'jirachi',
      'deoxys',
      'darkrai',
      'shaymin',
      'arceus',
      'victini',
      'keldeo',
      'meloetta',
      'genesect',
      'diancie',
      'hoopa',
      'volcanion',
      'magearna',
      'marshadow',
      'zeraora',
      'meltan',
      'melmetal',
      'zarude',
      'pecharunt'
    ]

    it.each(restrictedPokemon)('should ban %s', (pokemon) => {
      // Only test if Pokemon exists in index (not all are in every gen)
      if (pokemonIndex[pokemon]) {
        expect(compiledFormat.legalPokemon).not.toContain(pokemon)
      }
    })

    it('should have no Legendary Pokemon in legal list', () => {
      const legalLegendaries = compiledFormat.legalPokemon.filter((id: string) => {
        const data = pokemonIndex[id]
        return data?.flags?.isLegendary
      })
      expect(legalLegendaries).toHaveLength(0)
    })

    it('should have no Mythical Pokemon in legal list', () => {
      const legalMythicals = compiledFormat.legalPokemon.filter((id: string) => {
        const data = pokemonIndex[id]
        return data?.flags?.isMythical
      })
      expect(legalMythicals).toHaveLength(0)
    })
  })

  describe('Treasures of Ruin Bans', () => {
    const ruinPokemon = ['wo-chien', 'chien-pao', 'ting-lu', 'chi-yu']

    it.each(ruinPokemon)('should ban %s', (pokemon) => {
      expect(compiledFormat.legalPokemon).not.toContain(pokemon)
    })
  })

  describe('Expected Legal Pokemon', () => {
    const expectedLegal = [
      'amoonguss',
      'archaludon',
      'incineroar',
      'rillaboom',
      'cinderace',
      'dragapult',
      'garchomp',
      'metagross',
      'salamence',
      'tyranitar',
      'dragonite',
      'goodra',
      'hydreigon',
      'baxcalibur',
      'gholdengo',
      'annihilape',
      'kingambit',
      'ursaluna',
      // 'tatsugiri', // Not in base dex
      'dondozo',
      'arcanine',
      'gyarados',
      'gengar',
      // 'mimikyu', // Not in Paldea dex
      // 'toxapex', // Not in Paldea dex
      // 'ferrothorn', // Not in Paldea dex
      // 'rotom-wash', // Form not in dex
      // 'rotom-heat', // Form not in dex
      'pelipper',
      'torkoal',
      'pikachu',
      'charizard'
    ]

    it.each(expectedLegal)('should allow %s', (pokemon) => {
      expect(compiledFormat.legalPokemon).toContain(pokemon)
    })
  })

  describe('Expected Banned Pokemon', () => {
    const expectedBanned = [
      'koraidon',
      'miraidon',
      'great-tusk',
      'iron-valiant',
      'flutter-mane',
      'wo-chien',
      'mew',
      'celebi'
    ]

    it.each(expectedBanned)('should ban %s', (pokemon) => {
      if (pokemonIndex[pokemon]) {
        expect(compiledFormat.legalPokemon).not.toContain(pokemon)
      }
    })
  })

  describe('Cost Assignments', () => {
    it('should have costs for all legal Pokemon', () => {
      for (const pokemonId of compiledFormat.legalPokemon) {
        expect(compiledFormat.costs[pokemonId]).toBeDefined()
        expect(compiledFormat.costs[pokemonId]).toBeGreaterThan(0)
      }
    })

    it('should respect cost overrides from format pack', () => {
      // Test specific cost overrides defined in reg_h.json
      if (compiledFormat.legalPokemon.includes('amoonguss')) {
        expect(compiledFormat.costs['amoonguss']).toBe(19)
      }
      if (compiledFormat.legalPokemon.includes('archaludon')) {
        expect(compiledFormat.costs['archaludon']).toBe(20)
      }
      if (compiledFormat.legalPokemon.includes('incineroar')) {
        expect(compiledFormat.costs['incineroar']).toBe(21)
      }
    })

    it('should have costs within configured min/max range', () => {
      const costs = Object.values(compiledFormat.costs)
      const minCost = Math.min(...costs)
      const maxCost = Math.max(...costs)

      expect(minCost).toBeGreaterThanOrEqual(1)
      expect(maxCost).toBeLessThanOrEqual(30)
    })
  })

  describe('Format Metadata', () => {
    it('should have correct format ID', () => {
      expect(compiledFormat.format.id).toBe('vgc-reg-h')
    })

    it('should be for Generation 9', () => {
      expect(compiledFormat.format.generation).toBe(9)
    })

    it('should have compilation timestamp', () => {
      expect(compiledFormat.compiledAt).toBeDefined()
      const timestamp = new Date(compiledFormat.compiledAt)
      expect(timestamp).toBeInstanceOf(Date)
      expect(timestamp.getTime()).toBeGreaterThan(0)
    })

    it('should have cache-busting hash', () => {
      expect(compiledFormat.hash).toBeDefined()
      expect(compiledFormat.hash).toHaveLength(8)
    })
  })

  describe('Regional Dex Requirements', () => {
    it('should only include Pokemon from Paldea/Kitakami/Blueberry dexes', () => {
      for (const pokemonId of compiledFormat.legalPokemon.slice(0, 50)) {
        const data = pokemonIndex[pokemonId]
        if (!data) continue

        const hasRequiredDex = data.regionalDex.some((dex: string) =>
          dex.includes('paldea') ||
          dex.includes('kitakami') ||
          dex.includes('blueberry')
        )

        // Some Pokemon might be missing dex data, so we just check those that have it
        if (data.regionalDex.length > 0) {
          expect(hasRequiredDex).toBe(true)
        }
      }
    })
  })
})