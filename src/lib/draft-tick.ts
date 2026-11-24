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

// Cron retries a broken draft every minute. Log a new error at error level,
// and the same error again for the same draft and step at warn level only.
// shortcut: per-instance memory, so each cold start logs once at error; move
// to a durable drafts.tick_error_until backoff if logs still flood.
const lastTickError = new Map<string, string>()
const MAX_TRACKED_TICK_ERRORS = 1000

/** @internal exported for tests */
export function logTickError(step: string, draftId: string, message: string, extra: Record<string, unknown> = {}): void {
  const key = `${draftId}:${step}`
  if (lastTickError.get(key) === message) {
    log.warn(`${step} failed (repeat)`, { draftId, error: message, ...extra })
    return
  }
  if (lastTickError.size >= MAX_TRACKED_TICK_ERRORS) lastTickError.clear()
  lastTickError.set(key, message)
  log.error(`${step} failed`, { draftId, error: message, ...extra })
}

export interface TickResult {
  draftId: string
  action: 'none' | 'auction_resolved' | 'auto_picked' | 'skipped' | 'nomination_skipped' | 'not_expired' | 'not_active'
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
    .select('id, status, format, current_turn, current_round, turn_started_at, settings, deleted_at')
    .eq('id', draftId)
    .single()

  if (draftError || !draft) {
    return { draftId, action: 'not_active', detail: 'Draft not found' }
  }
  // Soft-deleted drafts can still carry status='active'; never progress them.
  if (draft.status !== 'active' || draft.deleted_at) {
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
      // No active auction means we are waiting on a nomination. If the team on
      // the clock has run out the nomination window, skip their turn so an AFK
      // nominator cannot deadlock the draft.
      const nominationLimit = Number(
        (draft.settings as Record<string, unknown> | null)?.timeLimit ?? 0
      )
      if (!nominationLimit || nominationLimit <= 0 || !draft.turn_started_at || draft.current_turn == null) {
        return { draftId, action: 'none', detail: 'No active auction' }
      }
      const nominationElapsed =
        (Date.now() - new Date(draft.turn_started_at).getTime()) / 1000
      if (nominationElapsed < nominationLimit) {
        return { draftId, action: 'not_expired', detail: 'Awaiting nomination' }
      }
      const { data: skipResult, error: skipError } = await db.rpc('system_skip_nomination', {
        p_draft_id: draft.id,
        p_expected_turn: draft.current_turn,
      })
      if (skipError) {
        logTickError('system_skip_nomination', draftId, skipError.message)
        return { draftId, action: 'none', detail: skipError.message }
      }
      const skipped = skipResult as { skipped?: boolean; reason?: string } | null
      return skipped?.skipped
        ? { draftId, action: 'nomination_skipped' }
        : { draftId, action: 'none', detail: skipped?.reason }
    }

    // resolve_auction guards expiry itself; calling early is a safe no-op.
    const { data: result, error } = await db.rpc('resolve_auction', {
      p_draft_id: draft.id,
      p_auction_id: auction.id,
    })
    if (error) {
      logTickError('resolve_auction', draftId, error.message)
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
  if (autoPick.kind === 'picked') {
    return { draftId, action: 'auto_picked', detail: autoPick.name }
  }
  // A transient query/RPC failure must not cost the team its pick: leave the
  // turn for the next tick to retry. After the grace window, skip anyway so a
  // deterministic error cannot stall the draft forever.
  if (autoPick.kind === 'error' && elapsedSec < timeLimit + AUTO_PICK_ERROR_GRACE_SEC) {
    return { draftId, action: 'none', detail: autoPick.message }
  }

  // Nothing to auto-pick — skip the turn.
  const { error: skipErr } = await db.rpc('system_advance_turn', {
    p_draft_id: draft.id,
    p_expected_turn: expectedTurn,
  })
  if (skipErr) {
    logTickError('system_advance_turn', draftId, skipErr.message)
    return { draftId, action: 'none', detail: skipErr.message }
  }
  return { draftId, action: 'skipped' }
}

type ServiceDb = ReturnType<typeof createServiceRoleClient>

const AUTO_PICK_ERROR_GRACE_SEC = 60

type AutoPickResult =
  | { kind: 'picked'; name: string }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }

/**
 * Attempt the first affordable, legal-by-availability, un-drafted wishlist item
 * for the given team via the trusted system_make_pick RPC. Distinguishes
 * "nothing pickable" (empty) from a failed query/RPC (error), so a transient
 * failure is retried instead of skipping the turn.
 */
async function tryWishlistAutoPick(
  db: ServiceDb,
  draftId: string,
  teamId: string,
  expectedTurn: number
): Promise<AutoPickResult> {
  // A team can have more than one participant (co-owners); use every
  // participant's wishlist rather than .maybeSingle(), which errors on 2+ rows.
  const { data: participants, error: partErr } = await db
    .from('participants')
    .select('id')
    .eq('draft_id', draftId)
    .eq('team_id', teamId)
  if (partErr) return { kind: 'error', message: partErr.message }

  const participantIds = (participants ?? []).map((p) => p.id)
  if (participantIds.length === 0) return { kind: 'empty' }

  const { data: wishlist, error: wishErr } = await db
    .from('wishlist_items')
    .select('pokemon_id, pokemon_name, cost, priority')
    .eq('draft_id', draftId)
    .in('participant_id', participantIds)
    .eq('is_available', true)
    .order('priority', { ascending: true })

  if (wishErr) return { kind: 'error', message: wishErr.message }
  if (!wishlist || wishlist.length === 0) return { kind: 'empty' }

  const { data: team, error: teamErr } = await db
    .from('teams')
    .select('budget_remaining')
    .eq('id', teamId)
    .single()
  if (teamErr || !team) return { kind: 'error', message: teamErr?.message ?? 'Team not found' }
  const budget = team.budget_remaining ?? 0

  const { data: existingPicks, error: picksErr } = await db
    .from('picks')
    .select('pokemon_id')
    .eq('draft_id', draftId)
  if (picksErr) return { kind: 'error', message: picksErr.message }
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
      logTickError('system_make_pick', draftId, error.message, { teamId })
      return { kind: 'error', message: error.message }
    }
    const pickResult = result as { success?: boolean; error?: string } | null
    if (pickResult?.success) {
      return { kind: 'picked', name: item.pokemon_name }
    }
    // A full tier or stale wishlist row should not block lower-priority legal
    // choices. Stop only when another tick already moved this turn.
    if (pickResult?.error?.toLowerCase().includes('turn')) return { kind: 'empty' }
  }
  return { kind: 'empty' }
}
