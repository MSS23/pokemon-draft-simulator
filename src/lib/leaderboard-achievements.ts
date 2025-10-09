/**
 * Leaderboard & Achievements System
 * Tracks player stats, rankings, and unlockable achievements
 */

export interface PlayerStats {
  userId: string
  username: string
  avatar?: string
  stats: {
    totalDrafts: number
    draftsWon: number
    winRate: number
    totalPicks: number
    avgPickPosition: number
    favoritePokemon: string[]
    favoriteTypes: string[]
    avgBudgetUsed: number
    fastestDraft: number // seconds
    longestDraft: number // seconds
  }
  rankings: {
    global: number
    weekly: number
    monthly: number
  }
  achievements: Achievement[]
  createdAt: Date
  updatedAt: Date
}

export interface Achievement {
  id: string
  name: string
  description: string
  category: 'draft' | 'collection' | 'social' | 'skill' | 'special'
  icon: string
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
  points: number
  unlocked: boolean
  unlockedAt?: Date
  progress?: {
    current: number
    required: number
  }
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  username: string
  avatar?: string
  score: number
  change: number // Position change from last period
  stats: {
    wins: number
    drafts: number
    winRate: number
  }
}

/**
 * Achievement definitions
 */
export const ACHIEVEMENTS: Omit<Achievement, 'unlocked' | 'unlockedAt' | 'progress'>[] = [
  // Draft Achievements
  {
    id: 'first-draft',
    name: 'First Timer',
    description: 'Complete your first draft',
    category: 'draft',
    icon: '🎉',
    tier: 'bronze',
    points: 10,
  },
  {
    id: 'draft-veteran',
    name: 'Draft Veteran',
    description: 'Complete 10 drafts',
    category: 'draft',
    icon: '🏆',
    tier: 'silver',
    points: 50,
  },
  {
    id: 'draft-master',
    name: 'Draft Master',
    description: 'Complete 50 drafts',
    category: 'draft',
    icon: '👑',
    tier: 'gold',
    points: 200,
  },
  {
    id: 'draft-legend',
    name: 'Draft Legend',
    description: 'Complete 100 drafts',
    category: 'draft',
    icon: '⭐',
    tier: 'platinum',
    points: 500,
  },
  {
    id: 'speed-drafter',
    name: 'Speed Drafter',
    description: 'Complete a draft in under 5 minutes',
    category: 'draft',
    icon: '⚡',
    tier: 'silver',
    points: 75,
  },
  {
    id: 'perfect-draft',
    name: 'Perfect Draft',
    description: 'Win a draft without losing a single battle',
    category: 'skill',
    icon: '💯',
    tier: 'platinum',
    points: 300,
  },

  // Collection Achievements
  {
    id: 'type-specialist-water',
    name: 'Water Type Specialist',
    description: 'Draft 50 Water-type Pokemon',
    category: 'collection',
    icon: '💧',
    tier: 'silver',
    points: 50,
  },
  {
    id: 'type-specialist-fire',
    name: 'Fire Type Specialist',
    description: 'Draft 50 Fire-type Pokemon',
    category: 'collection',
    icon: '🔥',
    tier: 'silver',
    points: 50,
  },
  {
    id: 'type-specialist-grass',
    name: 'Grass Type Specialist',
    description: 'Draft 50 Grass-type Pokemon',
    category: 'collection',
    icon: '🌿',
    tier: 'silver',
    points: 50,
  },
  {
    id: 'legendary-collector',
    name: 'Legendary Collector',
    description: 'Draft 10 different Legendary Pokemon',
    category: 'collection',
    icon: '✨',
    tier: 'gold',
    points: 150,
  },
  {
    id: 'gotta-draft-em-all',
    name: 'Gotta Draft Em All',
    description: 'Draft 500 different Pokemon',
    category: 'collection',
    icon: '🎯',
    tier: 'diamond',
    points: 1000,
  },

  // Win Streak Achievements
  {
    id: 'winning-streak-3',
    name: 'On Fire',
    description: 'Win 3 drafts in a row',
    category: 'skill',
    icon: '🔥',
    tier: 'silver',
    points: 75,
  },
  {
    id: 'winning-streak-5',
    name: 'Unstoppable',
    description: 'Win 5 drafts in a row',
    category: 'skill',
    icon: '💪',
    tier: 'gold',
    points: 200,
  },
  {
    id: 'winning-streak-10',
    name: 'Legendary Streak',
    description: 'Win 10 drafts in a row',
    category: 'skill',
    icon: '👑',
    tier: 'diamond',
    points: 500,
  },

  // Social Achievements
  {
    id: 'social-butterfly',
    name: 'Social Butterfly',
    description: 'Draft with 10 different players',
    category: 'social',
    icon: '🦋',
    tier: 'silver',
    points: 50,
  },
  {
    id: 'host-master',
    name: 'Host Master',
    description: 'Host 25 drafts',
    category: 'social',
    icon: '🎪',
    tier: 'gold',
    points: 150,
  },
  {
    id: 'spectator',
    name: 'Spectator',
    description: 'Watch 10 drafts as a spectator',
    category: 'social',
    icon: '👀',
    tier: 'bronze',
    points: 25,
  },

  // Skill Achievements
  {
    id: 'budget-king',
    name: 'Budget King',
    description: 'Win a draft while spending less than 70% of your budget',
    category: 'skill',
    icon: '💰',
    tier: 'gold',
    points: 200,
  },
  {
    id: 'underdog-victory',
    name: 'Underdog Victory',
    description: 'Win a draft with the lowest-cost team',
    category: 'skill',
    icon: '🐕',
    tier: 'platinum',
    points: 300,
  },
  {
    id: 'type-master',
    name: 'Type Master',
    description: 'Win a mono-type draft',
    category: 'skill',
    icon: '🎭',
    tier: 'gold',
    points: 200,
  },
  {
    id: 'counter-picker',
    name: 'Counter Picker',
    description: 'Win 10 drafts with optimal type coverage',
    category: 'skill',
    icon: '🎯',
    tier: 'platinum',
    points: 300,
  },

  // Special Achievements
  {
    id: 'early-adopter',
    name: 'Early Adopter',
    description: 'Join during beta period',
    category: 'special',
    icon: '🌟',
    tier: 'platinum',
    points: 500,
  },
  {
    id: 'community-contributor',
    name: 'Community Contributor',
    description: 'Create 5 public draft templates',
    category: 'special',
    icon: '🤝',
    tier: 'gold',
    points: 250,
  },
  {
    id: 'tournament-champion',
    name: 'Tournament Champion',
    description: 'Win a tournament',
    category: 'special',
    icon: '🏆',
    tier: 'diamond',
    points: 1000,
  },
]

