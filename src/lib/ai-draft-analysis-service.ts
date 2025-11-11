/**
 * AI Draft Analysis Service
 *
 * Provides AI-powered analysis of completed drafts.
 * Available to spectators on public drafts (read-only overview).
 *
 * Features:
 * - Overall draft quality assessment
 * - Team composition analysis
 * - Power rankings for all teams
 * - Pick efficiency (value picks, steals, reaches)
 */

import { supabase } from './supabase'
import { AIAnalysisService } from './ai-analysis-service'
import { LeagueStatsService } from './league-stats-service'
import type { Pick, Team } from '@/types'

export interface DraftAnalysis {
  draftId: string
  draftName: string
  totalTeams: number
  totalPicks: number

  // Overall assessment
  overallQuality: number  // 0-100
  competitiveBalance: number  // 0-100 (higher = more balanced)

  // Team rankings
  teamRankings: Array<{
    rank: number
    teamId: string
    teamName: string
    powerScore: number
    grade: 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F'
    strengths: string[]
    weaknesses: string[]
  }>

  // Draft insights
  insights: Array<{
    type: 'best_team' | 'best_pick' | 'biggest_steal' | 'biggest_reach' | 'most_balanced'
    title: string
    description: string
    teamId?: string
    pickId?: string
  }>

  // Pick analysis
  valuePicksCount: number  // Picks below expected cost
  overpaymentsCount: number  // Picks above expected cost

  // Type distribution
  typeDistribution: {
    [teamName: string]: {
      [type: string]: number  // Count of Pokemon by type
    }
  }
}

export interface TeamComparison {
  teamId: string
  teamName: string
  rank: number
  powerScore: number
  totalCost: number
  averageCost: number
  budgetEfficiency: number  // How well they used their budget
  pickQuality: number  // Average value of picks
}

export interface PickAnalysis {
  pickId: string
  pickOrder: number
  teamId: string
  teamName: string
  pokemonName: string
  cost: number
  expectedCost: number
  value: 'steal' | 'value' | 'fair' | 'reach' | 'overpay'
  valueRating: number  // -100 to +100 (negative = overpay, positive = value)
}

export class AIDraftAnalysisService {
  /**
   * Analyze a completed draft
   */
  static async analyzeDraft(draftId: string): Promise<DraftAnalysis> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      // Get draft info
      const draftResponse = await supabase
        .from('drafts')
        .select('*, format:formats(*)')
        .eq('id', draftId)
        .single() as any

      if (draftResponse.error || !draftResponse.data) {
        throw new Error('Draft not found')
      }

      const draft = draftResponse.data

      if (draft.status !== 'completed') {
        throw new Error('Draft must be completed for analysis')
      }

      // Get all teams and their picks
      const teamsResponse = await supabase
        .from('teams')
        .select('*')
        .eq('draft_id', draftId)
        .order('draft_order', { ascending: true }) as any

      if (teamsResponse.error || !teamsResponse.data || teamsResponse.data.length === 0) {
        throw new Error('No teams found in draft')
      }

      const teams = teamsResponse.data

      // Get all picks
      const picksResponse = await supabase
        .from('picks')
        .select('*')
        .eq('draft_id', draftId)
        .order('pick_order', { ascending: true }) as any

      if (picksResponse.error || !picksResponse.data || picksResponse.data.length === 0) {
        throw new Error('No picks found in draft')
      }

      const picks = picksResponse.data

      // Analyze each team
      const teamAnalyses = await Promise.all(
        teams.map(async (team: any) => {
          const teamPicks = picks.filter((p: any) => p.team_id === team.id)

          // Calculate power score based on picks
          const totalCost = teamPicks.reduce((sum: number, p: any) => sum + p.cost, 0)
          const avgCost = totalCost / teamPicks.length
          const budgetUsed = (draft.budget_per_team || 100) - team.budget_remaining
          const budgetEfficiency = budgetUsed / (draft.budget_per_team || 100)

          // Simple power score based on cost efficiency
          const powerScore = (avgCost * 10) + (budgetEfficiency * 20) + (teamPicks.length * 5)

          return {
            team,
            teamPicks,
            totalCost,
            avgCost,
            budgetEfficiency,
            powerScore,
            strengths: [] as string[],
            weaknesses: [] as string[]
          }
        })
      )

