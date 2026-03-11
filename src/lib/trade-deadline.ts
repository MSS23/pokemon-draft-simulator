/**
 * Trade Deadline Utility
 *
 * Implements per-week trade deadlines:
 * - Trades lock on Sunday (match day) each week
 * - Trades reopen when the commissioner advances to the next gameweek
 * - Admin/commissioner can override the deadline
 */

/**
 * Check if the weekly trade window is currently open.
 * Trades are locked on Sunday (day 0) to prevent last-minute roster changes
 * before match day.
 */
export function isWeeklyTradeWindowOpen(): boolean {
  const now = new Date()
  const day = now.getDay() // 0 = Sunday
  return day !== 0
}

/**
 * Get the next trade deadline (upcoming Sunday at 00:00 local time).
 */
export function getNextTradeDeadline(): Date {
  const now = new Date()
  const day = now.getDay()
  const daysUntilSunday = day === 0 ? 0 : 7 - day
  const deadline = new Date(now)
  deadline.setDate(deadline.getDate() + daysUntilSunday)
  deadline.setHours(0, 0, 0, 0)
  return deadline
}

/**
 * Format the trade deadline for display.
 * Returns a human-readable string like "Saturday 11:59 PM" or "Today (Sunday) - Locked"
 */
export function formatTradeDeadline(): string {
  const now = new Date()
  const day = now.getDay()

  if (day === 0) {
    return 'Locked (Sunday - Match Day)'
  }

  const deadline = getNextTradeDeadline()
  const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntil <= 1) {
    return 'Tomorrow (Sunday) - Last day to trade'
  }

  return `${daysUntil} days until deadline (Sunday)`
}

/**
 * Full trade eligibility check combining all deadline rules.
 */
export function canTrade(options: {
  enableTrades?: boolean
  weeklyTradeDeadline?: boolean
  tradeDeadlineWeek?: number
  currentWeek?: number
  isCommissioner?: boolean
  adminOverrideTradeDeadline?: boolean
}): { allowed: boolean; reason?: string } {
  const {
    enableTrades,
    weeklyTradeDeadline,
    tradeDeadlineWeek,
    currentWeek,
    isCommissioner,
    adminOverrideTradeDeadline,
  } = options

  // Trades disabled entirely
  if (enableTrades === false) {
    return { allowed: false, reason: 'Trades are disabled for this league' }
  }

  // Hard week deadline (e.g., no trades after week 4)
  if (tradeDeadlineWeek && currentWeek && currentWeek > tradeDeadlineWeek) {
    if (isCommissioner && adminOverrideTradeDeadline) {
      return { allowed: true, reason: 'Admin override - past season trade deadline' }
    }
    return { allowed: false, reason: `Trade deadline passed (Week ${tradeDeadlineWeek})` }
  }

  // Weekly Sunday deadline
  if (weeklyTradeDeadline && !isWeeklyTradeWindowOpen()) {
    if (isCommissioner && adminOverrideTradeDeadline) {
      return { allowed: true, reason: 'Admin override - Sunday trade lock bypassed' }
    }
    return { allowed: false, reason: 'Trade window closed (Sunday - Match Day). Trades reopen Monday.' }
  }

  return { allowed: true }
}
