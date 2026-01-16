/**
 * Draft Real-Time Manager
 *
 * A unified, robust subscription manager for draft real-time updates.
 * Features:
 * - Single channel for all draft-related events
 * - Exponential backoff reconnection
 * - Supabase Presence for online status
 * - Event deduplication
 * - Proper cleanup with AbortController
 */

import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from './supabase'

// ============================================
// Types
// ============================================

export type ConnectionStatus =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected' }
  | { status: 'reconnecting'; attempt: number }
  | { status: 'failed'; error: string }

export type DraftEventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

export interface DraftEvent {
  table: 'drafts' | 'teams' | 'picks' | 'participants' | 'auctions'
  eventType: DraftEventType
  data: Record<string, unknown>
  oldData?: Record<string, unknown>
  timestamp: number
}

export interface PresenceState {
  onlineUsers: Set<string>
  userPresence: Map<string, { online_at: number; user_id: string }>
}

export interface DraftRealtimeCallbacks {
  onDraftEvent: (event: DraftEvent) => void
  onConnectionChange: (status: ConnectionStatus) => void
  onPresenceChange?: (presence: PresenceState) => void
  onError?: (error: Error) => void
}

// ============================================
// DraftRealtimeManager Class
// ============================================

export class DraftRealtimeManager {
  private channel: RealtimeChannel | null = null
  private abortController: AbortController
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private baseReconnectDelay = 1000
  private maxReconnectDelay = 30000
  private isSubscribed = false
  private lastEventIds = new Map<string, number>() // For deduplication
  private eventDedupeWindow = 1000 // 1 second window for deduplication
  private presenceState: PresenceState = {
    onlineUsers: new Set(),
    userPresence: new Map()
  }

  constructor(
    private draftId: string,
    private userId: string,
    private callbacks: DraftRealtimeCallbacks
  ) {
    this.abortController = new AbortController()
  }