      // Rank teams by power score
      const rankedTeams = teamAnalyses
        .sort((a, b) => b.powerScore - a.powerScore)
        .map((analysis, index) => {
          // Assign grade based on rank
          let grade: DraftAnalysis['teamRankings'][0]['grade'] = 'C'
          if (index === 0) grade = 'A+'
          else if (index === 1) grade = 'A'
          else if (index === 2) grade = 'A-'
          else if (index < teams.length * 0.3) grade = 'B+'
          else if (index < teams.length * 0.5) grade = 'B'
          else if (index < teams.length * 0.7) grade = 'B-'
          else if (index < teams.length * 0.85) grade = 'C+'
          else grade = 'C-'

          // Generate strengths/weaknesses
          const strengths: string[] = []
          const weaknesses: string[] = []

          if (analysis.avgCost > 7) {
            strengths.push('High-value Pokemon selections')
          } else if (analysis.avgCost < 4) {
            weaknesses.push('Low-cost picks may lack power')
          }

          if (analysis.budgetEfficiency > 0.9) {
            strengths.push('Excellent budget utilization')
          } else if (analysis.budgetEfficiency < 0.7) {
            weaknesses.push('Underutilized draft budget')
          }

          if (analysis.teamPicks.length >= 6) {
            strengths.push('Full roster depth')
          } else {
            weaknesses.push('Limited roster size')
          }

          return {
            rank: index + 1,
            teamId: analysis.team.id,
            teamName: analysis.team.name,
            powerScore: analysis.powerScore,
            grade,
            strengths,
            weaknesses
          }
        })

      // Calculate competitive balance (lower std dev = more balanced)
      const avgPowerScore = rankedTeams.reduce((sum, t) => sum + t.powerScore, 0) / rankedTeams.length
      const variance = rankedTeams.reduce((sum, t) => sum + Math.pow(t.powerScore - avgPowerScore, 2), 0) / rankedTeams.length
      const stdDev = Math.sqrt(variance)
      const competitiveBalance = Math.max(0, Math.min(100, 100 - (stdDev * 2)))

      // Generate insights
      const insights: DraftAnalysis['insights'] = []

      // Best team
      if (rankedTeams.length > 0) {
        const bestTeam = rankedTeams[0]
        insights.push({
          type: 'best_team',
          title: `${bestTeam.teamName} Leads the Pack`,
          description: `Earned an ${bestTeam.grade} with strong picks and excellent draft strategy`,
          teamId: bestTeam.teamId
        })
      }

      // Most balanced
      if (competitiveBalance > 70) {
        insights.push({
          type: 'most_balanced',
          title: 'Highly Competitive Draft',
          description: `Balance score of ${competitiveBalance.toFixed(0)}/100 - expect close matches!`
        })
      }

      // Calculate pick efficiency
      let valuePicksCount = 0
      let overpaymentsCount = 0

      picks.forEach((pick: any) => {
        // Simplified: Compare to average cost for similar picks
        const expectedCost = avgPowerScore / 10  // Rough estimate
        if (pick.cost < expectedCost * 0.8) valuePicksCount++
        if (pick.cost > expectedCost * 1.2) overpaymentsCount++
      })

      // Find best value pick
      const valuePicks = picks
        .map((pick: any) => ({
          ...pick,
          value: avgPowerScore / 10 - pick.cost
        }))
        .sort((a: any, b: any) => b.value - a.value)

      if (valuePicks.length > 0 && valuePicks[0].value > 2) {
        const bestPick = valuePicks[0]
        const team = teams.find((t: any) => t.id === bestPick.team_id)
        insights.push({
          type: 'biggest_steal',
          title: `${bestPick.pokemon_name} - Steal of the Draft`,
          description: `${team?.name} got incredible value at just ${bestPick.cost} points`,
          teamId: team?.id,
          pickId: bestPick.id
        })
      }

      // Overall draft quality
      const overallQuality = Math.min(100, (avgPowerScore / rankedTeams.length) * 20 + competitiveBalance * 0.5)

