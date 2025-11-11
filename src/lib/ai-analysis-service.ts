/**
 * AI Analysis Service
 *
 * Provides intelligent analysis of teams and matchups using
 * Pokemon type effectiveness, base stats, and league performance data.
 *
 * Note: This is a rule-based AI system, not using external AI APIs.
 * It analyzes Pokemon types, stats, and performance to generate insights.
 */

import { LeagueStatsService } from './league-stats-service'
import type { AdvancedTeamStats, HeadToHeadRecord, TeamFormIndicator } from './league-stats-service'
import type { Pick, Team } from '@/types'

interface TypeEffectiveness {
  [key: string]: {
    weakTo: string[]
    resistsTo: string[]
    immuneTo: string[]
  }
}

// Simplified type chart (major weaknesses/resistances)
const TYPE_CHART: TypeEffectiveness = {
  normal: { weakTo: ['fighting'], resistsTo: [], immuneTo: ['ghost'] },
  fire: { weakTo: ['water', 'ground', 'rock'], resistsTo: ['fire', 'grass', 'ice', 'bug', 'steel', 'fairy'], immuneTo: [] },
  water: { weakTo: ['electric', 'grass'], resistsTo: ['fire', 'water', 'ice', 'steel'], immuneTo: [] },
  electric: { weakTo: ['ground'], resistsTo: ['electric', 'flying', 'steel'], immuneTo: [] },
  grass: { weakTo: ['fire', 'ice', 'poison', 'flying', 'bug'], resistsTo: ['water', 'electric', 'grass', 'ground'], immuneTo: [] },
  ice: { weakTo: ['fire', 'fighting', 'rock', 'steel'], resistsTo: ['ice'], immuneTo: [] },
  fighting: { weakTo: ['flying', 'psychic', 'fairy'], resistsTo: ['bug', 'rock', 'dark'], immuneTo: [] },
  poison: { weakTo: ['ground', 'psychic'], resistsTo: ['grass', 'fighting', 'poison', 'bug', 'fairy'], immuneTo: [] },
  ground: { weakTo: ['water', 'grass', 'ice'], resistsTo: ['poison', 'rock'], immuneTo: ['electric'] },
  flying: { weakTo: ['electric', 'ice', 'rock'], resistsTo: ['grass', 'fighting', 'bug'], immuneTo: ['ground'] },
  psychic: { weakTo: ['bug', 'ghost', 'dark'], resistsTo: ['fighting', 'psychic'], immuneTo: [] },
  bug: { weakTo: ['fire', 'flying', 'rock'], resistsTo: ['grass', 'fighting', 'ground'], immuneTo: [] },
  rock: { weakTo: ['water', 'grass', 'fighting', 'ground', 'steel'], resistsTo: ['normal', 'fire', 'poison', 'flying'], immuneTo: [] },
  ghost: { weakTo: ['ghost', 'dark'], resistsTo: ['poison', 'bug'], immuneTo: ['normal', 'fighting'] },
  dragon: { weakTo: ['ice', 'dragon', 'fairy'], resistsTo: ['fire', 'water', 'electric', 'grass'], immuneTo: [] },
  dark: { weakTo: ['fighting', 'bug', 'fairy'], resistsTo: ['ghost', 'dark'], immuneTo: ['psychic'] },
  steel: { weakTo: ['fire', 'fighting', 'ground'], resistsTo: ['normal', 'grass', 'ice', 'flying', 'psychic', 'bug', 'rock', 'dragon', 'steel', 'fairy'], immuneTo: ['poison'] },
  fairy: { weakTo: ['poison', 'steel'], resistsTo: ['fighting', 'bug', 'dark'], immuneTo: ['dragon'] }
}

export interface TeamAnalysis {
  teamId: string
  teamName: string

  // Overall assessment
  overallRating: number  // 0-100
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]

  // Type coverage
  offensiveCoverage: {
    score: number  // 0-100
    goodAgainst: string[]
    poorAgainst: string[]
  }
  defensiveCoverage: {
    score: number  // 0-100
    resistances: Array<{ type: string; count: number }>
    weaknesses: Array<{ type: string; count: number }>
  }

  // Pokemon analysis
  topPerformers: Array<{
    pokemonName: string
    reason: string
  }>
  underperformers: Array<{
    pokemonName: string
    reason: string
  }>

  // Strategic insights
  playstyle: 'offensive' | 'defensive' | 'balanced'
  recommendedStrategy: string
}