/**
 * Calculate player score for leaderboard
 */
export function calculatePlayerScore(stats: PlayerStats['stats']): number {
  let score = 0

  // Base score from wins
  score += stats.draftsWon * 100

  // Bonus for win rate
  score += stats.winRate * 10

  // Bonus for participation
  score += stats.totalDrafts * 5

  // Bonus for total picks
  score += stats.totalPicks * 2

  return Math.round(score)
}

/**
 * Check and unlock achievements
 */
export function checkAchievements(
  currentStats: PlayerStats['stats'],
  currentAchievements: Achievement[]
): Achievement[] {
  const newAchievements: Achievement[] = []

  ACHIEVEMENTS.forEach(achievementDef => {
    const existing = currentAchievements.find(a => a.id === achievementDef.id)

    if (existing?.unlocked) return

    const unlocked = checkAchievementCondition(achievementDef.id, currentStats)

    if (unlocked) {
      newAchievements.push({
        ...achievementDef,
        unlocked: true,
        unlockedAt: new Date(),
      })
    } else {
      // Calculate progress
      const progress = calculateAchievementProgress(achievementDef.id, currentStats)

      newAchievements.push({
        ...achievementDef,
        unlocked: false,
        progress,
      })
    }
  })

  return newAchievements
}

/**
 * Check if achievement condition is met
 */
function checkAchievementCondition(
  achievementId: string,
  stats: PlayerStats['stats']
): boolean {
  switch (achievementId) {
    case 'first-draft':
      return stats.totalDrafts >= 1
    case 'draft-veteran':
      return stats.totalDrafts >= 10
    case 'draft-master':
      return stats.totalDrafts >= 50
    case 'draft-legend':
      return stats.totalDrafts >= 100
    case 'speed-drafter':
      return stats.fastestDraft > 0 && stats.fastestDraft <= 300 // 5 minutes
    case 'winning-streak-3':
      // Would need streak tracking in stats
      return false
    case 'winning-streak-5':
      return false
    case 'winning-streak-10':
      return false
    default:
      return false
  }
}

/**
 * Calculate achievement progress
 */
function calculateAchievementProgress(
  achievementId: string,
  stats: PlayerStats['stats']
): { current: number; required: number } {
  switch (achievementId) {
    case 'first-draft':
      return { current: stats.totalDrafts, required: 1 }
    case 'draft-veteran':
      return { current: stats.totalDrafts, required: 10 }
    case 'draft-master':
      return { current: stats.totalDrafts, required: 50 }
    case 'draft-legend':
      return { current: stats.totalDrafts, required: 100 }
    default:
      return { current: 0, required: 1 }
  }
}

/**
 * Get leaderboard
 */
