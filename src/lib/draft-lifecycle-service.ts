/**
 * Draft Lifecycle Service — Lifecycle management methods extracted from DraftService
 *
 * Standalone functions for starting, pausing, resuming, ending, resetting,
 * and deleting drafts, plus team/timer management.
 */
import { supabase } from './supabase'
import { broadcastOnDraftChannel } from './draft-broadcast'
import { UserSessionService } from '@/lib/user-session'
import type { DraftRow, TeamRow, ParticipantRow } from '@/types/supabase-helpers'
import { createLogger } from '@/lib/logger'
import { analytics } from '@/lib/analytics'
import type { DraftState } from './draft-service'

const log = createLogger('DraftLifecycleService')

// Lazy import to avoid circular deps
async function getDraftStateLazy(draftId: string): Promise<DraftState | null> {
  const { DraftService } = await import('./draft-service')
  return DraftService.getDraftState(draftId)
}

// Clears the whole draft-state cache: one draft is cached under both its room
// code and its uuid, so deleting a single key leaves the other one stale.
async function invalidateCacheLazy(): Promise<void> {
  const { DraftService } = await import('./draft-service')
  DraftService.invalidateDraftStateCache()
}

/**
 * Validate that a draft can be started
 * Returns validation result with detailed error messages
 */
export async function validateDraftCanStart(draftState: { draft: DraftRow; teams: TeamRow[]; participants: ParticipantRow[] }): Promise<{ valid: boolean; error?: string }> {
  const { draft, teams, participants } = draftState

  // Check 1: Draft must be in setup status
  if (draft.status !== 'setup') {
    if (draft.status === 'active') {
      // Idempotency: if already started, treat as success
      return { valid: true }
    }
    return { valid: false, error: `Draft is in '${draft.status}' status and cannot be started` }
  }

  // Check 2: Must have at least 2 teams
  if (!teams || teams.length < 2) {
    return { valid: false, error: 'At least 2 teams are required to start the draft' }
  }

  // Check 3: Each team must have at least one participant
  const teamsWithoutParticipants = teams.filter((team: TeamRow) => {
    const teamParticipants = participants.filter((p: ParticipantRow) => p.team_id === team.id)
    return teamParticipants.length === 0
  })

  if (teamsWithoutParticipants.length > 0) {
    const teamNames = teamsWithoutParticipants.map((t: TeamRow) => t.name).join(', ')
    return { valid: false, error: `The following teams have no participants: ${teamNames}` }
  }

  // Check 4: Draft order values must be valid (1 to N, no gaps, no duplicates)
  const draftOrders = teams.map((t: TeamRow) => t.draft_order).sort((a: number, b: number) => a - b)
  const expectedOrders = Array.from({ length: teams.length }, (_, i) => i + 1)

  if (JSON.stringify(draftOrders) !== JSON.stringify(expectedOrders)) {
    return { valid: false, error: 'Team draft order is invalid (must be 1 to N with no gaps or duplicates)' }
  }

  // Check 5: All participants must have valid team_id
  const orphanedParticipants = participants.filter((p: ParticipantRow) => {
    return p.team_id && !teams.find((t: TeamRow) => t.id === p.team_id)
  })

  if (orphanedParticipants.length > 0) {
    return { valid: false, error: `Found ${orphanedParticipants.length} participant(s) assigned to non-existent teams` }
  }

  return { valid: true }
}

/**
 * Start a draft (transition from setup to active)
 * Performs comprehensive validation and atomic state update
 */
