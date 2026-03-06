import { supabase } from '@/lib/supabase'
import { createLogger } from '@/lib/logger'

const log = createLogger('TradeService')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any

export interface TradeWithDetails {
  id: string
  league_id: string
  week_number: number
  team_a_id: string
  team_b_id: string
  team_a_gives: string[]
  team_b_gives: string[]
  status: string
  proposed_by: string
  proposed_at: string
  responded_at: string | null
  completed_at: string | null
  notes: string | null
  commissioner_approved: boolean | null
  commissioner_id: string | null
  commissioner_notes: string | null
  teamAName?: string
  teamBName?: string
  teamAPickNames?: Record<string, string>
  teamBPickNames?: Record<string, string>
}

export class TradeService {
  /**
   * Get all trades for a league, with team names resolved
   */
  static async getLeagueTrades(leagueId: string): Promise<TradeWithDetails[]> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await (supabase as SupabaseAny)
      .from('trades')
      .select('*')
      .eq('league_id', leagueId)
      .order('proposed_at', { ascending: false })

    if (error) {
      log.error('Failed to fetch trades:', error)
      throw new Error('Failed to fetch trades: ' + error.message)
    }

    if (!data || data.length === 0) return []

    // Resolve team names
    const teamIds = new Set<string>()
    for (const t of data) {
      teamIds.add(t.team_a_id)
      teamIds.add(t.team_b_id)
    }

    const { data: teams } = await supabase
      .from('teams')
      .select('id, name')
      .in('id', Array.from(teamIds))

    const teamMap = new Map<string, string>()
    if (teams) {
      for (const t of teams) {
        teamMap.set(t.id, t.name)
      }
    }

