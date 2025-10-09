/**
 * Advanced Analytics System
 * Provides deep insights into draft trends, meta analysis, and team performance
 */

import type { Pokemon, Team, Draft } from '@/types'

export interface MetaAnalysis {
  topPicks: {
    pokemon: Pokemon
    pickRate: number
    avgPickPosition: number
    winRate: number
    cost: number
  }[]
  sleepers: {
    pokemon: Pokemon
    value: number // High performance relative to cost
    pickRate: number
  }[]
  overrated: {
    pokemon: Pokemon
    pickRate: number
    performance: number
  }[]
  typeDistribution: {
    type: string
    count: number
    percentage: number
    avgCost: number
  }[]
  costTrends: {
    range: string
    count: number
    avgBST: number
  }[]
  popularCombos: {
    pokemon: string[]
    frequency: number
    synergy: number
  }[]
}

export interface TeamPerformanceMetrics {
  offensiveRating: number // 0-100
  defensiveRating: number // 0-100
  speedControl: number // 0-100
  typeCoverage: number // 0-100
  synergy: number // 0-100
  budgetEfficiency: number // 0-100
  versatility: number // 0-100
  predictability: number // 0-100 (lower is better)
  overallRating: number // 0-100
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
}

export interface DraftTrends {
  earlyPickPatterns: {
    position: number
    commonTypes: string[]
    avgCost: number
    avgBST: number
  }[]
  latePickPatterns: {
    position: number
    commonTypes: string[]
    avgCost: number
    valueFinds: Pokemon[]
  }[]
  costInflation: {
    round: number
    avgCost: number
    maxCost: number
  }[]
  positionValue: {
    position: number
    value: number // Based on quality of available Pokemon
  }[]
}

export interface MatchupPrediction {
  team1: Team
  team2: Team
  team1WinProbability: number
  team2WinProbability: number
  keyMatchups: {
    attacker: Pokemon
    defender: Pokemon
    advantage: 'team1' | 'team2' | 'neutral'
    score: number
  }[]
  team1Advantages: string[]
  team2Advantages: string[]
  tippingPoints: string[]
}

/**
 * Analyze draft meta from historical data
 */
