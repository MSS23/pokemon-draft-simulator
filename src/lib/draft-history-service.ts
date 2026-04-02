/**
 * Draft History Service — History, results, and public draft methods extracted from DraftService
 *
 * Standalone functions for fetching draft history, results, and public draft listings.
 */
import { supabase } from './supabase'
import { createLogger } from '@/lib/logger'
import type { DraftState } from './draft-service'

const log = createLogger('DraftHistoryService')

// Lazy import to avoid circular deps
async function getDraftStateLazy(draftId: string): Promise<DraftState | null> {
  const { DraftService } = await import('./draft-service')
  return DraftService.getDraftState(draftId)
}

/**
 * Get draft history/results for browsing past drafts
 */
export async function getDraftHistory(limit: number = 20, offset: number = 0): Promise<Record<string, unknown>[]> {
  if (!supabase) throw new Error('Supabase not available')

  // draft_history is a view/table not in Database type
  const { data, error } = await (supabase.from as unknown as (table: string) => ReturnType<typeof supabase.from>)('draft_history')
    .select('*')
    .order('completed_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    log.error('Error fetching draft history:', error)
    throw new Error('Failed to fetch draft history')
  }

  return data || []
}

/**
 * Get detailed results for a specific completed draft
 */
export async function getDraftResults(draftId: string): Promise<Record<string, unknown> | null> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) return null

  // draft_results is a table not in Database type
  const { data: result, error } = await (supabase.from as unknown as (table: string) => ReturnType<typeof supabase.from>)('draft_results')
    .select(`
      *,
      teams:draft_result_teams(*)
    `)
    .eq('draft_id', draftState.draft.id)
    .single()

  if (error) {
    log.error('Error fetching draft results:', error)
    return null
  }

  return result
}

/**
 * Manually save draft results (if auto-save trigger didn't work)
 */
export async function saveDraftResults(draftId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  const draftState = await getDraftStateLazy(draftId)
  if (!draftState) {
    throw new Error('Draft not found')
  }

  const internalId = draftState.draft.id

  // Get the draft
  const { data: draft, error: draftError } = await supabase
    .from('drafts')
    .select('*')
    .eq('id', internalId)
    .single()

  if (draftError || !draft) {
    throw new Error('Draft not found')
  }

  // Manually trigger the save by updating the draft status
  // This will trigger the save_draft_results_trigger
  const { error: updateError } = await supabase
    .from('drafts')
    .update({
      updated_at: new Date().toISOString()
    })
    .eq('id', internalId)

  if (updateError) {
    throw new Error(`Failed to trigger save: ${updateError.message}`)
  }
}

/**
 * Delete draft results (for cleanup)
 */
export async function deleteDraftResults(draftResultId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase not available')

  // draft_results is a table not in Database type
  const { error } = await (supabase.from as unknown as (table: string) => ReturnType<typeof supabase.from>)('draft_results')
    .delete()
    .eq('id', draftResultId)

  if (error) {
    log.error('Error deleting draft results:', error)
    throw new Error('Failed to delete draft results')
  }
}

/**
 * Get all public drafts
 */
export async function getPublicDrafts(options?: {
  status?: 'setup' | 'active' | 'completed' | 'paused'
  limit?: number
  offset?: number
}): Promise<Array<{
  roomCode: string
  name: string
  status: string
  maxTeams: number
  currentTeams: number
  format: string
  createdAt: string
  description: string | null
  tags: string[] | null
  spectatorCount: number
}>> {
  if (!supabase) throw new Error('Supabase not available')

  const { status, limit = 20, offset = 0 } = options || {}

  let query = supabase
    .from('drafts')
    .select('*, teams(count)')
    .eq('is_public', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    log.error('Error fetching public drafts:', error)
    throw new Error('Failed to fetch public drafts')
  }

  return (data || []).map((draft) => ({
    roomCode: draft.room_code || '',
    name: draft.name,
    status: draft.status,
    maxTeams: draft.max_teams,
    currentTeams: (draft.teams as unknown as { count: number }[])?.[0]?.count || 0,
    format: draft.format,
    createdAt: draft.created_at,
    description: draft.description,
    tags: draft.tags,
    spectatorCount: draft.spectator_count || 0
  }))
}