    return (data as TradeWithDetails[]).map(t => ({
      ...t,
      teamAName: teamMap.get(t.team_a_id) || 'Unknown',
      teamBName: teamMap.get(t.team_b_id) || 'Unknown',
    }))
  }

  /**
   * Propose a new trade
   */
  static async proposeTrade(
    leagueId: string,
    teamAId: string,
    teamBId: string,
    teamAGives: string[],
    teamBGives: string[],
    proposedBy: string,
    weekNumber: number,
    notes?: string
  ): Promise<TradeWithDetails> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await (supabase as SupabaseAny)
      .from('trades')
      .insert({
        league_id: leagueId,
        team_a_id: teamAId,
        team_b_id: teamBId,
        team_a_gives: teamAGives,
        team_b_gives: teamBGives,
        proposed_by: proposedBy,
        week_number: weekNumber,
        status: 'proposed',
        notes: notes || null,
      })
      .select()
      .single()

    if (error) {
      log.error('Failed to propose trade:', error)
      throw new Error('Failed to propose trade: ' + error.message)
    }

    // Broadcast to league channel
    this.broadcastTradeUpdate(leagueId, 'proposed', data.id)

    return data as TradeWithDetails
  }

  /**
   * Accept or reject a trade (called by the receiving team)
   */
  static async respondToTrade(
    tradeId: string,
    accepted: boolean,
    requireCommissionerApproval = false
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    const newStatus = accepted
      ? (requireCommissionerApproval ? 'accepted' : 'accepted')
      : 'rejected'

    const { data, error } = await (supabase as SupabaseAny)
      .from('trades')
      .update({
        status: newStatus,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tradeId)
      .select('league_id')
      .single()

    if (error) {
      log.error('Failed to respond to trade:', error)
      throw new Error('Failed to respond to trade: ' + error.message)
    }

    // If accepted and no commissioner approval needed, execute immediately
    if (accepted && !requireCommissionerApproval) {
      await this.executeTrade(tradeId)
    }

    this.broadcastTradeUpdate(data.league_id, accepted ? 'accepted' : 'rejected', tradeId)
  }

  /**
   * Execute a trade (swap picks between teams)
   */
  static async executeTrade(tradeId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    try {
      // Try the RPC function first (atomic)
      const { error: rpcError } = await (supabase as SupabaseAny)
        .rpc('execute_trade', { trade_uuid: tradeId })

      if (rpcError) {
        log.warn('RPC execute_trade failed, falling back to manual swap:', rpcError)
        await this.executeTradeManually(tradeId)
        return
      }

      // Fetch league_id for broadcast
      const { data: trade } = await (supabase as SupabaseAny)
        .from('trades')
        .select('league_id')
        .eq('id', tradeId)
        .single()

      if (trade) {
        this.broadcastTradeUpdate(trade.league_id, 'completed', tradeId)
      }
    } catch (err) {
      log.error('Failed to execute trade:', err)
      throw new Error('Failed to execute trade')
    }
  }

  /**
   * Manual fallback for trade execution if RPC not available
   */
  private static async executeTradeManually(tradeId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data: trade, error } = await (supabase as SupabaseAny)
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single()

    if (error || !trade) {
      throw new Error('Trade not found')
    }

    if (trade.status !== 'accepted') {
      throw new Error(`Trade must be accepted to execute (current: ${trade.status})`)
    }

    // Swap team A's picks to team B
    for (const pickId of (trade.team_a_gives || [])) {
      const { error: swapErr } = await supabase
        .from('picks')
        .update({ team_id: trade.team_b_id })
        .eq('id', pickId)
        .eq('team_id', trade.team_a_id)

      if (swapErr) {
        log.error(`Failed to swap pick ${pickId} from A to B:`, swapErr)
        throw new Error(`Failed to swap pick ${pickId}`)
      }
    }

    // Swap team B's picks to team A
    for (const pickId of (trade.team_b_gives || [])) {
      const { error: swapErr } = await supabase
        .from('picks')
        .update({ team_id: trade.team_a_id })
        .eq('id', pickId)
        .eq('team_id', trade.team_b_id)

      if (swapErr) {
        log.error(`Failed to swap pick ${pickId} from B to A:`, swapErr)
        throw new Error(`Failed to swap pick ${pickId}`)
      }
    }

    // Mark completed
    await (supabase as SupabaseAny)
      .from('trades')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tradeId)

    this.broadcastTradeUpdate(trade.league_id, 'completed', tradeId)
  }

  /**
   * Cancel a trade (only proposer can cancel)
   */
  static async cancelTrade(tradeId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await (supabase as SupabaseAny)
      .from('trades')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', tradeId)
      .eq('status', 'proposed')
      .select('league_id')
      .single()

    if (error) {
      log.error('Failed to cancel trade:', error)
      throw new Error('Failed to cancel trade: ' + error.message)
    }

    this.broadcastTradeUpdate(data.league_id, 'cancelled', tradeId)
  }

  /**
   * Get trades pending commissioner approval
   */
  static async getTradesPendingApproval(leagueId: string): Promise<TradeWithDetails[]> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await (supabase as SupabaseAny)
      .from('trades')
      .select('*')
      .eq('league_id', leagueId)
      .eq('status', 'accepted')
      .is('commissioner_approved', null)
      .order('proposed_at', { ascending: false })

    if (error) {
      log.error('Failed to fetch pending trades:', error)
      throw new Error('Failed to fetch pending trades: ' + error.message)
    }

    return (data || []) as TradeWithDetails[]
  }

  /**
   * Commissioner approves or rejects a trade
   */
  static async approveTrade(
    tradeId: string,
    commissionerId: string,
    approved: boolean,
    notes?: string
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    if (approved) {
      // Set to 'accepted' so executeTrade (and its RPC) can run — it requires this status
      const { data, error } = await (supabase as SupabaseAny)
        .from('trades')
        .update({
          commissioner_approved: true,
          commissioner_id: commissionerId,
          commissioner_notes: notes || null,
          status: 'accepted',
          responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tradeId)
        .select('league_id')
        .single()

      if (error) {
        log.error('Failed to approve trade:', error)
        throw new Error('Failed to approve trade: ' + error.message)
      }

      // Execute the pick swap (sets status → 'completed' on success)
      await this.executeTrade(tradeId)

      this.broadcastTradeUpdate(data.league_id, 'completed', tradeId)
    } else {
      const { data, error } = await (supabase as SupabaseAny)
        .from('trades')
        .update({
          commissioner_approved: false,
          commissioner_id: commissionerId,
          commissioner_notes: notes || null,
          status: 'rejected',
          responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tradeId)
        .select('league_id')
        .single()

      if (error) {
        log.error('Failed to reject trade:', error)
        throw new Error('Failed to reject trade: ' + error.message)
      }

      this.broadcastTradeUpdate(data.league_id, 'rejected', tradeId)
    }

    const { error: approvalError } = await (supabase as SupabaseAny)
      .from('trade_approvals')
      .insert({
        trade_id: tradeId,
        approver_user_id: commissionerId,
        approver_role: 'commissioner',
        approved,
        comments: notes || null,
      })

    if (approvalError) {
      log.warn('Failed to record trade approval:', approvalError)
    }
  }

  /**
   * Broadcast trade update via Supabase channel.
   * Must subscribe before sending — Supabase requires a joined channel to broadcast.
   */
  private static broadcastTradeUpdate(leagueId: string, event: string, tradeId: string): void {
    if (!supabase) return

    try {
      const channel = supabase.channel(`league-trades:${leagueId}`)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel
            .send({
              type: 'broadcast',
              event: 'trade_update',
              payload: { event, tradeId, leagueId },
            })
            .catch((err) => log.warn('Failed to send trade broadcast:', err))
            .finally(() => supabase!.removeChannel(channel))
        }
      })
    } catch (err) {
      log.warn('Failed to broadcast trade update:', err)
    }
  }
}
