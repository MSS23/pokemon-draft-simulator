/**
 * Trade Service
 *
 * Handles Pokemon trading between teams in a league, including proposal,
 * acceptance/rejection, commissioner approval, and trade execution.
 */

import { supabase } from './supabase'
import type {
  Trade,
  TradeApproval,
  TradeWithDetails,
  Pick,
} from '@/types'

export class TradeService {
  /**
   * Propose a trade between two teams
   *
   * @param leagueId - League UUID
   * @param weekNumber - Week when trade is proposed (trades happen between weeks)
   * @param fromTeamId - Team initiating the trade
   * @param toTeamId - Team receiving the proposal
   * @param fromPicks - Pick IDs that fromTeam is offering
   * @param toPicks - Pick IDs that toTeam is offering
   * @param notes - Optional trade notes/comments
   */
  static async proposeTrade(
    leagueId: string,
    weekNumber: number,
    fromTeamId: string,
    toTeamId: string,
    fromPicks: string[],
    toPicks: string[],
    notes?: string
  ): Promise<Trade> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // Validate trade has at least one Pokemon on each side
    if (fromPicks.length === 0 && toPicks.length === 0) {
      throw new Error('Trade must include at least one Pokemon')
    }

    // Validate Pokemon are not dead (Nuzlocke)
    const validation = await this.validateTrade(leagueId, [...fromPicks, ...toPicks])
    if (!validation.valid) {
      throw new Error(validation.reason || 'Trade validation failed')
    }

    // Insert trade proposal
    const { data, error } = await supabase
      .from('trades')
      .insert({
        league_id: leagueId,
        week_number: weekNumber,
        team_a_id: fromTeamId,
        team_b_id: toTeamId,
        team_a_gives: fromPicks,
        team_b_gives: toPicks,
        proposed_by: fromTeamId,
        status: 'proposed',
        notes: notes || null,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to propose trade: ${error.message}`)
    }

    return this.mapToTrade(data)
  }

  /**
   * Accept a trade proposal
   *
   * @param tradeId - Trade UUID
   * @param teamId - Team accepting the trade (must be the non-proposing team)
   */
  static async acceptTrade(tradeId: string, teamId: string): Promise<Trade> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // Get trade to verify the accepting team is correct
    const { data: trade, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single()

    if (fetchError || !trade) {
      throw new Error(`Failed to find trade: ${fetchError?.message || 'Not found'}`)
    }

    // Verify this team is part of the trade and is not the proposer
    const isTeamA = trade.team_a_id === teamId
    const isTeamB = trade.team_b_id === teamId
    const isProposer = trade.proposed_by === teamId

    if (!isTeamA && !isTeamB) {
      throw new Error('Team is not part of this trade')
    }

    if (isProposer) {
      throw new Error('Proposing team cannot accept their own trade')
    }

    // Update trade status to accepted
    const { data, error } = await supabase
      .from('trades')
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
      })
      .eq('id', tradeId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to accept trade: ${error.message}`)
    }

