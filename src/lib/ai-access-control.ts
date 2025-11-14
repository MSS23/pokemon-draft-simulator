/**
 * AI Access Control Service
 *
 * Manages permissions for AI-powered features:
 * - Team analysis: Only league participants
 * - Draft analysis: Spectators on public drafts
 * - Matchup predictions: League participants only
 */

import { supabase } from './supabase'
import { UserSessionService } from './user-session'

export interface AIAccessContext {
  userId?: string
  leagueId?: string
  draftId?: string
  teamId?: string
}

export interface AccessCheckResult {
  allowed: boolean
  reason?: string
  userRole?: 'participant' | 'spectator' | 'guest'
}

export class AIAccessControl {
  /**
   * Check if user can analyze a specific team in a league
   * Rule: Only league participants (users with teams in that league)
   */
  static async canAnalyzeTeam(context: AIAccessContext): Promise<AccessCheckResult> {
    if (!context.teamId || !context.leagueId) {
      return {
        allowed: false,
        reason: 'Missing required context (teamId or leagueId)'
      }
    }

    try {
      // Get current user session
      const session = await UserSessionService.getOrCreateSession()
      const userId = context.userId || session.userId

      if (!userId) {
        return {
          allowed: false,
          reason: 'User session not found',
          userRole: 'guest'
        }
      }

      // Get league's draft ID
      if (!supabase) {
        throw new Error('Supabase not available')
      }

      const leagueResponse = await supabase
        .from('leagues')
        .select('draft_id')
        .eq('id', context.leagueId)
        .maybeSingle() as any

      if (leagueResponse.error || !leagueResponse.data) {
        return {
          allowed: false,
          reason: 'League not found'
        }
      }

      const league = leagueResponse.data as { draft_id: string }

      // Check if user is a participant (owns a team in this league's draft)
      const isParticipant = await this.isLeagueParticipant(userId, league.draft_id)

      if (isParticipant) {
        return {
          allowed: true,
          userRole: 'participant'
        }
      }

      return {
        allowed: false,
        reason: 'Only league participants can analyze teams',
        userRole: 'spectator'
      }
    } catch (error) {
      console.error('Error checking team analysis access:', error)
      return {
        allowed: false,
        reason: 'Error verifying permissions'
      }
    }
  }

  /**
   * Check if user can view draft analysis
   * Rule: Anyone can view if draft is public (spectator access)
   * Rule: Only participants can view if draft is private
   */
  static async canAnalyzeDraft(context: AIAccessContext): Promise<AccessCheckResult> {
    if (!context.draftId) {
      return {
        allowed: false,
        reason: 'Missing required context (draftId)'
      }
    }

    try {
      if (!supabase) {
        throw new Error('Supabase not available')
      }

      // Check if draft is public
      const draftResponse = await supabase
        .from('drafts')
        .select('is_public, status')
        .eq('id', context.draftId)
        .single() as any

      if (draftResponse.error || !draftResponse.data) {
        return {
          allowed: false,
          reason: 'Draft not found'
        }
      }

      const draft = draftResponse.data as { is_public: boolean; status: string }

      // Draft must be completed to have analysis
      if (draft.status !== 'completed') {
        return {
          allowed: false,
          reason: 'Draft must be completed for analysis'
        }
      }

      // If draft is public, anyone can view analysis
      if (draft.is_public) {
        return {
          allowed: true,
          userRole: 'spectator'
        }
      }

      // If draft is private, only participants can view
      const session = await UserSessionService.getOrCreateSession()
      const userId = context.userId || session.userId

      if (!userId) {
        return {
          allowed: false,
          reason: 'Draft is private - participants only',
          userRole: 'guest'
        }
      }

      const isParticipant = await this.isLeagueParticipant(userId, context.draftId)

      if (isParticipant) {
        return {
          allowed: true,
          userRole: 'participant'
        }
      }

      return {
        allowed: false,
        reason: 'Draft is private - participants only',
        userRole: 'spectator'
      }
    } catch (error) {
      console.error('Error checking draft analysis access:', error)
      return {
        allowed: false,
        reason: 'Error verifying permissions'
      }
    }
  }

  /**
   * Check if user is a participant in a league/draft
   * Returns true if user owns at least one team in the draft
   */
  static async isLeagueParticipant(userId: string, draftId: string): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const { data: teams } = await supabase
        .from('teams')
        .select('id')
        .eq('draft_id', draftId)
        .eq('owner_id', userId)

      return (teams && teams.length > 0) || false
    } catch (error) {
      console.error('Error checking league participation:', error)
      return false
    }
  }

  /**
   * Check if user owns a specific team
   */
  static async isTeamOwner(userId: string, teamId: string): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const teamResponse = await supabase
        .from('teams')
        .select('owner_id')
        .eq('id', teamId)
        .single() as any

      return teamResponse?.data?.owner_id === userId
    } catch (error) {
      console.error('Error checking team ownership:', error)
      return false
    }
  }

  /**
   * Get user's teams in a specific draft/league
   */
  static async getUserTeams(userId: string, draftId: string): Promise<string[]> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const teamsResponse = await supabase
        .from('teams')
        .select('id')
        .eq('draft_id', draftId)
        .eq('owner_id', userId) as any

      return teamsResponse?.data?.map((t: any) => t.id) || []
    } catch (error) {
      console.error('Error getting user teams:', error)
      return []
    }
  }

  /**
   * Check if draft is public
   */
  static async isDraftPublic(draftId: string): Promise<boolean> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const draftResponse = await supabase
        .from('drafts')
        .select('is_public')
        .eq('id', draftId)
        .single() as any

      return draftResponse?.data?.is_public === true
    } catch (error) {
      console.error('Error checking draft visibility:', error)
      return false
    }
  }

  /**
   * Get comprehensive access info for a user in a league context
   */
  static async getLeagueAccessInfo(leagueId: string, userId?: string): Promise<{
    isParticipant: boolean
    isDraftPublic: boolean
    userTeams: string[]
    canAnalyzeTeams: boolean
    canViewDraftAnalysis: boolean
  }> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    try {
      const session = await UserSessionService.getOrCreateSession()
      const effectiveUserId = userId || session.userId

      // Get league's draft
      const leagueResponse = await supabase
        .from('leagues')
        .select('draft_id')
        .eq('id', leagueId)
        .maybeSingle() as any

      if (!leagueResponse?.data || !effectiveUserId) {
        return {
          isParticipant: false,
          isDraftPublic: false,
          userTeams: [],
          canAnalyzeTeams: false,
          canViewDraftAnalysis: false
        }
      }

      const league = leagueResponse.data as { draft_id: string }
      const draftId = league.draft_id

      // Run all checks in parallel
      const [isParticipant, isDraftPublic, userTeams] = await Promise.all([
        this.isLeagueParticipant(effectiveUserId, draftId),
        this.isDraftPublic(draftId),
        this.getUserTeams(effectiveUserId, draftId)
      ])

      return {
        isParticipant,
        isDraftPublic,
        userTeams,
        canAnalyzeTeams: isParticipant,
        canViewDraftAnalysis: isDraftPublic || isParticipant
      }
    } catch (error) {
      console.error('Error getting league access info:', error)
      return {
        isParticipant: false,
        isDraftPublic: false,
        userTeams: [],
        canAnalyzeTeams: false,
        canViewDraftAnalysis: false
      }
    }
  }
}
