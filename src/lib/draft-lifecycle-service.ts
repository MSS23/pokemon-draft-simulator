/**
 * Draft Lifecycle Service — Lifecycle management methods extracted from DraftService
 *
 * Standalone functions for starting, pausing, resuming, ending, resetting,
 * and deleting drafts, plus team/timer management.
 */
import { supabase } from './supabase'
import { UserSessionService } from '@/lib/user-session'
import type { DraftRow, TeamRow, ParticipantRow } from '@/types/supabase-helpers'
import type { DraftSettings as DraftSettingsJson } from '@/types/supabase-helpers'
import { createLogger } from '@/lib/logger'
import { analytics } from '@/lib/analytics'
import type { DraftState } from './draft-service'

const log = createLogger('DraftLifecycleService')

// Lazy import to avoid circular deps
async function getDraftStateLazy(draftId: string): Promise<DraftState | null> {
  const { DraftService } = await import('./draft-service')
  return DraftService.getDraftState(draftId)
}

async function invalidateCacheLazy(draftId?: string): Promise<void> {
  const { DraftService } = await import('./draft-service')
  DraftService.invalidateDraftStateCache(draftId)
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

  // Check if draft order needs to be shuffled
  // Only auto-shuffle if the host hasn't manually shuffled (check settings flag)
  const draftOrderShuffled = draftState.draft.settings?.draftOrderShuffled || false
  const needsShuffle = !draftOrderShuffled

  if (needsShuffle) {
    log.info('Auto-shuffling draft order (not manually shuffled)')

    // Generate randomized order
    const randomizedOrder = teams.map((_: TeamRow, index: number) => index + 1)
    for (let i = randomizedOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [randomizedOrder[i], randomizedOrder[j]] = [randomizedOrder[j], randomizedOrder[i]]
    }

    // Update each team with new randomized draft order
    const updatePromises = teams.map((team: TeamRow, index: number) =>
      supabase
        .from('teams')
        .update({ draft_order: randomizedOrder[index] })
        .eq('id', team.id)
    )

    const results = await Promise.all(updatePromises)

    // Check for errors in shuffle updates
    const shuffleErrors = results.filter(r => r.error)
    if (shuffleErrors.length > 0) {
      log.error('Error shuffling teams:', shuffleErrors)
      throw new Error('Failed to shuffle team draft order')
    }

    log.info('Team draft order shuffled successfully')
  }

  // Prepare updated settings (mark as shuffled if we just shuffled)
  const updatedSettings = needsShuffle
    ? {
        ...(draftState.draft.settings || {}),
        draftOrderShuffled: true
      }
    : draftState.draft.settings

  // Atomically set draft to active with first turn AND update settings in single operation
  // This reduces subscription triggers from 2 to 1, preventing race conditions
  const { error } = await supabase
    .from('drafts')
    .update({
      status: 'active',
      current_turn: 1,
      turn_started_at: new Date().toISOString(),
      settings: updatedSettings,
      updated_at: new Date().toISOString()
    })
    .eq('id', draftUuid)
    .eq('status', 'setup') // Only update if still in setup (prevent race conditions)

  if (error) {
    log.error('Error updating draft status:', error)

    // Check if it's an RLS policy error
    if (error.code === '42501' || error?.message?.includes('policy')) {
      throw new Error('Permission denied: You do not have permission to start this draft')
    }

    throw new Error(`Failed to start draft: ${error?.message || 'Unknown error'}`)
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

  const { error } = await (supabase
    .from('drafts'))
    .update({
      status: 'paused',
      updated_at: new Date().toISOString()
    })
    .eq('id', draftState.draft.id)

  if (error) {
    log.error('Error pausing draft:', error)
    throw new Error('Failed to pause draft')
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

  const { error } = await (supabase
    .from('drafts'))
    .update({
      status: 'active',
      turn_started_at: new Date().toISOString(), // Reset turn timer when resuming
      updated_at: new Date().toISOString()
    })
    .eq('id', draftState.draft.id)

  if (error) {
    log.error('Error unpausing draft:', error)
    throw new Error('Failed to unpause draft')
  }
}

export async function endDraft(draftId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const { error } = await (supabase
    .from('drafts'))
    .update({
      status: 'completed',
      updated_at: new Date().toISOString()
    })
    .eq('id', draftState.draft.id)

  if (error) {
    log.error('Error ending draft:', error)
    throw new Error('Failed to end draft')
  }
}

export async function resetDraft(draftId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  // Get the draft to verify it exists
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  // Delete all picks
  const { error: picksError } = await (supabase
    .from('picks'))
    .delete()
    .eq('draft_id', draftState.draft.id)

  if (picksError) {
    log.error('Error deleting picks:', picksError)
    throw new Error('Failed to delete picks')
  }

  // Delete all auctions if any
  const { error: auctionsError } = await (supabase
    .from('auctions'))
    .delete()
    .eq('draft_id', draftState.draft.id)

  if (auctionsError) {
    log.error('Error deleting auctions:', auctionsError)
    // Don't throw - auctions might not exist
  }

  // Delete all bid history if any
  const { error: bidsError } = await (supabase
    .from('bid_history'))
    .delete()
    .eq('draft_id', draftState.draft.id)

  if (bidsError) {
    log.error('Error deleting bids:', bidsError)
    // Don't throw - bids might not exist
  }

  // Reset team budgets and picks
  const { error: teamsError } = await (supabase
    .from('teams'))
    .update({
      budget_remaining: draftState.draft.budget_per_team
    })
    .eq('draft_id', draftState.draft.id)

  if (teamsError) {
    log.error('Error resetting teams:', teamsError)
    throw new Error('Failed to reset teams')
  }

  // Reset draft status
  const { error: draftError } = await (supabase
    .from('drafts'))
    .update({
      status: 'setup',
      current_turn: null,
      current_round: 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', draftState.draft.id)

  if (draftError) {
    log.error('Error resetting draft:', draftError)
    throw new Error('Failed to reset draft')
  }
}

export async function deleteDraft(draftId: string, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  // Get the draft to verify it exists and get the internal ID
  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const internalId = draftState.draft.id

  // STEP 1: Broadcast deletion event BEFORE soft-deleting
  // This ensures participants receive the notification before losing access
  try {
    const channel = supabase.channel(`draft:${draftId}`)
    await channel.send({
      type: 'broadcast',
      event: 'draft_deleted',
      payload: {
        draftId,
        deletedBy: userId,
        deletedAt: new Date().toISOString(),
        message: 'This draft has been deleted'
      }
    })

    // Give time for message to propagate
    await new Promise(resolve => setTimeout(resolve, 500))

    // Unsubscribe the channel
    await channel.unsubscribe()
  } catch (error) {
    log.warn('Failed to broadcast deletion event:', error)
    // Continue with deletion even if broadcast fails
  }

  // STEP 2: Soft delete the draft
  const { error: draftError } = await (supabase
    .from('drafts'))
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
      updated_at: new Date().toISOString()
    })
    .eq('id', internalId)

  if (draftError) {
    log.error('Error soft-deleting draft:', draftError)
    throw new Error('Failed to delete draft')
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

  // Randomize draft order using Fisher-Yates shuffle
  const randomizedOrder = teams.map((_, index) => index + 1)
  for (let i = randomizedOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [randomizedOrder[i], randomizedOrder[j]] = [randomizedOrder[j], randomizedOrder[i]]
  }

  // Update each team with new randomized draft order
  const updatePromises = teams.map((team, index) => {
    log.info(`Updating team ${team.name} to draft_order ${randomizedOrder[index]}`)
    return supabase
      .from('teams')
      .update({ draft_order: randomizedOrder[index] })
      .eq('id', team.id)
  })

  const results = await Promise.all(updatePromises)
  log.info('Team updates completed:', results.map(r => ({ error: r.error, count: r.count })))

  // Update draft settings to mark as manually shuffled
  const updatedSettings = {
    ...(draftState.draft.settings || {}),
    draftOrderShuffled: true
  }

  const { error: draftUpdateError } = await supabase
    .from('drafts')
    .update({
      settings: updatedSettings,
      updated_at: new Date().toISOString()
    })
    .eq('id', draftUuid)

  log.info('Draft update:', { error: draftUpdateError, draftId: draftUuid })
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

  // Delete any picks for this team (shouldn't exist in waiting, but be safe)
  await (supabase.from('picks')).delete().eq('team_id', teamId)

  // Delete the team
  const { error } = await (supabase.from('teams')).delete().eq('id', teamId)
  if (error) {
    log.error('Error removing team:', error)
    throw new Error('Failed to remove team')
  }

  await invalidateCacheLazy(draftId)
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

  // If draft hasn't started yet, apply immediately
  // Otherwise, apply on next turn
  const updatedSettings = {
    ...currentSettings,
    timeLimit: timerSeconds,
    // Only mark as pending if draft is already active
    ...(draftStatus === 'active' && { pendingTimerChange: timerSeconds })
  }

  const { error } = await (supabase
    .from('drafts'))
    .update({
      settings: updatedSettings,
      updated_at: new Date().toISOString()
    })
    .eq('id', internalId)

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

  if (error) {
    log.error('Error adjusting team budget:', error)
    throw new Error('Failed to adjust team budget')
  }
}

/**
 * Create league(s) for a completed draft
 */
export async function createLeagueForCompletedDraft(
  draftId: string,
  settings: DraftSettingsJson
): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  try {
    const { LeagueService } = await import('./league-service')

    const leagueWeeks = settings.leagueWeeks || 4
    const splitIntoConferences = settings.splitIntoConferences || false

    const { leagues } = await LeagueService.createLeagueFromDraft(draftId, {
      splitIntoConferences,
      totalWeeks: leagueWeeks,
      matchFormat: 'best_of_3',
      maxMatchesPerWeek: 1
    })

    // Initialize Pokemon status tracking and league settings for each league
    for (const league of leagues) {
      await LeagueService.initializeLeaguePokemonStatus(league.id)
      await LeagueService.updateLeagueSettings(league.id, {
        matchFormat: 'best_of_3',
      })
    }

    log.info('League created successfully for draft:', draftId)
  } catch (error) {
    log.error('Failed to create league:', error)
    throw error
  }
}