    return this.mapToTrade(data)
  }

  /**
   * Reject a trade proposal
   *
   * @param tradeId - Trade UUID
   * @param teamId - Team rejecting the trade
   * @param reason - Optional rejection reason
   */
  static async rejectTrade(
    tradeId: string,
    teamId: string,
    reason?: string
  ): Promise<Trade> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // Get trade to verify the rejecting team is correct
    const { data: trade, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single()

    if (fetchError || !trade) {
      throw new Error(`Failed to find trade: ${fetchError?.message || 'Not found'}`)
    }

    // Verify this team is part of the trade
    const isTeamA = trade.team_a_id === teamId
    const isTeamB = trade.team_b_id === teamId

    if (!isTeamA && !isTeamB) {
      throw new Error('Team is not part of this trade')
    }

    // Update trade status to rejected
    const { data, error } = await supabase
      .from('trades')
      .update({
        status: 'rejected',
        responded_at: new Date().toISOString(),
        notes: reason ? `${trade.notes || ''}\n\nRejection reason: ${reason}`.trim() : trade.notes,
      })
      .eq('id', tradeId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to reject trade: ${error.message}`)
    }

    return this.mapToTrade(data)
  }

  /**
   * Execute an accepted trade (swap Pokemon ownership)
   *
   * @param tradeId - Trade UUID
   */
  static async executeTrade(tradeId: string): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // Call the database function to execute the trade
    const { error } = await supabase.rpc('execute_trade', {
      trade_uuid: tradeId,
    })

    if (error) {
      throw new Error(`Failed to execute trade: ${error.message}`)
    }
  }

  /**
   * Cancel a pending trade (can only be done by the proposing team)
   *
   * @param tradeId - Trade UUID
   * @param teamId - Team canceling the trade (must be proposer)
   */
  static async cancelTrade(tradeId: string, teamId: string): Promise<Trade> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // Get trade to verify the canceling team is the proposer
    const { data: trade, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single()

    if (fetchError || !trade) {
      throw new Error(`Failed to find trade: ${fetchError?.message || 'Not found'}`)
    }

    // Verify this team proposed the trade
    if (trade.proposed_by !== teamId) {
      throw new Error('Only the proposing team can cancel a trade')
    }

    // Can only cancel if status is 'proposed'
    if (trade.status !== 'proposed') {
      throw new Error(`Cannot cancel trade with status: ${trade.status}`)
    }

    // Update trade status to cancelled
    const { data, error } = await supabase
      .from('trades')
      .update({
        status: 'cancelled',
      })
      .eq('id', tradeId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to cancel trade: ${error.message}`)
    }

    return this.mapToTrade(data)
  }

  /**
   * Get pending trades for a specific team
   *
   * @param teamId - Team UUID
   */
  static async getPendingTrades(teamId: string): Promise<TradeWithDetails[]> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    const { data, error } = await supabase
      .from('trade_history')
      .select('*')
      .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
      .eq('status', 'proposed')
      .order('proposed_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to get pending trades: ${error.message}`)
    }

    return data.map(this.mapToTradeWithDetails)
  }

  /**
   * Get trade history for a league
   *
   * @param leagueId - League UUID
   * @param includeRejected - Whether to include rejected/cancelled trades
   */
  static async getTradeHistory(
    leagueId: string,
    includeRejected: boolean = false
  ): Promise<TradeWithDetails[]> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    let query = supabase
      .from('trade_history')
      .select('*')
      .eq('league_id', leagueId)

    if (!includeRejected) {
      query = query.in('status', ['proposed', 'accepted', 'completed'])
    }

    const { data, error } = await query
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('proposed_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to get trade history: ${error.message}`)
    }

    return data.map(this.mapToTradeWithDetails)
  }

  /**
   * Validate that a trade is legal (no dead Pokemon)
   *
   * @param leagueId - League UUID
   * @param pickIds - Array of pick IDs being traded
   */
  static async validateTrade(
    leagueId: string,
    pickIds: string[]
  ): Promise<{ valid: boolean; reason?: string }> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    if (pickIds.length === 0) {
      return { valid: true }
    }

    // Check if any of the Pokemon are dead
    const { data, error } = await supabase
      .from('team_pokemon_status')
      .select('pick_id, status')
      .eq('league_id', leagueId)
      .in('pick_id', pickIds)
      .eq('status', 'dead')

    if (error) {
      throw new Error(`Failed to validate trade: ${error.message}`)
    }

    if (data && data.length > 0) {
      return {
        valid: false,
        reason: `Cannot trade dead Pokemon (${data.length} dead Pokemon in trade)`,
      }
    }

    return { valid: true }
  }

  /**
   * Commissioner approve/reject a trade
   *
   * @param tradeId - Trade UUID
   * @param userId - User ID of commissioner
   * @param approved - True to approve, false to reject
   * @param comments - Optional approval/rejection comments
   */
  static async approveTrade(
    tradeId: string,
    userId: string,
    approved: boolean,
    comments?: string
  ): Promise<TradeApproval> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // Insert approval record
    const { data, error } = await supabase
      .from('trade_approvals')
      .insert({
        trade_id: tradeId,
        approver_user_id: userId,
        approver_role: 'commissioner',
        approved,
        comments: comments || null,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to record trade approval: ${error.message}`)
    }

    // Update trade record with commissioner approval
    const { error: updateError } = await supabase
      .from('trades')
      .update({
        commissioner_approved: approved,
        commissioner_id: userId,
        commissioner_notes: comments || null,
        status: approved ? 'accepted' : 'rejected',
      })
      .eq('id', tradeId)

    if (updateError) {
      throw new Error(`Failed to update trade status: ${updateError.message}`)
    }

    return {
      id: data.id,
      tradeId: data.trade_id,
      approverUserId: data.approver_user_id,
      approverRole: data.approver_role,
      approved: data.approved,
      comments: data.comments,
      createdAt: data.created_at,
    }
  }

  /**
   * Get trades that need commissioner approval
   *
   * @param leagueId - League UUID
   */
  static async getTradesPendingApproval(leagueId: string): Promise<TradeWithDetails[]> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    const { data, error } = await supabase
      .from('trade_history')
      .select('*')
      .eq('league_id', leagueId)
      .eq('status', 'accepted')
      .is('commissioner_approved', null)
      .order('proposed_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to get trades pending approval: ${error.message}`)
    }

    return data.map(this.mapToTradeWithDetails)
  }

  /**
   * Get trade details with Pokemon information
   *
   * @param tradeId - Trade UUID
   */
  static async getTradeWithPokemon(tradeId: string): Promise<TradeWithDetails> {
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    const { data, error } = await supabase
      .from('trade_history')
      .select('*')
      .eq('id', tradeId)
      .single()

    if (error) {
      throw new Error(`Failed to get trade: ${error.message}`)
    }

    const trade = this.mapToTradeWithDetails(data)

    // Fetch Pokemon details for team A's picks
    if (trade.teamAGives.length > 0) {
      const { data: teamAPicks, error: teamAError } = await supabase
        .from('picks')
        .select('*')
        .in('id', trade.teamAGives)

      if (!teamAError && teamAPicks) {
        trade.teamAGivesPokemon = teamAPicks as Pick[]
      }
    }

    // Fetch Pokemon details for team B's picks
    if (trade.teamBGives.length > 0) {
      const { data: teamBPicks, error: teamBError } = await supabase
        .from('picks')
        .select('*')
        .in('id', trade.teamBGives)

      if (!teamBError && teamBPicks) {
        trade.teamBGivesPokemon = teamBPicks as Pick[]
      }
    }

    return trade
  }

  /**
   * Map database record to Trade type
   *
   * @private
   */
  private static mapToTrade(data: any): Trade {
    return {
      id: data.id,
      leagueId: data.league_id,
      weekNumber: data.week_number,
      teamAId: data.team_a_id,
      teamBId: data.team_b_id,
      teamAGives: data.team_a_gives || [],
      teamBGives: data.team_b_gives || [],
      status: data.status,
      proposedBy: data.proposed_by,
      proposedAt: data.proposed_at,
      respondedAt: data.responded_at,
      completedAt: data.completed_at,
      notes: data.notes,
      commissionerApproved: data.commissioner_approved,
      commissionerId: data.commissioner_id,
      commissionerNotes: data.commissioner_notes,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  /**
   * Map trade_history view to TradeWithDetails type
   *
   * @private
   */
  private static mapToTradeWithDetails(data: any): TradeWithDetails {
    return {
      id: data.id,
      leagueId: data.league_id,
      weekNumber: data.week_number,
      teamAId: data.team_a_id,
      teamBId: data.team_b_id,
      teamAGives: data.team_a_gives || [],
      teamBGives: data.team_b_gives || [],
      status: data.status,
      proposedBy: data.proposed_by,
      proposedAt: data.proposed_at,
      respondedAt: data.responded_at,
      completedAt: data.completed_at,
      notes: data.notes,
      commissionerApproved: data.commissioner_approved,
      commissionerId: data.commissioner_id,
      commissionerNotes: data.commissioner_notes,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      teamAName: data.team_a_name,
      teamBName: data.team_b_name,
      proposedByName: data.proposed_by_name,
      leagueName: data.league_name,
    }
  }
}
