import { supabase } from './supabase'
import { createLogger } from '@/lib/logger'

const log = createLogger('TeamSheetService')

export interface TeamSheetPokemon {
  name: string
  item: string
  ability: string
  teraType: string
  moves: [string, string, string, string]
}

export type TeamSheet = TeamSheetPokemon[]

/**
 * Team sheets are stored as JSON in drafts.settings.teamSheets[teamId]
 * This avoids any schema changes.
 */
export class TeamSheetService {
  /**
   * Submit or update a team sheet for a player in a tournament
   */
  static async submitTeamSheet(draftId: string, teamId: string, sheet: TeamSheet): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')
    if (sheet.length < 1 || sheet.length > 6) throw new Error('Team must have 1-6 Pokemon')

    // Validate each Pokemon has required fields
    for (const mon of sheet) {
      if (!mon.name.trim()) throw new Error('Each Pokemon must have a name')
      if (!mon.ability.trim()) throw new Error(`${mon.name} needs an ability`)
      if (mon.moves.filter(m => m.trim()).length < 1) throw new Error(`${mon.name} needs at least 1 move`)
    }

    // Read current settings
    const { data: draft, error: readErr } = await supabase
      .from('drafts')
      .select('settings')
      .eq('id', draftId)
      .single()

    if (readErr || !draft) throw new Error('Tournament not found')

    const settings = (draft.settings ?? {}) as Record<string, unknown>
    const teamSheets = (settings.teamSheets ?? {}) as Record<string, TeamSheet>
    teamSheets[teamId] = sheet

    const { error: updateErr } = await supabase
      .from('drafts')
      .update({
        settings: { ...settings, teamSheets } as Record<string, unknown>,
      })
      .eq('id', draftId)

    if (updateErr) {
      log.error('Failed to save team sheet:', updateErr)
      throw new Error('Failed to save team sheet')
    }
  }

  /**
   * Get a single player's team sheet
   */
  static async getTeamSheet(draftId: string, teamId: string): Promise<TeamSheet | null> {
    if (!supabase) return null

    const { data } = await supabase
      .from('drafts')
      .select('settings')
      .eq('id', draftId)
      .single()

    if (!data?.settings) return null
    const settings = data.settings as Record<string, unknown>
    const teamSheets = (settings.teamSheets ?? {}) as Record<string, TeamSheet>
    return teamSheets[teamId] || null
  }

  /**
   * Get all team sheets for a tournament
   */
  static async getAllTeamSheets(draftId: string): Promise<Record<string, TeamSheet>> {
    if (!supabase) return {}

    const { data } = await supabase
      .from('drafts')
      .select('settings')
      .eq('id', draftId)
      .single()

    if (!data?.settings) return {}
    const settings = data.settings as Record<string, unknown>
    return (settings.teamSheets ?? {}) as Record<string, TeamSheet>
  }

  /**
   * Format a team sheet as Pokepaste text (for copy to clipboard)
   */
  static toPokepaste(sheet: TeamSheet): string {
    return sheet.map(mon => {
      const lines = []
      lines.push(mon.item ? `${mon.name} @ ${mon.item}` : mon.name)
      lines.push(`Ability: ${mon.ability}`)
      if (mon.teraType) lines.push(`Tera Type: ${mon.teraType}`)
      for (const move of mon.moves) {
        if (move.trim()) lines.push(`- ${move}`)
      }
      return lines.join('\n')
    }).join('\n\n')
  }
}