export function analyzeMetaGame(drafts: Draft[]): MetaAnalysis {
  const pickCounts = new Map<string, number>()
  const pickPositions = new Map<string, number[]>()
  const costs = new Map<string, number>()
  const typeCounts = new Map<string, number>()
  const typeCosts = new Map<string, number[]>()
  const combos = new Map<string, number>()

  // Aggregate data
  drafts.forEach(draft => {
    const draftWithTeams = draft as any // Type assertion for compatibility
    draftWithTeams.teams?.forEach((team: any) => {
      team.picks?.forEach((pick: any, index: number) => {
        const name = pick.pokemon.name

        pickCounts.set(name, (pickCounts.get(name) || 0) + 1)

        const positions = pickPositions.get(name) || []
        positions.push(index + 1)
        pickPositions.set(name, positions)

        costs.set(name, pick.pokemon.cost || 0)

        pick.pokemon.types.forEach((type: any) => {
          typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
          const tc = typeCosts.get(type) || []
          tc.push(pick.pokemon.cost || 0)
          typeCosts.set(type, tc)
        })

        // Track common combinations (pairs)
        team.picks?.forEach((otherPick: any) => {
          if (otherPick.pokemon.name !== name) {
            const combo = [name, otherPick.pokemon.name].sort().join('+')
            combos.set(combo, (combos.get(combo) || 0) + 1)
          }
        })
      })
    })
  })

  // Calculate top picks
  const totalDrafts = drafts.length
  const topPicks = Array.from(pickCounts.entries())
    .map(([name, count]) => {
      const positions = pickPositions.get(name) || []
      const avgPosition = positions.reduce((sum, p) => sum + p, 0) / positions.length
      const pickRate = (count / totalDrafts) * 100

      // Mock win rate (in real implementation, would track actual results)
      const winRate = 50 + Math.random() * 30

      return {
        pokemon: { name } as Pokemon,
        pickRate,
        avgPickPosition: avgPosition,
        winRate,
        cost: costs.get(name) || 0,
      }
    })
    .sort((a, b) => b.pickRate - a.pickRate)
    .slice(0, 20)

  // Calculate type distribution
  const typeDistribution = Array.from(typeCounts.entries())
    .map(([type, count]) => {
      const typeCostArray = typeCosts.get(type) || []
      const avgCost =
        typeCostArray.reduce((sum, c) => sum + c, 0) / typeCostArray.length

      return {
        type,
        count,
        percentage: (count / (drafts.length * 6)) * 100,
        avgCost,
      }
    })
    .sort((a, b) => b.count - a.count)

  // Calculate popular combos
  const popularCombos = Array.from(combos.entries())
    .filter(([_, freq]) => freq >= 3)
    .map(([combo, frequency]) => ({
      pokemon: combo.split('+'),
      frequency,
      synergy: 70 + Math.random() * 30, // Mock synergy score
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10)

  return {
    topPicks,
    sleepers: [],
    overrated: [],
    typeDistribution,
    costTrends: [],
    popularCombos,
  }
}

/**
 * Evaluate team performance
 */
export function evaluateTeamPerformance(
  team: Pokemon[],
  allPokemon: Pokemon[]
): TeamPerformanceMetrics {
  const ratings = {
    offensive: calculateOffensiveRating(team),
    defensive: calculateDefensiveRating(team),
    speedControl: calculateSpeedControl(team),
    typeCoverage: calculateTypeCoverageRating(team),
    synergy: calculateSynergyRating(team),
    budgetEfficiency: calculateBudgetEfficiency(team),
    versatility: calculateVersatility(team),
    predictability: calculatePredictability(team, allPokemon),
  }

  const overall =
    (ratings.offensive * 0.2 +
      ratings.defensive * 0.2 +
      ratings.speedControl * 0.15 +
      ratings.typeCoverage * 0.15 +
      ratings.synergy * 0.1 +
      ratings.budgetEfficiency * 0.1 +
      ratings.versatility * 0.05 +
      (100 - ratings.predictability) * 0.05)

  const { strengths, weaknesses, recommendations } = generateInsights(ratings, team)

  return {
    offensiveRating: Math.round(ratings.offensive),
    defensiveRating: Math.round(ratings.defensive),
    speedControl: Math.round(ratings.speedControl),
    typeCoverage: Math.round(ratings.typeCoverage),
    synergy: Math.round(ratings.synergy),
    budgetEfficiency: Math.round(ratings.budgetEfficiency),
    versatility: Math.round(ratings.versatility),
    predictability: Math.round(ratings.predictability),
    overallRating: Math.round(overall),
    strengths,
    weaknesses,
    recommendations,
  }
}

function calculateOffensiveRating(team: Pokemon[]): number {
  const avgAttack = team.reduce((sum, p) => sum + p.stats.attack, 0) / team.length
  const avgSpAtk = team.reduce((sum, p) => sum + p.stats.specialAttack, 0) / team.length

  const offensive = (avgAttack + avgSpAtk) / 2
  return Math.min(100, (offensive / 130) * 100)
}

function calculateDefensiveRating(team: Pokemon[]): number {
  const avgHP = team.reduce((sum, p) => sum + p.stats.hp, 0) / team.length
  const avgDef = team.reduce((sum, p) => sum + p.stats.defense, 0) / team.length
  const avgSpDef = team.reduce((sum, p) => sum + p.stats.specialDefense, 0) / team.length

  const bulk = (avgHP + avgDef + avgSpDef) / 3
  return Math.min(100, (bulk / 110) * 100)
}

function calculateSpeedControl(team: Pokemon[]): number {
  const speeds = team.map(p => p.stats.speed).sort((a, b) => b - a)

  // Check for speed tier diversity
  const fast = speeds.filter(s => s >= 100).length
  const mid = speeds.filter(s => s >= 60 && s < 100).length
  const slow = speeds.filter(s => s < 60).length

  // Ideal: mix of all speed tiers
  const diversity = (fast > 0 ? 33 : 0) + (mid > 0 ? 33 : 0) + (slow > 0 ? 33 : 0)

  return diversity
}

function calculateTypeCoverageRating(team: Pokemon[]): number {
  const offensiveTypes = new Set<string>()
  const defensiveTypes = new Set<string>()

  team.forEach(p => {
    p.types.forEach(t => defensiveTypes.add(t))
    p.moves?.forEach(m => offensiveTypes.add(m.type))
  })

  const offensiveCoverage = (offensiveTypes.size / 18) * 100
  const defensiveCoverage = (defensiveTypes.size / 18) * 100

  return (offensiveCoverage * 0.6 + defensiveCoverage * 0.4)
}

function calculateSynergyRating(team: Pokemon[]): number {
  let synergy = 50

  // Check for weather synergy
  const weatherSetters = team.filter(p =>
    p.abilities?.some(a =>
      ['Drought', 'Drizzle', 'Sand Stream', 'Snow Warning'].includes(a.name)
    )
  )
  const weatherAbusers = team.filter(p =>
    p.abilities?.some(a =>
      ['Swift Swim', 'Chlorophyll', 'Sand Rush', 'Slush Rush'].includes(a.name)
    )
  )

  if (weatherSetters.length > 0 && weatherAbusers.length > 0) synergy += 20

  // Check for Trick Room synergy
  const hasTrickRoom = team.some(p =>
    p.moves?.some(m => m.name.toLowerCase() === 'trick room')
  )
  const slowPokemon = team.filter(p => p.stats.speed <= 50).length

  if (hasTrickRoom && slowPokemon >= 3) synergy += 15

  return Math.min(100, synergy)
}

function calculateBudgetEfficiency(team: Pokemon[]): number {
  const totalCost = team.reduce((sum, p) => sum + (p.cost || 0), 0)
  const totalBST = team.reduce(
    (sum, p) =>
      sum +
      p.stats.hp +
      p.stats.attack +
      p.stats.defense +
      p.stats.specialAttack +
      p.stats.specialDefense +
      p.stats.speed,
    0
  )

  const avgBSTPerCost = totalCost > 0 ? totalBST / totalCost : 0
  return Math.min(100, (avgBSTPerCost / 50) * 100)
}

function calculateVersatility(team: Pokemon[]): number {
  const roles = new Set<string>()

  team.forEach(p => {
    if (p.stats.speed >= 100) roles.add('fast')
    if (p.stats.attack >= 110) roles.add('physical')
    if (p.stats.specialAttack >= 110) roles.add('special')
    if (p.stats.defense + p.stats.specialDefense + p.stats.hp >= 300) roles.add('tank')
  })

  return (roles.size / 4) * 100
}

function calculatePredictability(team: Pokemon[], allPokemon: Pokemon[]): number {
  // Lower is better
  const pickRates = team.map(p => {
    // Mock: in real implementation, would use actual pick rate data
    return 50 + Math.random() * 50
  })

  return pickRates.reduce((sum, r) => sum + r, 0) / pickRates.length
}

function generateInsights(
  ratings: Record<string, number>,
  team: Pokemon[]
): {
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
} {
  const strengths: string[] = []
  const weaknesses: string[] = []
  const recommendations: string[] = []

  if (ratings.offensive >= 70) strengths.push('Strong offensive pressure')
  else if (ratings.offensive < 50) {
    weaknesses.push('Weak offensive output')
    recommendations.push('Consider adding a strong attacker')
  }

  if (ratings.defensive >= 70) strengths.push('Excellent bulk and survivability')
  else if (ratings.defensive < 50) {
    weaknesses.push('Fragile team composition')
    recommendations.push('Add tanky Pokemon to improve survivability')
  }

  if (ratings.speedControl >= 70) strengths.push('Great speed tier diversity')
  else if (ratings.speedControl < 50) {
    weaknesses.push('Poor speed control')
    recommendations.push('Balance speed tiers with fast and slow options')
  }

  if (ratings.typeCoverage >= 70) strengths.push('Comprehensive type coverage')
  else if (ratings.typeCoverage < 50) {
    weaknesses.push('Limited type coverage')
    recommendations.push('Diversify move types for better coverage')
  }

  if (ratings.synergy >= 70) strengths.push('High team synergy')
  else if (ratings.synergy < 50) {
    weaknesses.push('Lacks cohesive strategy')
    recommendations.push('Build around weather, Trick Room, or other synergies')
  }

  return { strengths, weaknesses, recommendations }
}

/**
 * Predict matchup between two teams
 */
export function predictMatchup(team1: Pokemon[], team2: Pokemon[]): MatchupPrediction {
  const keyMatchups: MatchupPrediction['keyMatchups'] = []

  // Analyze key matchups
  team1.forEach(attacker => {
    team2.forEach(defender => {
      const score = calculateMatchupScore(attacker, defender)
      keyMatchups.push({
        attacker,
        defender,
        advantage: score > 60 ? 'team1' : score < 40 ? 'team2' : 'neutral',
        score,
      })
    })
  })

  // Calculate win probabilities
  const team1Score = keyMatchups.filter(m => m.advantage === 'team1').length
  const team2Score = keyMatchups.filter(m => m.advantage === 'team2').length
  const total = team1Score + team2Score || 1

  const team1Prob = (team1Score / total) * 100
  const team2Prob = (team2Score / total) * 100

  return {
    team1: {} as Team,
    team2: {} as Team,
    team1WinProbability: Math.round(team1Prob),
    team2WinProbability: Math.round(team2Prob),
    keyMatchups: keyMatchups.sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50)).slice(0, 5),
    team1Advantages: [],
    team2Advantages: [],
    tippingPoints: [],
  }
}

