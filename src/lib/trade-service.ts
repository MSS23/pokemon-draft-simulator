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
  counter_to_id: string | null
  teamAName?: string
  teamBName?: string
  teamAPickNames?: Record<string, string>
  teamBPickNames?: Record<string, string>
}

export interface LeagueActivityItem {
  id: string
  type: 'trade_proposed' | 'trade_accepted' | 'trade_rejected' | 'trade_completed' | 'trade_cancelled' | 'trade_countered' | 'trade_hijacked' | 'waiver_claim'
  timestamp: string
  teamAName?: string
  teamBName?: string
  teamAId?: string
  teamBId?: string
  pokemonNames?: string[]
  notes?: string | null
  tradeId?: string
  status?: string
}

export class TradeService {
  /**
   * Get all trades for a league, with team names resolved
   */
  static async getLeagueTrades(leagueId: string): Promise<TradeWithDetails[]> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await (supabase as SupabaseAny)
      .from('trades')
      .select('id, league_id, week_number, team_a_id, team_b_id, team_a_gives, team_b_gives, status, proposed_by, proposed_at, responded_at, completed_at, notes, commissioner_approved, commissioner_id, commissioner_notes, counter_to_id')
      .eq('league_id', leagueId)
      .order('proposed_at', { ascending: false })

