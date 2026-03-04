/**
 * Shared team color system for consistent visual identity across the app.
 * Each team gets a unique color set based on its index in the draft order.
 */

export interface TeamColorSet {
  bg: string
  border: string
  text: string
  badge: string
  hex: string
}

export const TEAM_COLORS: TeamColorSet[] = [
  { bg: 'bg-blue-500/10', border: 'border-l-blue-500', text: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300', hex: '#3b82f6' },
  { bg: 'bg-rose-500/10', border: 'border-l-rose-500', text: 'text-rose-600 dark:text-rose-400', badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300', hex: '#f43f5e' },
  { bg: 'bg-emerald-500/10', border: 'border-l-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300', hex: '#10b981' },
  { bg: 'bg-amber-500/10', border: 'border-l-amber-500', text: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300', hex: '#f59e0b' },
  { bg: 'bg-purple-500/10', border: 'border-l-purple-500', text: 'text-purple-600 dark:text-purple-400', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300', hex: '#a855f7' },
  { bg: 'bg-cyan-500/10', border: 'border-l-cyan-500', text: 'text-cyan-600 dark:text-cyan-400', badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300', hex: '#06b6d4' },
  { bg: 'bg-orange-500/10', border: 'border-l-orange-500', text: 'text-orange-600 dark:text-orange-400', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300', hex: '#f97316' },
  { bg: 'bg-pink-500/10', border: 'border-l-pink-500', text: 'text-pink-600 dark:text-pink-400', badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300', hex: '#ec4899' },
]

export function getTeamColor(index: number): TeamColorSet {
  return TEAM_COLORS[index % TEAM_COLORS.length]
}

export function buildTeamColorMap(teamIds: string[]): Map<string, TeamColorSet> {
  const map = new Map<string, TeamColorSet>()
  teamIds.forEach((teamId, idx) => {
    map.set(teamId, TEAM_COLORS[idx % TEAM_COLORS.length])
  })
  return map
}
