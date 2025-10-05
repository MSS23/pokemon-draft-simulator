import { supabase } from './supabase'

export interface PromoteToAdminParams {
  draftId: string
  participantId: string
  promotingUserId: string
}

export interface DemoteFromAdminParams {
  draftId: string
  participantId: string
  demotingUserId: string
}

export class AdminService {
  /**
   * Promotes a participant to admin role
   * Requires the promoting user to be host or admin
   */
  static async promoteToAdmin({
    draftId,
    participantId,
    promotingUserId
  }: PromoteToAdminParams): Promise<{ success: boolean; error?: string }> {
    if (!supabase) {
      return { success: false, error: 'Supabase not available' }
    }

    try {
      const { error } = await (supabase.rpc as any)('promote_to_admin', {
        p_draft_id: draftId,
        p_participant_id: participantId,
        p_promoting_user_id: promotingUserId
      })

      if (error) {
        console.error('Error promoting to admin:', error)
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      console.error('Error promoting to admin:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Demotes an admin to regular participant
   * Requires the demoting user to be host or admin
   * Cannot demote the host
   */
  static async demoteFromAdmin({
    draftId,
    participantId,
    demotingUserId
  }: DemoteFromAdminParams): Promise<{ success: boolean; error?: string }> {
    if (!supabase) {
      return { success: false, error: 'Supabase not available' }
    }

    try {
      const { error } = await (supabase.rpc as any)('demote_from_admin', {
        p_draft_id: draftId,
        p_participant_id: participantId,
        p_demoting_user_id: demotingUserId
      })

      if (error) {
        console.error('Error demoting from admin:', error)
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      console.error('Error demoting from admin:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Checks if a user has admin privileges in a draft
   */
  static async isAdmin(draftId: string, userId: string): Promise<boolean> {
    if (!supabase) {
      return false
    }

    try {
      const { data, error } = await supabase
        .from('participants')
        .select('is_host, is_admin')
        .eq('draft_id', draftId)
        .eq('user_id', userId)
        .single()

      if (error || !data) {
        return false
      }

      return (data as any).is_host || (data as any).is_admin
    } catch (error) {
      console.error('Error checking admin status:', error)
      return false
    }
  }

  /**
   * Gets all admins and the host for a draft
   */
  static async getDraftAdmins(draftId: string) {
    if (!supabase) {
      return { host: null, admins: [] }
    }

    try {
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .eq('draft_id', draftId)
        .or('is_host.eq.true,is_admin.eq.true')

      if (error) {
        console.error('Error fetching admins:', error)
        return { host: null, admins: [] }
      }

      const host = (data as any)?.find((p: any) => p.is_host) || null
      const admins = (data as any)?.filter((p: any) => !p.is_host && p.is_admin) || []

      return { host, admins }
    } catch (error) {
      console.error('Error fetching admins:', error)
      return { host: null, admins: [] }
    }
  }
}
