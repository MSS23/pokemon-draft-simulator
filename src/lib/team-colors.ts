/**
 * Team colors — deterministic palette assigned by draft_order.
 *
 * Used across the broadcast UI (on-the-clock header, pick reveal,
 * draft board) so every team has a stable visual identity.
 */

export interface TeamColor {
  name: string
  /** Hex base color */
  base: string
  /** Tailwind-style rgb fragment for inline alpha — "59 130 246" */
  rgb: string
  /** Bright accent for text on dark surfaces */
  accent: string
  /** Foreground text color for on-base surfaces */
  fg: string
  /** Subtle gradient stop for hero panels */
  gradient: string
}

const PALETTE: TeamColor[] = [
  { name: 'Crimson',  base: '#dc2626', rgb: '220 38 38',   accent: '#fca5a5', fg: '#ffffff', gradient: '#7f1d1d' },
  { name: 'Royal',    base: '#2563eb', rgb: '37 99 235',   accent: '#93c5fd', fg: '#ffffff', gradient: '#1e3a8a' },
  { name: 'Forest',   base: '#16a34a', rgb: '22 163 74',   accent: '#86efac', fg: '#ffffff', gradient: '#14532d' },
  { name: 'Amber',    base: '#f59e0b', rgb: '245 158 11',  accent: '#fcd34d', fg: '#1f2937', gradient: '#78350f' },
  { name: 'Violet',   base: '#7c3aed', rgb: '124 58 237',  accent: '#c4b5fd', fg: '#ffffff', gradient: '#4c1d95' },
  { name: 'Teal',     base: '#0d9488', rgb: '13 148 136',  accent: '#5eead4', fg: '#ffffff', gradient: '#134e4a' },
  { name: 'Rose',     base: '#e11d48', rgb: '225 29 72',   accent: '#fda4af', fg: '#ffffff', gradient: '#881337' },
  { name: 'Sky',      base: '#0284c7', rgb: '2 132 199',   accent: '#7dd3fc', fg: '#ffffff', gradient: '#0c4a6e' },
  { name: 'Lime',     base: '#65a30d', rgb: '101 163 13',  accent: '#bef264', fg: '#1f2937', gradient: '#365314' },
  { name: 'Fuchsia',  base: '#c026d3', rgb: '192 38 211',  accent: '#f0abfc', fg: '#ffffff', gradient: '#701a75' },
  { name: 'Slate',    base: '#475569', rgb: '71 85 105',   accent: '#cbd5e1', fg: '#ffffff', gradient: '#1e293b' },
  { name: 'Orange',   base: '#ea580c', rgb: '234 88 12',   accent: '#fdba74', fg: '#ffffff', gradient: '#7c2d12' },
]

/**
 * Returns a stable color for a team based on its draftOrder (1-indexed).
 * Falls back to hashing the team id when draftOrder is missing.
 */
export function getTeamColor(input: { id?: string; draftOrder?: number }): TeamColor {
  if (typeof input.draftOrder === 'number' && input.draftOrder > 0) {
    return PALETTE[(input.draftOrder - 1) % PALETTE.length]
  }
  if (input.id) {
    let hash = 0
    for (let i = 0; i < input.id.length; i++) {
      hash = (hash * 31 + input.id.charCodeAt(i)) | 0
    }
    return PALETTE[Math.abs(hash) % PALETTE.length]
  }
  return PALETTE[0]
}

export const TEAM_COLOR_PALETTE = PALETTE
