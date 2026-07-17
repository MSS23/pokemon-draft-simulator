/**
 * Server-authoritative draft "tick" — the safety net that guarantees a draft
 * makes progress even when no client is driving the timer.
 *
 * This is the ONLY place absent-user progression happens. It runs with the
 * service-role client and calls the service-role-only RPCs system_make_pick /
 * system_advance_turn / resolve_auction (see migration
 * 20260705120100_auction_resolve_and_system_rpcs.sql).
 *
 * Two callers:
 *   - /api/draft/[id]/tick     — a connected client posts here when its local
 *                                timer hits 0 (responsive path).
 *   - /api/cron/draft-tick     — Vercel Cron sweeps every active draft every
 *                                minute (backstop for the all-tabs-closed case).
 *
 * Every operation is idempotent: system_* guard on the expected turn and
 * resolve_auction guards on expiry + auction status, so the client tick and the
 * cron tick racing each other is harmless.
 */
import { createServiceRoleClient } from '@/lib/supabase-server'
import { createLogger } from '@/lib/logger'

const log = createLogger('draftTick')

export interface TickResult {
  draftId: string
  action: 'none' | 'auction_resolved' | 'auto_picked' | 'skipped' | 'not_expired' | 'not_active'
  detail?: string
}

/**
 * Advance a single draft if its current turn / auction has timed out.
 * Safe to call repeatedly and concurrently.
 */
export async function processDraftTick(draftId: string): Promise<TickResult> {
  const db = createServiceRoleClient()

  const { data: draft, error: draftError } = await db
    .from('drafts')
    .select('id, status, format, current_turn, current_round, turn_started_at, settings')
    .eq('id', draftId)
    .single()

  if (draftError || !draft) {
    return { draftId, action: 'not_active', detail: 'Draft not found' }
  }
  if (draft.status !== 'active') {
    return { draftId, action: 'not_active' }
  }

  // ---- Auction drafts: resolve the active auction once it has expired ----
  if (draft.format === 'auction') {
    const { data: auction } = await db
      .from('auctions')
      .select('id, auction_end, status')
      .eq('draft_id', draft.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!auction) {
      return { draftId, action: 'none', detail: 'No active auction' }
    }

    // resolve_auction guards expiry itself; calling early is a safe no-op.
    const { data: result, error } = await db.rpc('resolve_auction', {
      p_draft_id: draft.id,
      p_auction_id: auction.id,
    })
    if (error) {
      log.error('resolve_auction failed', { draftId, error: error.message })
      return { draftId, action: 'none', detail: error.message }
    }
    const resolved = (result as { resolved?: boolean; reason?: string } | null)
    if (resolved?.resolved) {
      return { draftId, action: 'auction_resolved' }
    }
    return { draftId, action: resolved?.reason === 'Auction not yet expired' ? 'not_expired' : 'none', detail: resolved?.reason }
  }

  // ---- Snake drafts: auto-pick from wishlist or skip on timeout ----
  const timeLimit = Number(
    (draft.settings as Record<string, unknown> | null)?.timeLimit ?? 0
  )
  if (!timeLimit || timeLimit <= 0) {
    return { draftId, action: 'none', detail: 'No time limit' }
  }
  if (!draft.turn_started_at || draft.current_turn == null) {
    return { draftId, action: 'none', detail: 'Turn not initialized' }
  }

  const elapsedSec = (Date.now() - new Date(draft.turn_started_at).getTime()) / 1000
  if (elapsedSec < timeLimit) {
    return { draftId, action: 'not_expired' }
  }

  const expectedTurn = draft.current_turn

  // Determine whose turn it is.
  const { count: teamCount } = await db
    .from('teams')
    .select('id', { count: 'exact', head: true })
    .eq('draft_id', draft.id)

  const totalTeams = teamCount ?? 0
  if (totalTeams === 0) {
    return { draftId, action: 'none', detail: 'No teams' }
  }

  const { data: currentTeamId, error: teamErr } = await db.rpc('get_current_team_id', {
    p_draft_id: draft.id,
    p_turn: expectedTurn,
    p_total_teams: totalTeams,
  })
  if (teamErr || !currentTeamId) {
    return { draftId, action: 'none', detail: 'Could not determine current team' }
  }

  // Try to auto-pick the highest-priority affordable, un-drafted wishlist mon.
  const autoPick = await tryWishlistAutoPick(db, draft.id, currentTeamId as string, expectedTurn)
  if (autoPick) {
    return { draftId, action: 'auto_picked', detail: autoPick }
  }

  // Nothing to auto-pick — skip the turn.
  const { error: skipErr } = await db.rpc('system_advance_turn', {
    p_draft_id: draft.id,
    p_expected_turn: expectedTurn,
  })
  if (skipErr) {
    log.error('system_advance_turn failed', { draftId, error: skipErr.message })
    return { draftId, action: 'none', detail: skipErr.message }
  }
  return { draftId, action: 'skipped' }
}

type ServiceDb = ReturnType<typeof createServiceRoleClient>

/**
 * Attempt the first affordable, legal-by-availability, un-drafted wishlist item
 * for the given team via the trusted system_make_pick RPC. Returns the picked
 * Pokemon name on success, or null if nothing could be picked.
 */
async function tryWishlistAutoPick(
  db: ServiceDb,
  draftId: string,
  teamId: string,
  expectedTurn: number
): Promise<string | null> {
  const { data: participant } = await db
    .from('participants')
    .select('id')
    .eq('draft_id', draftId)
    .eq('team_id', teamId)
    .maybeSingle()

  if (!participant) return null

  const { data: wishlist } = await db
    .from('wishlist_items')
    .select('pokemon_id, pokemon_name, cost, priority')
    .eq('draft_id', draftId)
    .eq('participant_id', participant.id)
    .eq('is_available', true)
    .order('priority', { ascending: true })

  if (!wishlist || wishlist.length === 0) return null

  const { data: team } = await db
    .from('teams')
    .select('budget_remaining')
    .eq('id', teamId)
    .single()
  const budget = team?.budget_remaining ?? 0

  const { data: existingPicks } = await db
    .from('picks')
    .select('pokemon_id')
    .eq('draft_id', draftId)
  const drafted = new Set((existingPicks ?? []).map((p) => p.pokemon_id))

  for (const item of wishlist) {
    if (drafted.has(item.pokemon_id)) continue
    if (item.cost > budget) continue

    const { data: result, error } = await db.rpc('system_make_pick', {
      p_draft_id: draftId,
      p_team_id: teamId,
      p_pokemon_id: item.pokemon_id,
      p_pokemon_name: item.pokemon_name,
      p_cost: item.cost,
      p_expected_turn: expectedTurn,
    })
    if (error) {
      log.error('system_make_pick failed', { draftId, teamId, error: error.message })
      return null
    }
    const pickResult = result as { success?: boolean; error?: string } | null
    if (pickResult?.success) {
      return item.pokemon_name
    }
    // A full tier or stale wishlist row should not block lower-priority legal
    // choices. Stop only when another tick already moved this turn.
    if (pickResult?.error?.toLowerCase().includes('turn')) return null
  }
  return null
}
