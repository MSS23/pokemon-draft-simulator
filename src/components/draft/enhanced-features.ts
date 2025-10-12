/**
 * Enhanced Draft Features - Export Index
 *
 * Centralized exports for all enhanced UI features.
 * Import from this file for convenience.
 */

// Components
export { default as DraftStatistics } from './DraftStatistics'
export { default as TeamBuilderView } from './TeamBuilderView'
export { default as DraftReplay } from './DraftReplay'
export { default as MobileDraftView } from './MobileDraftView'
export { default as HelpOverlay } from './HelpOverlay'

// Hooks
export { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
export type { KeyboardShortcutConfig } from '@/hooks/useKeyboardShortcuts'
export { useDraftStats } from '@/hooks/useDraftStats'
export type { TeamStats, DraftStats } from '@/hooks/useDraftStats'

// Utilities
export {
  getWeaknesses,
  getResistances,
  getImmunities,
  analyzeTeamTypeCoverage,
  getTypeEffectiveness,
  TYPE_CHART
} from '@/utils/type-effectiveness'
export type { PokemonTypeName, TypeCoverage } from '@/utils/type-effectiveness'

// Notifications
export { notify, default as notifications } from '@/lib/notifications'
export type { NotificationOptions } from '@/lib/notifications'