export async function startDraft(roomCodeOrDraftId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  // Get draft state
  const draftState = await getDraftStateLazy(roomCodeOrDraftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const draftUuid = draftState.draft.id
  const teams = draftState.teams

  // Validate draft can be started
  const validation = await validateDraftCanStart(draftState)
  if (!validation.valid) {
    if (validation.error) {
      throw new Error(validation.error)
    }
    throw new Error('Draft cannot be started')
  }

  // If draft is already active, return success (idempotency)
  if (draftState.draft.status === 'active') {
    log.info('Draft already active, returning success (idempotent)')
    return
  }

  // Host check, validation, auto-shuffle (unless the host already shuffled) and
  // the setup -> active transition all happen atomically server-side.
  const { data: result, error } = await supabase.rpc('start_draft', {
    p_draft_id: draftUuid,
    p_shuffle: true,
  })

  await invalidateCacheLazy()

  if (error) {
    log.error('Error starting draft:', error)

    if (error.code === '42501' || error?.message?.includes('policy')) {
      throw new Error('Permission denied: You do not have permission to start this draft')
    }
    if (error.message?.includes('cannot be started from status')) {
      throw new Error('Draft is no longer in setup (it may already have been started). Refresh to see its current state.')
    }

    throw new Error(`Failed to start draft: ${error?.message || 'Unknown error'}`)
  }

  // { started: false, reason: 'already active' }: a retry or another tab won the race.
  if (!(result as { started?: boolean } | null)?.started) {
    log.info('Draft already active, returning success (idempotent)')
    return
  }

  try {
    analytics.draftStarted({
      draftId: roomCodeOrDraftId,
      participantCount: teams.length,
    })
  } catch { /* analytics failure is non-fatal */ }

  log.info('Draft started successfully:', { draftId: draftUuid, roomCode: roomCodeOrDraftId })
}

export async function pauseDraft(draftId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const { data: paused, error } = await (supabase
    .from('drafts'))
    .update({
      status: 'paused',
      updated_at: new Date().toISOString()
    })
    .eq('id', draftState.draft.id)
    .eq('status', 'active')
    .select('id')

  await invalidateCacheLazy()

  if (error) {
    log.error('Error pausing draft:', error)
    throw new Error('Failed to pause draft')
  }
  if (!paused || paused.length === 0) {
    throw new Error('Only an active draft can be paused')
  }
}

export async function unpauseDraft(draftId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  if (draftState.draft.status !== 'paused') {
    throw new Error('Draft is not paused')
  }

  const { data: resumed, error } = await (supabase
    .from('drafts'))
    .update({
      status: 'active',
      turn_started_at: new Date().toISOString(), // Reset turn timer when resuming
      updated_at: new Date().toISOString()
    })
    .eq('id', draftState.draft.id)
    .eq('status', 'paused')
    .select('id')

  await invalidateCacheLazy()

  if (error) {
    log.error('Error unpausing draft:', error)
    throw new Error('Failed to unpause draft')
  }
  if (!resumed || resumed.length === 0) {
    throw new Error('Draft is not paused')
  }
}

export async function endDraft(draftId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const { data: ended, error } = await (supabase
    .from('drafts'))
    .update({
      status: 'completed',
      updated_at: new Date().toISOString()
    })
    .eq('id', draftState.draft.id)
    .in('status', ['active', 'paused'])
    .select('id')

  await invalidateCacheLazy()

  if (error) {
    log.error('Error ending draft:', error)
    throw new Error('Failed to end draft')
  }
  // 0 rows: the last pick already completed it, or it never started. Nothing to end.
  if (!ended || ended.length === 0) {
    log.info('endDraft: draft was not active or paused; no change', { draftId })
  }
}

export async function resetDraft(draftId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  // Get the draft to verify it exists
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  // One transaction server-side: host check, picks/auctions/bids deleted,
  // budgets/undos/wishlists reset, draft back to setup.
  const { data: result, error } = await supabase.rpc('reset_draft', {
    p_draft_id: draftState.draft.id,
  })

  await invalidateCacheLazy()

  const res = result as { success?: boolean; error?: string } | null
  if (error || !res?.success) {
    log.error('Error resetting draft:', error ?? res?.error)
    throw new Error(res?.error || 'Failed to reset draft')
  }
}

export async function deleteDraft(draftId: string, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  // Get the draft to verify it exists and get the internal ID
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }


  // STEP 1: Broadcast deletion event BEFORE soft-deleting
  // This ensures participants receive the notification before losing access
  try {
    // private: true — gated by realtime.messages RLS (migration 029).
    // The host calling delete is by construction a participant of this draft,
    // so the policy allows the broadcast.
    await broadcastOnDraftChannel(draftId, 'draft_deleted', {
      draftId,
      deletedBy: userId,
      deletedAt: new Date().toISOString(),
      message: 'This draft has been deleted'
    })

    // Give time for message to propagate
    await new Promise(resolve => setTimeout(resolve, 500))
  } catch (error) {
    log.warn('Failed to broadcast deletion event:', error)
    // Continue with deletion even if broadcast fails
  }

  // STEP 2: Soft delete via the server. The live RLS policy on drafts rejects
  // a browser UPDATE that sets deleted_at, so the route does it with the
  // service role after checking the caller is the host.
  const res = await fetch(`/api/draft/${encodeURIComponent(draftState.draft.room_code ?? draftId)}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    log.error('Error soft-deleting draft:', body)
    throw new Error(`Failed to delete draft: ${body.error ?? res.statusText}`)
  }

  log.info(`Draft ${draftId} soft-deleted by user ${userId}`)
}

/**
 * Hard delete a draft (admin only)
 * Permanently removes draft and all related data
 */
export async function hardDeleteDraft(draftId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  // Get the draft to verify it exists and get the internal ID
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const internalId = draftState.draft.id

  // Delete in order due to foreign key constraints
  // Note: Some tables may not exist or may be empty - that's okay
  // 1. Delete picks
  await (supabase.from('picks')).delete().eq('draft_id', internalId)

  // 2. Delete bid history (may not exist)
  try {
    await (supabase.from('bid_history')).delete().eq('draft_id', internalId)
  } catch (_error) {
    log.debug('No bid_history table or no records to delete')
  }

  // 3. Delete auctions
  await (supabase.from('auctions')).delete().eq('draft_id', internalId)

  // 4. Delete wishlists (may not exist)
  try {
    await (supabase.from as (table: string) => ReturnType<typeof supabase.from>)('wishlists').delete().eq('draft_id', internalId)
  } catch (_error) {
    log.debug('No wishlists table or no records to delete')
  }

  // 5. Delete wishlist_items (actual table name)
  try {
    await supabase.from('wishlist_items').delete().eq('draft_id', internalId)
  } catch (_error) {
    log.debug('No wishlist_items to delete')
  }

  // 6. Delete participants
  await (supabase.from('participants')).delete().eq('draft_id', internalId)

  // 7. Delete teams
  await (supabase.from('teams')).delete().eq('draft_id', internalId)

  // 8. Delete draft results if any (may not exist)
  try {
    await (supabase.from as (table: string) => ReturnType<typeof supabase.from>)('draft_results').delete().eq('draft_id', internalId)
  } catch (_error) {
    log.debug('No draft_results table or no records to delete')
  }

  // 9. Finally, delete the draft itself
  const { error: draftError } = await (supabase
    .from('drafts'))
    .delete()
    .eq('id', internalId)

  if (draftError) {
    log.error('Error hard-deleting draft:', draftError)
    throw new Error('Failed to delete draft')
  }

  log.info(`Draft ${draftId} hard-deleted (permanent)`)
}

export async function shuffleDraftOrder(roomCodeOrDraftId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  // Get draft by room code
  const draftState = await getDraftStateLazy(roomCodeOrDraftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const draftUuid = draftState.draft.id

  // Only allow shuffle in setup status
  if (draftState.draft.status !== 'setup') {
    throw new Error('Can only shuffle draft order before draft starts')
  }

  // Get all teams for this draft
  const teams = draftState.teams

  if (!teams || teams.length === 0) {
    throw new Error('No teams in draft')
  }

  const { data: result, error } = await supabase.rpc('shuffle_draft_order', {
    p_draft_id: draftUuid,
  })

  await invalidateCacheLazy()

  const res = result as { success?: boolean; error?: string } | null
  if (error || !res?.success) {
    log.error('Error shuffling draft order:', error ?? res?.error)
    throw new Error(res?.error || 'Failed to shuffle team draft order')
  }
}

/**
 * Resume a draft by rejoining with stored session data
 */
export async function resumeDraft(draftId: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // Check if draft still exists
    const draftState = await getDraftStateLazy(draftId)
    if (!draftState) {
      UserSessionService.updateDraftParticipation(draftId, { status: 'abandoned' })
      return { success: false, error: 'Draft room no longer exists' }
    }

    const participation = UserSessionService.getDraftParticipation(draftId)

    if (participation) {
      // Update last activity
      UserSessionService.updateDraftParticipation(draftId, { status: 'active' })

      // Construct the URL with the stored session data
      const params = new URLSearchParams({
        userName: participation.displayName,
        teamName: participation.teamName || '',
        isHost: participation.isHost.toString()
      })

      return { success: true, url: `/draft/${draftId}?${params.toString()}` }
    }

    // No local participation record — navigate directly to the draft
    // The draft page will resolve the user's identity from auth/session
    return { success: true, url: `/draft/${draftId}` }
  } catch (error) {
    log.error('Error resuming draft:', error)
    return { success: false, error: 'Failed to resume draft' }
  }
}

export async function removeTeam(draftId: string, teamId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) throw new Error('Draft not found')
  if (draftState.draft.status !== 'setup') throw new Error('Can only remove teams before the draft starts')

  // remove_team is host-checked and atomic: participants, picks, the team's
  // nominations and the team are deleted, then draft_order is renumbered 1..N.
  const { error } = await supabase.rpc('remove_team', {
    p_draft_id: draftState.draft.id,
    p_team_id: teamId,
  })

  await invalidateCacheLazy()

  if (error) {
    log.error('Error removing team:', error)
    throw new Error(error.code === '42501' ? 'Only the host can remove teams' : 'Failed to remove team')
  }
  log.info(`Team ${teamId} removed from draft ${draftId}`)
}

export async function updateTimerSetting(draftId: string, timerSeconds: number): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const internalId = draftState.draft.id
  const currentSettings = draftState.draft.settings || {}
  const draftStatus = draftState.draft.status

  // The server tick reads settings.timeLimit directly and the pick RPCs never
  // apply pendingTimerChange, so a mid-turn change takes effect at once. Restart
  // the current turn's clock so a shorter timer cannot expire it instantly.
  const updatedSettings = {
    ...currentSettings,
    timeLimit: timerSeconds,
  }
  const now = new Date().toISOString()

  const { error } = await (supabase
    .from('drafts'))
    .update({
      settings: updatedSettings,
      ...(draftStatus === 'active' && { turn_started_at: now }),
      updated_at: now
    })
    .eq('id', internalId)

  await invalidateCacheLazy()

  if (error) {
    log.error('Error updating timer setting:', error)
    throw new Error('Failed to update timer setting')
  }
}

/**
 * Mark a draft as completed in user session
 */
export function markDraftCompleted(draftId: string): void {
  UserSessionService.updateDraftParticipation(draftId, { status: 'completed' })
}

/**
 * Mark a draft as abandoned in user session
 */
export function markDraftAbandoned(draftId: string): void {
  UserSessionService.updateDraftParticipation(draftId, { status: 'abandoned' })
}

/**
 * Adjust team budget (admin/host only)
 */
export async function adjustTeamBudget(
  draftId: string,
  teamId: string,
  newBudget: number
): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  if (newBudget < 0) {
    throw new Error('Budget cannot be negative')
  }

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const { error } = await (supabase
    .from('teams'))
    .update({
      budget_remaining: newBudget,
      updated_at: new Date().toISOString()
    })
    .eq('id', teamId)
    .eq('draft_id', draftState.draft.id)

  await invalidateCacheLazy()

  if (error) {
    log.error('Error adjusting team budget:', error)
    throw new Error('Failed to adjust team budget')
  }
}

// NOTE: league creation happens on the results page via CreateLeagueModal →
// LeagueService.createLeagueFromDraft, where the host confirms settings.