export function getLeaderboard(
  players: PlayerStats[],
  period: 'global' | 'weekly' | 'monthly' = 'global',
  limit: number = 100
): LeaderboardEntry[] {
  const sorted = players
    .map(player => ({
      rank: 0,
      userId: player.userId,
      username: player.username,
      avatar: player.avatar,
      score: calculatePlayerScore(player.stats),
      change: 0,
      stats: {
        wins: player.stats.draftsWon,
        drafts: player.stats.totalDrafts,
        winRate: player.stats.winRate,
      },
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  // Assign ranks
  sorted.forEach((entry, index) => {
    entry.rank = index + 1
  })

  return sorted
}

/**
 * Get player ranking
 */
export function getPlayerRanking(
  userId: string,
  leaderboard: LeaderboardEntry[]
): LeaderboardEntry | null {
  return leaderboard.find(entry => entry.userId === userId) || null
}

/**
 * Calculate tier from total points
 */
export function calculateTier(totalPoints: number): {
  tier: string
  nextTier: string
  pointsToNext: number
} {
  const tiers = [
    { name: 'Bronze', min: 0, max: 100 },
    { name: 'Silver', min: 100, max: 500 },
    { name: 'Gold', min: 500, max: 1500 },
    { name: 'Platinum', min: 1500, max: 3000 },
    { name: 'Diamond', min: 3000, max: 5000 },
    { name: 'Master', min: 5000, max: 10000 },
    { name: 'Grandmaster', min: 10000, max: Infinity },
  ]

  const currentTier = tiers.find(t => totalPoints >= t.min && totalPoints < t.max)!
  const currentIndex = tiers.indexOf(currentTier)
  const nextTier = tiers[currentIndex + 1] || currentTier

  return {
    tier: currentTier.name,
    nextTier: nextTier.name,
    pointsToNext: nextTier.min - totalPoints,
  }
}

/**
 * Get achievement stats
 */
export function getAchievementStats(achievements: Achievement[]): {
  total: number
  unlocked: number
  locked: number
  totalPoints: number
  earnedPoints: number
  completionRate: number
  byCategory: Record<string, { unlocked: number; total: number }>
  byTier: Record<string, { unlocked: number; total: number }>
} {
  const unlocked = achievements.filter(a => a.unlocked)
  const locked = achievements.filter(a => !a.unlocked)

  const totalPoints = achievements.reduce((sum, a) => sum + a.points, 0)
  const earnedPoints = unlocked.reduce((sum, a) => sum + a.points, 0)

  const byCategory: Record<string, { unlocked: number; total: number }> = {}
  const byTier: Record<string, { unlocked: number; total: number }> = {}

  achievements.forEach(a => {
    if (!byCategory[a.category]) {
      byCategory[a.category] = { unlocked: 0, total: 0 }
    }
    byCategory[a.category].total++
    if (a.unlocked) byCategory[a.category].unlocked++

    if (!byTier[a.tier]) {
      byTier[a.tier] = { unlocked: 0, total: 0 }
    }
    byTier[a.tier].total++
    if (a.unlocked) byTier[a.tier].unlocked++
  })

  return {
    total: achievements.length,
    unlocked: unlocked.length,
    locked: locked.length,
    totalPoints,
    earnedPoints,
    completionRate: (unlocked.length / achievements.length) * 100,
    byCategory,
    byTier,
  }
}

/**
 * Get recent achievements
 */
export function getRecentAchievements(
  achievements: Achievement[],
  limit: number = 5
): Achievement[] {
  return achievements
    .filter(a => a.unlocked && a.unlockedAt)
    .sort((a, b) => {
      const timeA = a.unlockedAt?.getTime() || 0
      const timeB = b.unlockedAt?.getTime() || 0
      return timeB - timeA
    })
    .slice(0, limit)
}

/**
 * Get next achievable achievements
 */
export function getNextAchievements(
  achievements: Achievement[],
  limit: number = 3
): Achievement[] {
  return achievements
    .filter(a => !a.unlocked && a.progress)
    .sort((a, b) => {
      const progressA = a.progress!.current / a.progress!.required
      const progressB = b.progress!.current / b.progress!.required
      return progressB - progressA
    })
    .slice(0, limit)
}

/**
 * Export player profile
 */
export function exportPlayerProfile(player: PlayerStats): string {
  const achievementStats = getAchievementStats(player.achievements)
  const tier = calculateTier(achievementStats.earnedPoints)

  return `
# Player Profile: ${player.username}

## Stats
- Total Drafts: ${player.stats.totalDrafts}
- Wins: ${player.stats.draftsWon}
- Win Rate: ${player.stats.winRate.toFixed(1)}%
- Total Picks: ${player.stats.totalPicks}

## Rankings
- Global: #${player.rankings.global}
- Weekly: #${player.rankings.weekly}
- Monthly: #${player.rankings.monthly}

## Achievements
- Unlocked: ${achievementStats.unlocked}/${achievementStats.total}
- Completion: ${achievementStats.completionRate.toFixed(1)}%
- Points: ${achievementStats.earnedPoints}/${achievementStats.totalPoints}
- Tier: ${tier.tier}

## Favorite Pokemon
${player.stats.favoritePokemon.slice(0, 5).join(', ')}

## Favorite Types
${player.stats.favoriteTypes.slice(0, 3).join(', ')}
`.trim()
}