  /**
   * Subscribe to all draft-related real-time events
   */
  async subscribe(): Promise<void> {
    if (this.abortController.signal.aborted) {
      console.log('[DraftRealtime] Subscription aborted before start')
      return
    }

    this.callbacks.onConnectionChange({ status: 'connecting' })

    try {
      // Create a single channel for all draft events
      this.channel = supabase.channel(`draft:${this.draftId}`, {
        config: {
          presence: { key: this.userId },
          broadcast: { self: false }
        }
      })

      // Subscribe to postgres changes for each table
      this.channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'drafts',
            filter: `id=eq.${this.draftId}`
          },
          (payload) => this.handlePostgresEvent('drafts', payload)
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'teams',
            filter: `draft_id=eq.${this.draftId}`
          },
          (payload) => this.handlePostgresEvent('teams', payload)
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'picks',
            filter: `draft_id=eq.${this.draftId}`
          },
          (payload) => this.handlePostgresEvent('picks', payload)
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'participants',
            filter: `draft_id=eq.${this.draftId}`
          },
          (payload) => this.handlePostgresEvent('participants', payload)
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'auctions',
            filter: `draft_id=eq.${this.draftId}`
          },
          (payload) => this.handlePostgresEvent('auctions', payload)
        )
        // Presence events
        .on('presence', { event: 'sync' }, () => this.handlePresenceSync())
        .on('presence', { event: 'join' }, ({ key, newPresences }) =>
          this.handlePresenceJoin(key, newPresences)
        )
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) =>
          this.handlePresenceLeave(key, leftPresences)
        )
        // Broadcast events (for draft deletion, etc.)
        .on('broadcast', { event: 'draft_deleted' }, (payload) =>
          this.handleBroadcast('draft_deleted', payload)
        )

      // Subscribe to channel
      this.channel.subscribe(async (status) => {
        if (this.abortController.signal.aborted) return

        console.log('[DraftRealtime] Channel status:', status)

        if (status === 'SUBSCRIBED') {
          this.isSubscribed = true
          this.reconnectAttempts = 0
          this.callbacks.onConnectionChange({ status: 'connected' })

          // Track presence
          try {
            await this.channel?.track({
              online_at: Date.now(),
              user_id: this.userId
            })
          } catch (err) {
            console.warn('[DraftRealtime] Failed to track presence:', err)
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.isSubscribed = false
          this.callbacks.onConnectionChange({ status: 'disconnected' })
          this.scheduleReconnect()
        } else if (status === 'CLOSED') {
          this.isSubscribed = false
          this.callbacks.onConnectionChange({ status: 'disconnected' })
        }
      })
    } catch (error) {
      console.error('[DraftRealtime] Subscription error:', error)
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)))
      this.scheduleReconnect()
    }
  }

  /**
   * Handle postgres change events with deduplication
   */
  private handlePostgresEvent(
    table: DraftEvent['table'],
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>
  ): void {
    if (this.abortController.signal.aborted) return

    // Create unique event ID for deduplication
    const record = payload.new || payload.old || {}
    const recordId = record.id as string || ''
    const updatedAt = (record.updated_at || record.created_at || Date.now()) as string | number
    const eventId = `${table}-${payload.eventType}-${recordId}-${updatedAt}`

    // Check for duplicate events within the deduplication window
    const now = Date.now()
    const lastSeen = this.lastEventIds.get(eventId)
    if (lastSeen && now - lastSeen < this.eventDedupeWindow) {
      console.log('[DraftRealtime] Duplicate event ignored:', eventId)
      return
    }

    // Update last seen time
    this.lastEventIds.set(eventId, now)

    // Clean up old event IDs periodically
    if (this.lastEventIds.size > 100) {
      const cutoff = now - this.eventDedupeWindow * 2
      for (const [id, time] of this.lastEventIds) {
        if (time < cutoff) {
          this.lastEventIds.delete(id)
        }
      }
    }

    // Emit the event
    const event: DraftEvent = {
      table,
      eventType: payload.eventType as DraftEventType,
      data: payload.new as Record<string, unknown> || {},
      oldData: payload.old as Record<string, unknown>,
      timestamp: now
    }

    console.log('[DraftRealtime] Event:', table, payload.eventType, recordId)
    this.callbacks.onDraftEvent(event)
  }

  /**
   * Handle presence sync
   */
  private handlePresenceSync(): void {
    if (!this.channel || this.abortController.signal.aborted) return

    const presenceState = this.channel.presenceState()
    const onlineUsers = new Set<string>()
    const userPresence = new Map<string, { online_at: number; user_id: string }>()

    for (const [key, presences] of Object.entries(presenceState)) {
      if (Array.isArray(presences) && presences.length > 0) {
        onlineUsers.add(key)
        const presence = presences[0] as { online_at?: number; user_id?: string }
        userPresence.set(key, {
          online_at: presence.online_at || Date.now(),
          user_id: presence.user_id || key
        })
      }
    }

    this.presenceState = { onlineUsers, userPresence }
    this.callbacks.onPresenceChange?.(this.presenceState)
  }

  /**
   * Handle presence join
   */
  private handlePresenceJoin(
    key: string,
    newPresences: Array<{ online_at?: number; user_id?: string }>
  ): void {
    if (this.abortController.signal.aborted) return

    this.presenceState.onlineUsers.add(key)
    if (newPresences.length > 0) {
      this.presenceState.userPresence.set(key, {
        online_at: newPresences[0].online_at || Date.now(),
        user_id: newPresences[0].user_id || key
      })
    }
    this.callbacks.onPresenceChange?.(this.presenceState)
  }

  /**
   * Handle presence leave
   */
  private handlePresenceLeave(
    key: string,
    _leftPresences: unknown[]
  ): void {
    if (this.abortController.signal.aborted) return

    this.presenceState.onlineUsers.delete(key)
    this.presenceState.userPresence.delete(key)
    this.callbacks.onPresenceChange?.(this.presenceState)
  }

  /**
   * Handle broadcast events
   */
  private handleBroadcast(event: string, payload: unknown): void {
    if (this.abortController.signal.aborted) return

    console.log('[DraftRealtime] Broadcast:', event, payload)

    // Handle draft deletion specially
    if (event === 'draft_deleted') {
      this.callbacks.onDraftEvent({
        table: 'drafts',
        eventType: 'DELETE',
        data: { id: this.draftId, deleted: true, ...(payload as Record<string, unknown>) },
        timestamp: Date.now()
      })
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.abortController.signal.aborted) {
      console.log('[DraftRealtime] Reconnection cancelled - aborted')
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[DraftRealtime] Max reconnection attempts reached')
      this.callbacks.onConnectionChange({
        status: 'failed',
        error: 'Max reconnection attempts reached'
      })
      return
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    )
    this.reconnectAttempts++

    console.log(`[DraftRealtime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    this.callbacks.onConnectionChange({
      status: 'reconnecting',
      attempt: this.reconnectAttempts
    })

    setTimeout(() => {
      if (!this.abortController.signal.aborted) {
        this.reconnect()
      }
    }, delay)
  }

  /**
   * Perform reconnection
   */
  private async reconnect(): Promise<void> {
    console.log('[DraftRealtime] Reconnecting...')

    // Clean up existing channel
    if (this.channel) {
      try {
        await this.channel.unsubscribe()
        supabase.removeChannel(this.channel)
      } catch (err) {
        console.warn('[DraftRealtime] Error during reconnect cleanup:', err)
      }
      this.channel = null
    }

    // Subscribe again
    await this.subscribe()
  }

  /**
   * Get current presence state
   */
  getPresenceState(): PresenceState {
    return this.presenceState
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.isSubscribed
  }

  /**
   * Clean up all subscriptions
   */
  async cleanup(): Promise<void> {
    console.log('[DraftRealtime] Cleaning up...')

    // Signal abort to stop all pending operations
    this.abortController.abort()

    // Clean up channel
    if (this.channel) {
      try {
        await this.channel.unsubscribe()
        supabase.removeChannel(this.channel)
      } catch (err) {
        console.warn('[DraftRealtime] Error during cleanup:', err)
      }
      this.channel = null
    }

    this.isSubscribed = false
    this.lastEventIds.clear()
    this.presenceState = {
      onlineUsers: new Set(),
      userPresence: new Map()
    }
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new DraftRealtimeManager instance
 */
export function createDraftRealtimeManager(
  draftId: string,
  userId: string,
  callbacks: DraftRealtimeCallbacks
): DraftRealtimeManager {
  return new DraftRealtimeManager(draftId, userId, callbacks)
}