function calculateMatchupScore(attacker: Pokemon, defender: Pokemon): number {
  let score = 50

  // Type advantage
  attacker.moves?.forEach(move => {
    const effectiveness = getTypeEffectiveness(move.type, defender.types)
    if (effectiveness >= 2) score += 15
    if (effectiveness <= 0.5) score -= 15
  })

  // Speed advantage
  if (attacker.stats.speed > defender.stats.speed) score += 10
  else if (attacker.stats.speed < defender.stats.speed) score -= 10

  // Offensive vs Defensive
  const attackPower = Math.max(attacker.stats.attack, attacker.stats.specialAttack)
  const defensePower = Math.max(defender.stats.defense, defender.stats.specialDefense)

  if (attackPower > defensePower * 1.5) score += 15
  if (attackPower < defensePower * 0.66) score -= 15

  return Math.max(0, Math.min(100, score))
}

function getTypeEffectiveness(moveType: string, defenderTypes: string[]): number {
  // Simplified type chart
  const chart: Record<string, string[]> = {
    fire: ['grass', 'ice', 'bug', 'steel'],
    water: ['fire', 'ground', 'rock'],
    grass: ['water', 'ground', 'rock'],
    electric: ['water', 'flying'],
    // ... (would include full chart)
  }

  let multiplier = 1
  defenderTypes.forEach(type => {
    if (chart[moveType]?.includes(type)) multiplier *= 2
  })

  return multiplier
}

/**
 * Export analytics report
 */
export function exportAnalyticsReport(
  team: Pokemon[],
  metrics: TeamPerformanceMetrics
): string {
  const report = `
# Team Analytics Report
Generated: ${new Date().toLocaleString()}

## Overall Rating: ${metrics.overallRating}/100

## Performance Metrics
- Offensive Rating: ${metrics.offensiveRating}/100
- Defensive Rating: ${metrics.defensiveRating}/100
- Speed Control: ${metrics.speedControl}/100
- Type Coverage: ${metrics.typeCoverage}/100
- Team Synergy: ${metrics.synergy}/100
- Budget Efficiency: ${metrics.budgetEfficiency}/100

## Strengths
${metrics.strengths.map(s => `- ${s}`).join('\n')}

## Weaknesses
${metrics.weaknesses.map(w => `- ${w}`).join('\n')}

## Recommendations
${metrics.recommendations.map(r => `- ${r}`).join('\n')}

## Team Roster
${team.map(p => `- ${p.name} (${p.types.join('/')}) - BST: ${Object.values(p.stats).reduce((a, b) => a + b, 0)}`).join('\n')}
`

  return report.trim()
}