export interface MatchupPrediction {
  homeTeamId: string
  homeTeamName: string
  awayTeamId: string
  awayTeamName: string

  // Prediction
  predictedWinner: 'home' | 'away' | 'toss_up'
  confidence: number  // 0-100
  predictedScore: { home: number; away: number }

  // Analysis factors
  factors: Array<{
    category: string
    advantage: 'home' | 'away' | 'neutral'
    description: string
    impact: number  // 0-10
  }>

  // Key matchups
  keyMatchups: Array<{
    homePokemon: string
    awayPokemon: string
    advantage: 'home' | 'away' | 'neutral'
    reasoning: string
  }>

  // Recommendations
  homeTeamAdvice: string[]
  awayTeamAdvice: string[]

  // Historical context
  historicalRecord?: {
    homeWins: number
    awayWins: number
    draws: number
    lastMeeting?: string
  }
}

export class AIAnalysisService {
  /**
   * Analyze a team's composition and performance
   */
  static async analyzeTeam(
    teamId: string,
    picks: Pick[],
    stats?: AdvancedTeamStats
  ): Promise<TeamAnalysis> {
    // Fetch stats if not provided
    if (!stats) {
      const fetchedStats = await LeagueStatsService.getAdvancedTeamStats(teamId)
      if (!fetchedStats) {
        throw new Error('Unable to fetch team statistics')
      }
      stats = fetchedStats
    }

    if (!stats) {
      throw new Error('Unable to fetch team statistics')
    }

    // Analyze type coverage (simplified - would need actual Pokemon type data)
    const typeCount: { [key: string]: number } = {}
    const allTypes = new Set<string>()

    // This is simplified - in production you'd fetch actual Pokemon types from PokeAPI
    // For now, we'll make educated guesses or use placeholder data

    const strengths: string[] = []
    const weaknesses: string[] = []
    const recommendations: string[] = []

    // Performance-based analysis
    if (stats.offensiveRating > 8) {
      strengths.push('Strong offensive capabilities with high scoring rate')
    } else if (stats.offensiveRating < 4) {
      weaknesses.push('Struggling to score consistently in matches')
      recommendations.push('Focus on Pokemon with higher offensive stats or better type matchups')
    }

    if (stats.defensiveRating > 8) {
      strengths.push('Excellent defensive resilience, limiting opponent scores')
    } else if (stats.defensiveRating < 4) {
      weaknesses.push('Defensive vulnerabilities allowing too many points')
      recommendations.push('Consider defensive Pokemon or improve type coverage against common threats')
    }

    if (stats.healthyRosterPercentage < 50) {
      weaknesses.push('Limited roster depth due to fainted/dead Pokemon')
      recommendations.push('Manage Pokemon health carefully and consider trading for depth')
    }

    if (stats.pythagoreanExpectation > 0.6 && stats.wins < stats.matchesPlayed * 0.6) {
      strengths.push('Team is underperforming relative to scoring - expect improvement')
      recommendations.push('Continue current strategy, luck should even out')
    } else if (stats.pythagoreanExpectation < 0.4 && stats.wins > stats.matchesPlayed * 0.4) {
      weaknesses.push('Team is overperforming relative to scoring - regression likely')
      recommendations.push('Improve team composition to sustain current record')
    }

    // Determine playstyle
    let playstyle: 'offensive' | 'defensive' | 'balanced' = 'balanced'
    if (stats.offensiveRating > stats.defensiveRating * 1.2) {
      playstyle = 'offensive'
    } else if (stats.defensiveRating > stats.offensiveRating * 1.2) {
      playstyle = 'defensive'
    }

    const overallRating = Math.min(100, Math.max(0,
      (stats.offensiveRating * 5) +
      (stats.defensiveRating * 5) +
      (stats.healthyRosterPercentage * 0.3) +
      (stats.wins / Math.max(stats.matchesPlayed, 1) * 30)
    ))

    let recommendedStrategy = ''
    if (playstyle === 'offensive') {
      recommendedStrategy = 'Continue aggressive play, focus on high-damage outputs and sweeping strategies. Watch for defensive holes.'
    } else if (playstyle === 'defensive') {
      recommendedStrategy = 'Maintain defensive core while looking for opportunities to counter-attack. Consider adding a sweeper.'
    } else {
      recommendedStrategy = 'Well-balanced team. Adapt strategy based on opponent matchups.'
    }

    return {
      teamId,
      teamName: stats.teamName,
      overallRating,
      strengths,
      weaknesses,
      recommendations,
      offensiveCoverage: {
        score: Math.min(100, stats.offensiveRating * 10),
        goodAgainst: [],  // Would require type analysis
        poorAgainst: []
      },
      defensiveCoverage: {
        score: Math.min(100, stats.defensiveRating * 10),
        resistances: [],
        weaknesses: []
      },
      topPerformers: [],  // Would require individual Pokemon stats
      underperformers: [],
      playstyle,
      recommendedStrategy
    }
  }