      return {
        draftId,
        draftName: draft.name || `Draft ${draftId.slice(0, 8)}`,
        totalTeams: teams.length,
        totalPicks: picks.length,
        overallQuality,
        competitiveBalance,
        teamRankings: rankedTeams,
        insights,
        valuePicksCount,
        overpaymentsCount,
        typeDistribution: {}  // Would need Pokemon type data from PokeAPI
      }
    } catch (error) {
      console.error('Error analyzing draft:', error)
      throw error
    }
  }

  /**
   * Compare all teams in a draft (simplified version of full analysis)
   */
  static async compareTeams(draftId: string): Promise<TeamComparison[]> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const { data: teams } = await supabase
        .from('teams')
        .select('*')
        .eq('draft_id', draftId)

      if (!teams) return []

      const picksResponse = await supabase
        .from('picks')
        .select('*')
        .eq('draft_id', draftId) as any

      if (!picksResponse?.data) return []

      const picks = picksResponse.data

      const draftResponse = await supabase
        .from('drafts')
        .select('budget_per_team')
        .eq('id', draftId)
        .single() as any

      const budgetPerTeam = draftResponse?.data?.budget_per_team || 100

      const comparisons = teams.map((team: any, index: number) => {
        const teamPicks = picks.filter((p: any) => p.team_id === team.id)
        const totalCost = teamPicks.reduce((sum: number, p: any) => sum + p.cost, 0)
        const avgCost = teamPicks.length > 0 ? totalCost / teamPicks.length : 0
        const budgetUsed = budgetPerTeam - team.budget_remaining
        const budgetEfficiency = (budgetUsed / budgetPerTeam) * 100

        const powerScore = (avgCost * 10) + (budgetEfficiency * 0.2) + (teamPicks.length * 5)

        return {
          teamId: team.id,
          teamName: team.name,
          rank: 0,  // Will be set after sorting
          powerScore,
          totalCost,
          averageCost: avgCost,
          budgetEfficiency,
          pickQuality: avgCost
        }
      })

      // Sort and assign ranks
      const ranked = comparisons
        .sort((a, b) => b.powerScore - a.powerScore)
        .map((comp, index) => ({
          ...comp,
          rank: index + 1
        }))

      return ranked
    } catch (error) {
      console.error('Error comparing teams:', error)
      throw error
    }
  }

  /**
   * Analyze pick efficiency (value picks vs overpays)
   */
  static async analyzePickEfficiency(draftId: string): Promise<PickAnalysis[]> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const picksResponse = await supabase
        .from('picks')
        .select(`
          *,
          team:teams!inner(id, name)
        `)
        .eq('draft_id', draftId)
        .order('pick_order', { ascending: true }) as any

      if (!picksResponse?.data) return []

      const picks = picksResponse.data

      // Calculate average cost as baseline
      const avgCost = picks.reduce((sum: number, p: any) => sum + p.cost, 0) / picks.length

      const analyses = picks.map((pick: any) => {
        const expectedCost = avgCost  // Simplified - would use more complex calculation
        const valueRating = ((expectedCost - pick.cost) / expectedCost) * 100

        let value: PickAnalysis['value'] = 'fair'
        if (valueRating > 30) value = 'steal'
        else if (valueRating > 10) value = 'value'
        else if (valueRating < -30) value = 'overpay'
        else if (valueRating < -10) value = 'reach'

        return {
          pickId: pick.id,
          pickOrder: pick.pick_order,
          teamId: pick.team_id,
          teamName: pick.team.name,
          pokemonName: pick.pokemon_name,
          cost: pick.cost,
          expectedCost,
          value,
          valueRating
        }
      })

      return analyses
    } catch (error) {
      console.error('Error analyzing pick efficiency:', error)
      throw error
    }
  }

  /**
   * Get draft summary for display
   */
  static async getDraftSummary(draftId: string): Promise<{
    totalTeams: number
    totalPicks: number
    avgPickCost: number
    topTeam: string | null
    draftComplete: boolean
  }> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const [draftResponse, teamsResponse, picksResponse] = await Promise.all([
        supabase.from('drafts').select('status').eq('id', draftId).single(),
        supabase.from('teams').select('id, name').eq('draft_id', draftId),
        supabase.from('picks').select('cost').eq('draft_id', draftId)
      ]) as any[]

      const draft = draftResponse?.data
      const teams = teamsResponse?.data
      const picks = picksResponse?.data

      const avgPickCost = picks && picks.length > 0
        ? picks.reduce((sum: number, p: any) => sum + p.cost, 0) / picks.length
        : 0

      // Get top team from comparison
      const comparison = await this.compareTeams(draftId)
      const topTeam = comparison.length > 0 ? comparison[0].teamName : null

      return {
        totalTeams: teams?.length || 0,
        totalPicks: picks?.length || 0,
        avgPickCost,
        topTeam,
        draftComplete: draft?.status === 'completed'
      }
    } catch (error) {
      console.error('Error getting draft summary:', error)
      throw error
    }
  }
}