    if (error) {
      log.error('Failed to fetch trades:', error)
      throw new Error('Failed to fetch trades: ' + error?.message || 'Unknown error')
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
      throw new Error('Failed to propose trade: ' + error?.message || 'Unknown error')
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

    const newStatus = accepted ? 'accepted' : 'rejected'

    // Server-side authz: respond_to_trade verifies the caller owns a team in
    // the trade OTHER than the proposer (or is the commissioner), so a
    // proposer can no longer self-accept at the DB level.
    const { error: rpcError } = await (supabase as SupabaseAny)
      .rpc('respond_to_trade', { p_trade_id: tradeId, p_response: newStatus })

    if (rpcError && rpcError.code === 'PGRST202') {
      // Migration not applied yet — legacy status-guarded direct update
      const { data, error } = await (supabase as SupabaseAny)
        .from('trades')
        .update({
          status: newStatus,
          responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tradeId)
        .eq('status', 'proposed')
        .select('league_id')
        .single()
      if (error || !data) {
        log.error('Failed to respond to trade:', error)
        throw new Error('Trade is no longer open for a response')
      }
    } else if (rpcError) {
      log.error('respond_to_trade failed:', rpcError)
      throw new Error(rpcError.message || 'Failed to respond to trade')
    }

    // If accepted and no commissioner approval needed, execute immediately
    if (accepted && !requireCommissionerApproval) {
      await this.executeTrade(tradeId)
    }

    const { data: trade } = await (supabase as SupabaseAny)
      .from('trades')
      .select('league_id')
      .eq('id', tradeId)
      .single()
    if (trade) {
      this.broadcastTradeUpdate(trade.league_id, accepted ? 'accepted' : 'rejected', tradeId)
    }
  }

  /**
   * Execute a trade (swap picks between teams)
   */
  static async executeTrade(tradeId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    // The RPC is the ONLY execution path: it atomically validates ownership
    // of every pick and involved-party authorization. (The old client-side
    // fallback silently no-op'd under RLS and marked failed trades completed.)
    const { error: rpcError } = await (supabase as SupabaseAny)
      .rpc('execute_trade', { trade_uuid: tradeId })

    if (rpcError) {
      log.error('execute_trade failed:', rpcError)
      throw new Error(rpcError.message || 'Failed to execute trade')
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
  }

  /**
   * Cancel a trade (only proposer can cancel)
   */
  static async cancelTrade(tradeId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured')

    // Server-side authz: only the proposing team's owner or the commissioner
    const { error: rpcError } = await (supabase as SupabaseAny)
      .rpc('cancel_trade', { p_trade_id: tradeId })

    if (rpcError && rpcError.code === 'PGRST202') {
      // Migration not applied yet — legacy status-guarded direct update
      const { error } = await (supabase as SupabaseAny)
        .from('trades')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', tradeId)
        .eq('status', 'proposed')
      if (error) {
        log.error('Failed to cancel trade:', error)
        throw new Error('Failed to cancel trade: ' + (error?.message || 'Unknown error'))
      }
    } else if (rpcError) {
      log.error('cancel_trade failed:', rpcError)
      throw new Error(rpcError.message || 'Failed to cancel trade')
    }

    const { data: trade } = await (supabase as SupabaseAny)
      .from('trades')
      .select('league_id')
      .eq('id', tradeId)
      .single()
    if (trade) {
      this.broadcastTradeUpdate(trade.league_id, 'cancelled', tradeId)
    }
  }

  /**
   * Get trades pending commissioner approval
   */
  static async getTradesPendingApproval(leagueId: string): Promise<TradeWithDetails[]> {
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await (supabase as SupabaseAny)
      .from('trades')
      .select('id, league_id, week_number, team_a_id, team_b_id, team_a_gives, team_b_gives, status, proposed_by, proposed_at, responded_at, completed_at, notes, commissioner_approved, commissioner_id, commissioner_notes, counter_to_id')
      .eq('league_id', leagueId)
      .eq('status', 'accepted')
      .is('commissioner_approved', null)
      .order('proposed_at', { ascending: false })

    if (error) {
      log.error('Failed to fetch pending trades:', error)
      throw new Error('Failed to fetch pending trades: ' + error?.message || 'Unknown error')
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

    // Verify the caller actually is this league's commissioner before writing
    const { data: tradeRow } = await (supabase as SupabaseAny)
      .from('trades')
      .select('league_id, status')
      .eq('id', tradeId)
      .single()
    if (!tradeRow) throw new Error('Trade not found')
    const { LeagueService } = await import('./league-service')
    const isCommish = await LeagueService.isLeagueCommissioner(tradeRow.league_id, commissionerId)
    if (!isCommish) throw new Error('Only the league commissioner can approve trades')

    // Server-side authz: approve_trade re-verifies the caller is this
    // league's commissioner and enforces the status guards atomically.
    const { error: rpcError } = await (supabase as SupabaseAny)
      .rpc('approve_trade', { p_trade_id: tradeId, p_approved: approved, p_notes: notes || null })

    if (rpcError && rpcError.code === 'PGRST202') {
      // Migration not applied yet — legacy status-guarded direct updates
      if (approved) {
        // Status guard: only an 'accepted' trade can be approved — a rejected
        // or cancelled trade must not be resurrected by approval.
        const { data, error } = await (supabase as SupabaseAny)
          .from('trades')
          .update({
            commissioner_approved: true,
            commissioner_id: commissionerId,
            commissioner_notes: notes || null,
            responded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', tradeId)
          .eq('status', 'accepted')
          .select('league_id')
          .single()
        if (error || !data) {
          log.error('Failed to approve trade:', error)
          throw new Error('Trade is not in an approvable state')
        }
      } else {
        const { error } = await (supabase as SupabaseAny)
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
        if (error) {
          log.error('Failed to reject trade:', error)
          throw new Error('Failed to reject trade: ' + (error?.message || 'Unknown error'))
        }
      }
    } else if (rpcError) {
      log.error('approve_trade failed:', rpcError)
      throw new Error(rpcError.message || (approved ? 'Trade is not in an approvable state' : 'Failed to reject trade'))
    }

    if (approved) {
      // Execute the pick swap (sets status → 'completed' on success)
      await this.executeTrade(tradeId)
      this.broadcastTradeUpdate(tradeRow.league_id, 'completed', tradeId)
    } else {
      this.broadcastTradeUpdate(tradeRow.league_id, 'rejected', tradeId)
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
   * Counter a trade — reject the original and propose a new trade with modified terms.
   * The counter-offer goes back to the original proposer as team_b.
   */
  static async counterTrade(
    originalTradeId: string,
    teamAId: string,
    teamBId: string,
    teamAGives: string[],
    teamBGives: string[],
    proposedBy: string,
    weekNumber: number,
    notes?: string
  ): Promise<TradeWithDetails> {
    if (!supabase) throw new Error('Supabase not configured')

    // Close the original trade as 'countered'. respond_to_trade enforces the
    // status guard AND that the caller is the receiving side (or commissioner).
    const { error: rpcError } = await (supabase as SupabaseAny)
      .rpc('respond_to_trade', { p_trade_id: originalTradeId, p_response: 'countered' })

    if (rpcError && rpcError.code === 'PGRST202') {
      // Migration not applied yet — legacy status-guarded direct update
      const { data: closed, error: closeError } = await (supabase as SupabaseAny)
        .from('trades')
        .update({
          status: 'countered',
          responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', originalTradeId)
        .eq('status', 'proposed')
        .select('id')
      if (closeError) {
        log.error('Failed to close original trade for counter:', closeError)
        throw new Error('Failed to counter trade: ' + (closeError?.message || 'Unknown error'))
      }
      if (!closed || closed.length === 0) {
        throw new Error('Original trade is no longer open to counter')
      }
    } else if (rpcError) {
      log.error('respond_to_trade (counter) failed:', rpcError)
      throw new Error(rpcError.message || 'Original trade is no longer open to counter')
    }

    // Create counter-offer with reference to original
    const { data, error } = await (supabase as SupabaseAny)
      .from('trades')
      .insert({
        league_id: (await (supabase as SupabaseAny).from('trades').select('league_id').eq('id', originalTradeId).single()).data?.league_id,
        team_a_id: teamAId,
        team_b_id: teamBId,
        team_a_gives: teamAGives,
        team_b_gives: teamBGives,
        proposed_by: proposedBy,
        week_number: weekNumber,
        status: 'proposed',
        notes: notes ? `[Counter] ${notes}` : '[Counter-offer]',
        counter_to_id: originalTradeId,
      })
      .select()
      .single()

    if (error) {
      log.error('Failed to create counter trade:', error)
      throw new Error('Failed to create counter trade: ' + error?.message || 'Unknown error')
    }

    const leagueId = data.league_id
    this.broadcastTradeUpdate(leagueId, 'countered', data.id)

    return data as TradeWithDetails
  }

  /**
   * Hijack a pending trade — a third-party manager proposes a competing offer
   * for the same Pokemon that were being traded.
   */
  static async hijackTrade(
    originalTradeId: string,
    hijackerTeamId: string,
    hijackerGives: string[],
    hijackerWants: string[],
    targetTeamId: string,
    proposedBy: string,
    weekNumber: number,
    notes?: string
  ): Promise<TradeWithDetails> {
    if (!supabase) throw new Error('Supabase not configured')

    // Get the original trade's league
    const { data: originalTrade } = await (supabase as SupabaseAny)
      .from('trades')
      .select('league_id, status')
      .eq('id', originalTradeId)
      .single()

    if (!originalTrade) throw new Error('Original trade not found')
    if (originalTrade.status !== 'proposed') throw new Error('Can only hijack pending trades')

    // Create the hijack trade
    const { data, error } = await (supabase as SupabaseAny)
      .from('trades')
      .insert({
        league_id: originalTrade.league_id,
        team_a_id: hijackerTeamId,
        team_b_id: targetTeamId,
        team_a_gives: hijackerGives,
        team_b_gives: hijackerWants,
        proposed_by: proposedBy,
        week_number: weekNumber,
        status: 'proposed',
        notes: notes ? `[Hijack] ${notes}` : '[Competing offer]',
        counter_to_id: originalTradeId,
      })
      .select()
      .single()

    if (error) {
      log.error('Failed to create hijack trade:', error)
      throw new Error('Failed to create hijack trade: ' + error?.message || 'Unknown error')
    }

    this.broadcastTradeUpdate(originalTrade.league_id, 'hijacked', data.id)

    return data as TradeWithDetails
  }

  /**
   * Get unified activity feed for a league (trades + waiver claims)
   */
  static async getLeagueActivity(leagueId: string): Promise<LeagueActivityItem[]> {
    if (!supabase) throw new Error('Supabase not configured')

    const activities: LeagueActivityItem[] = []

    // Get all trades
    const { data: trades } = await (supabase as SupabaseAny)
      .from('trades')
      .select('id, team_a_id, team_b_id, status, proposed_at, responded_at, completed_at, notes, counter_to_id')
      .eq('league_id', leagueId)
      .order('proposed_at', { ascending: false })
      .limit(50)

    // Resolve team names
    const teamIds = new Set<string>()
    if (trades) {
      for (const t of trades) {
        teamIds.add(t.team_a_id)
        teamIds.add(t.team_b_id)
      }
    }

    // Get waiver claims
    const { data: claims } = await supabase
      .from('waiver_claims')
      .select('id, team_id, status, claimed_pokemon_name, dropped_pick_id, claimed_at, created_at')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (claims) {
      for (const c of claims) {
        teamIds.add(c.team_id)
      }
    }

    const teamMap = new Map<string, string>()
    if (teamIds.size > 0) {
      const { data: teams } = await supabase
        .from('teams')
        .select('id, name')
        .in('id', Array.from(teamIds))

      if (teams) {
        for (const t of teams) {
          teamMap.set(t.id, t.name)
        }
      }
    }

    // Map trades to activity items
    if (trades) {
      for (const t of trades) {
        const typeMap: Record<string, LeagueActivityItem['type']> = {
          proposed: 'trade_proposed',
          accepted: 'trade_accepted',
          rejected: 'trade_rejected',
          completed: 'trade_completed',
          cancelled: 'trade_cancelled',
          countered: 'trade_countered',
        }
        const isHijack = t.counter_to_id && t.notes?.startsWith('[Hijack]')
        activities.push({
          id: `trade-${t.id}`,
          type: isHijack ? 'trade_hijacked' : (typeMap[t.status] || 'trade_proposed'),
          timestamp: t.completed_at || t.responded_at || t.proposed_at,
          teamAName: teamMap.get(t.team_a_id) || 'Unknown',
          teamBName: teamMap.get(t.team_b_id) || 'Unknown',
          teamAId: t.team_a_id,
          teamBId: t.team_b_id,
          notes: t.notes,
          tradeId: t.id,
          status: t.status,
        })
      }
    }

    // Map waiver claims to activity items
    if (claims) {
      for (const c of claims) {
        if (c.status === 'completed' || c.status === 'pending') {
          activities.push({
            id: `waiver-${c.id}`,
            type: 'waiver_claim',
            timestamp: c.claimed_at || c.created_at,
            teamAName: teamMap.get(c.team_id) || 'Unknown',
            teamAId: c.team_id,
            pokemonNames: [c.claimed_pokemon_name],
            notes: c.dropped_pick_id ? 'Swap' : 'Pickup',
            status: c.status,
          })
        }
      }
    }

    // Sort by timestamp descending
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return activities.slice(0, 50)
  }

  /**
   * Broadcast trade update via Supabase channel.
   * Must subscribe before sending — Supabase requires a joined channel to broadcast.
   */
  private static broadcastTradeUpdate(leagueId: string, event: string, tradeId: string): void {
    if (!supabase) return

    try {
      // private: true — gated by realtime.messages RLS (migration 029):
      // league team owners + commissioner only.
      const channel = supabase.channel(`league-trades:${leagueId}`, { config: { private: true } })
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

      // Also invalidate roster caches on league pages when trade completes
      if (event === 'completed') {
        // private: true — gated by realtime.messages RLS (migration 029):
        // league team owners + commissioner only.
        const rosterChannel = supabase.channel(`league-roster-invalidate:${leagueId}`, { config: { private: true } })
        rosterChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            rosterChannel
              .send({
                type: 'broadcast',
                event: 'trade_update',
                payload: { event, tradeId },
              })
              .catch((err) => log.warn('Failed to send roster invalidation:', err))
              .finally(() => supabase!.removeChannel(rosterChannel))
          }
        })
      }
    } catch (err) {
      log.warn('Failed to broadcast trade update:', err)
    }
  }
}