  /**
   * Predict matchup outcome between two teams
   */
  static async predictMatchup(
    homeTeamId: string,
    awayTeamId: string,
    homePicks: Pick[],
    awayPicks: Pick[]
  ): Promise<MatchupPrediction> {
    // Fetch team stats and form
    const [homeStats, awayStats, homeForm, awayForm, h2h] = await Promise.all([
      LeagueStatsService.getAdvancedTeamStats(homeTeamId),
      LeagueStatsService.getAdvancedTeamStats(awayTeamId),
      LeagueStatsService.getTeamForm(homeTeamId),
      LeagueStatsService.getTeamForm(awayTeamId),
      LeagueStatsService.getHeadToHeadRecord(homeTeamId, awayTeamId)
    ])

    if (!homeStats || !awayStats) {
      throw new Error('Unable to fetch team statistics for prediction')
    }

    const factors: Array<{
      category: string
      advantage: 'home' | 'away' | 'neutral'
      description: string
      impact: number
    }> = []

    let homeAdvantagePoints = 0
    let awayAdvantagePoints = 0

    // Factor 1: Offensive vs Defensive
    if (homeStats.offensiveRating > awayStats.defensiveRating * 1.2) {
      homeAdvantagePoints += 2
      factors.push({
        category: 'Offensive Matchup',
        advantage: 'home',
        description: `${homeStats.teamName}'s offense significantly outmatches ${awayStats.teamName}'s defense`,
        impact: 8
      })
    } else if (awayStats.offensiveRating > homeStats.defensiveRating * 1.2) {
      awayAdvantagePoints += 2
      factors.push({
        category: 'Offensive Matchup',
        advantage: 'away',
        description: `${awayStats.teamName}'s offense significantly outmatches ${homeStats.teamName}'s defense`,
        impact: 8
      })
    }

    // Factor 2: Current Form
    if (homeForm && awayForm) {
      const homeFormScore = homeForm.last5Wins - homeForm.last5Losses
      const awayFormScore = awayForm.last5Wins - awayForm.last5Losses

      if (homeFormScore > awayFormScore + 1) {
        homeAdvantagePoints += 1
        factors.push({
          category: 'Current Form',
          advantage: 'home',
          description: `${homeStats.teamName} is in better form (${homeForm.formString})`,
          impact: 6
        })
      } else if (awayFormScore > homeFormScore + 1) {
        awayAdvantagePoints += 1
        factors.push({
          category: 'Current Form',
          advantage: 'away',
          description: `${awayStats.teamName} is in better form (${awayForm.formString})`,
          impact: 6
        })
      }
    }

    // Factor 3: Roster Health
    const healthDiff = homeStats.healthyRosterPercentage - awayStats.healthyRosterPercentage
    if (healthDiff > 20) {
      homeAdvantagePoints += 1
      factors.push({
        category: 'Roster Health',
        advantage: 'home',
        description: `${homeStats.teamName} has a healthier roster (${homeStats.healthyRosterPercentage.toFixed(0)}% vs ${awayStats.healthyRosterPercentage.toFixed(0)}%)`,
        impact: 5
      })
    } else if (healthDiff < -20) {
      awayAdvantagePoints += 1
      factors.push({
        category: 'Roster Health',
        advantage: 'away',
        description: `${awayStats.teamName} has a healthier roster (${awayStats.healthyRosterPercentage.toFixed(0)}% vs ${homeStats.healthyRosterPercentage.toFixed(0)}%)`,
        impact: 5
      })
    }

    // Factor 4: Head-to-Head History
    if (h2h && h2h.totalMatches > 0) {
      if (h2h.wins > h2h.losses) {
        homeAdvantagePoints += 0.5
        factors.push({
          category: 'Historical Record',
          advantage: 'home',
          description: `${homeStats.teamName} leads the series ${h2h.wins}-${h2h.losses}-${h2h.draws}`,
          impact: 3
        })
      } else if (h2h.losses > h2h.wins) {
        awayAdvantagePoints += 0.5
        factors.push({
          category: 'Historical Record',
          advantage: 'away',
          description: `${awayStats.teamName} leads the series ${h2h.losses}-${h2h.wins}-${h2h.draws}`,
          impact: 3
        })
      }
    }

    // Factor 5: Pythagorean Expectation (underlying quality)
    const homeExpectedWins = homeStats.pythagoreanExpectation * homeStats.matchesPlayed
    const awayExpectedWins = awayStats.pythagoreanExpectation * awayStats.matchesPlayed

    if (homeExpectedWins > awayExpectedWins + 1) {
      homeAdvantagePoints += 1
      factors.push({
        category: 'Underlying Quality',
        advantage: 'home',
        description: `${homeStats.teamName} has better scoring metrics`,
        impact: 7
      })
    } else if (awayExpectedWins > homeExpectedWins + 1) {
      awayAdvantagePoints += 1
      factors.push({
        category: 'Underlying Quality',
        advantage: 'away',
        description: `${awayStats.teamName} has better scoring metrics`,
        impact: 7
      })
    }

    // Calculate prediction
    const totalPoints = homeAdvantagePoints + awayAdvantagePoints
    const homeWinProbability = totalPoints > 0 ? homeAdvantagePoints / totalPoints : 0.5

    let predictedWinner: 'home' | 'away' | 'toss_up' = 'toss_up'
    let confidence = 50

    if (homeWinProbability > 0.6) {
      predictedWinner = 'home'
      confidence = Math.min(95, 50 + (homeWinProbability - 0.5) * 100)
    } else if (homeWinProbability < 0.4) {
      predictedWinner = 'away'
      confidence = Math.min(95, 50 + (0.5 - homeWinProbability) * 100)
    }

    // Predict score based on average scoring
    const predictedHomeScore = Math.round(
      homeStats.avgPointsFor * (predictedWinner === 'home' ? 1.1 : predictedWinner === 'away' ? 0.9 : 1)
    )
    const predictedAwayScore = Math.round(
      awayStats.avgPointsFor * (predictedWinner === 'away' ? 1.1 : predictedWinner === 'home' ? 0.9 : 1)
    )

    // Generate advice
    const homeTeamAdvice: string[] = []
    const awayTeamAdvice: string[] = []

    if (homeStats.offensiveRating < awayStats.defensiveRating) {
      homeTeamAdvice.push('Focus on breaking down their strong defense with type advantages')
    }
    if (homeStats.healthyRosterPercentage < 70) {
      homeTeamAdvice.push('Be cautious with Pokemon health - avoid risky plays')
    }

    if (awayStats.offensiveRating < homeStats.defensiveRating) {
      awayTeamAdvice.push('Their defense is strong - look for coverage gaps and exploit them')
    }
    if (awayStats.healthyRosterPercentage < 70) {
      awayTeamAdvice.push('Manage your limited roster carefully throughout the match')
    }

    return {
      homeTeamId,
      homeTeamName: homeStats.teamName,
      awayTeamId,
      awayTeamName: awayStats.teamName,
      predictedWinner,
      confidence,
      predictedScore: {
        home: predictedHomeScore,
        away: predictedAwayScore
      },
      factors,
      keyMatchups: [],  // Would require individual Pokemon analysis
      homeTeamAdvice,
      awayTeamAdvice,
      historicalRecord: h2h ? {
        homeWins: h2h.wins,
        awayWins: h2h.losses,
        draws: h2h.draws,
        lastMeeting: h2h.lastMeeting?.date
      } : undefined
    }
  }

  /**
   * Generate power rankings for all teams in a league
   */
  static async generatePowerRankings(leagueId: string): Promise<Array<{
    rank: number
    previousRank: number
    teamId: string
    teamName: string
    record: string
    powerScore: number
    form: string
    trend: 'up' | 'down' | 'same'
  }>> {
    // This would fetch all teams, calculate power scores, and rank them
    // For now, return empty array as placeholder
    return []
  }
}
