/**
 * Typed accessor for the JSON `settings` column on the `drafts` table.
 *
 * The column is stored as `jsonb` and typed as `Json | null` in the generated
 * Supabase types, so every consumer was casting via `(draft.settings as any)`.
 * This helper centralises that cast and provides a typed return value.
 */

export interface DraftSettings {
  timeLimit?: number
  pokemonPerTeam?: number
  maxPokemonPerTeam?: number
  formatId?: string
  draftType?: string
  budgetPerTeam?: number
}

const DEFAULTS: Required<Pick<DraftSettings, 'timeLimit' | 'pokemonPerTeam'>> = {
  timeLimit: 60,
  pokemonPerTeam: 6,
}

/**
 * Safely extract typed settings from the raw `draft.settings` JSON column.
 *
 * @param raw  The `settings` value from a Supabase draft row (typed as `Json | null`).
 * @returns    A `DraftSettings` object with defaults applied.
 *
 * @example
 * ```ts
 * const s = extractDraftSettings(dbState.draft.settings)
 * s.timeLimit   // number (defaults to 60)
 * s.pokemonPerTeam // number (defaults to 6)
 * ```
 */
export function extractDraftSettings(raw: unknown): DraftSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULTS }
  }

  const obj = raw as Record<string, unknown>

  return {
    timeLimit: typeof obj.timeLimit === 'number' ? obj.timeLimit : DEFAULTS.timeLimit,
    pokemonPerTeam: typeof obj.pokemonPerTeam === 'number' ? obj.pokemonPerTeam : DEFAULTS.pokemonPerTeam,
    maxPokemonPerTeam: typeof obj.maxPokemonPerTeam === 'number' ? obj.maxPokemonPerTeam : undefined,
    formatId: typeof obj.formatId === 'string' ? obj.formatId : undefined,
    draftType: typeof obj.draftType === 'string' ? obj.draftType : undefined,
    budgetPerTeam: typeof obj.budgetPerTeam === 'number' ? obj.budgetPerTeam : undefined,
  }
}
