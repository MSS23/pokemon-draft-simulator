import { supabase } from './supabase'
import { createLogger } from '@/lib/logger'

const log = createLogger('TeamSheetService')

export interface TeamSheetPokemon {
  name: string
  item: string
  ability: string
  teraType: string
  moves: [string, string, string, string]
  nature?: string
  evs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }
  ivs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }
  level?: number
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

    // Validate each Pokemon has required fields, and no duplicates
    const seen = new Set<string>()
    for (const mon of sheet) {
      if (!mon.name.trim()) throw new Error('Each Pokemon must have a name')
      if (!mon.ability.trim()) throw new Error(`${mon.name} needs an ability`)
      if (mon.moves.filter(m => m.trim()).length < 1) throw new Error(`${mon.name} needs at least 1 move`)
      const key = mon.name.trim().toLowerCase()
      if (seen.has(key)) throw new Error(`${mon.name} appears more than once`)
      seen.add(key)
    }

    // Draft leagues: sheet entries must come from the team's drafted roster
    const { data: picks } = await supabase
      .from('picks')
      .select('pokemon_name')
      .eq('team_id', teamId)
    if (picks && picks.length > 0) {
      const roster = new Set(picks.map(p => p.pokemon_name.trim().toLowerCase()))
      for (const mon of sheet) {
        if (!roster.has(mon.name.trim().toLowerCase())) {
          throw new Error(`${mon.name} is not on this team's drafted roster`)
        }
      }
    }

    // Owner-scoped atomic write (RLS blocks direct drafts.settings updates
    // for non-hosts, and read-modify-write raced between players)
    const { error: rpcError } = await supabase.rpc('submit_team_sheet' as never, {
      p_draft_id: draftId,
      p_team_id: teamId,
      p_sheet: sheet,
    } as never)

    if (rpcError && rpcError.code === 'PGRST202') {
      // Migration not applied yet — legacy read-modify-write fallback
      const { data: draft, error: readErr } = await supabase
        .from('drafts')
        .select('settings')
        .eq('id', draftId)
        .maybeSingle()
      if (readErr || !draft) throw new Error('Tournament not found')

      const settings = (draft.settings ?? {}) as Record<string, unknown>
      const teamSheets = (settings.teamSheets ?? {}) as Record<string, TeamSheet>
      teamSheets[teamId] = sheet

      const { error: updateErr, data: updated } = await supabase
        .from('drafts')
        .update({ settings: { ...settings, teamSheets } as Record<string, unknown> })
        .eq('id', draftId)
        .select('id')
      if (updateErr) {
        log.error('Failed to save team sheet:', updateErr)
        throw new Error('Failed to save team sheet')
      }
      if (!updated || updated.length === 0) {
        throw new Error('Not allowed to save this team sheet')
      }
    } else if (rpcError) {
      log.error('Failed to save team sheet:', rpcError)
      throw new Error(rpcError.message || 'Failed to save team sheet')
    }
  }

  /**
   * Get a single player's team sheet
   */
  static async getTeamSheet(draftId: string, teamId: string): Promise<TeamSheet | null> {
    if (!supabase) return null

    const { data, error } = await supabase
      .from('drafts')
      .select('settings')
      .eq('id', draftId)
      .maybeSingle()

    if (error) {
      log.warn('Could not load team sheet:', error)
      return null
    }
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

    const { data, error } = await supabase
      .from('drafts')
      .select('settings')
      .eq('id', draftId)
      .maybeSingle()

    if (error) {
      log.warn('Could not load tournament team sheets:', error)
      return {}
    }
    if (!data?.settings) return {}
    const settings = data.settings as Record<string, unknown>
    return (settings.teamSheets ?? {}) as Record<string, TeamSheet>
  }

  /**
   * Format a team sheet as Pokepaste text (for copy to clipboard)
   */
  static toPokepaste(sheet: TeamSheet, includeSpread = true): string {
    return sheet.map(mon => {
      const lines = []
      lines.push(mon.item ? `${mon.name} @ ${mon.item}` : mon.name)
      lines.push(`Ability: ${mon.ability}`)
      if (mon.level && mon.level !== 50) lines.push(`Level: ${mon.level}`)
      if (mon.teraType) lines.push(`Tera Type: ${mon.teraType}`)
      if (includeSpread) {
        if (mon.evs) {
          const evParts = Object.entries(mon.evs)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`)
          if (evParts.length > 0) lines.push(`EVs: ${evParts.join(' / ')}`)
        }
        if (mon.nature) lines.push(`${mon.nature} Nature`)
        if (mon.ivs) {
          const ivParts = Object.entries(mon.ivs)
            .filter(([, v]) => v !== 31)
            .map(([k, v]) => `${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`)
          if (ivParts.length > 0) lines.push(`IVs: ${ivParts.join(' / ')}`)
        }
      }
      for (const move of mon.moves) {
        if (move.trim()) lines.push(`- ${move}`)
      }
      return lines.join('\n')
    }).join('\n\n')
  }
}
