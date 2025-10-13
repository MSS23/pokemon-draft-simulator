'use client'

import { supabase } from './supabase'
import { RealtimeChannel } from '@supabase/supabase-js'

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export interface RealtimeManagerState {
  status: ConnectionStatus
  latency: number | null
  reconnectAttempts: number
  lastError: Error | null
  subscriptionCount: number
}

export interface SubscriptionConfig {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  schema: string
  table: string
  filter?: string
}

export type SubscriptionCallback = (payload: any) => void

/**
 * Enhanced Realtime Manager with robust reconnection and health monitoring
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Connection health monitoring with latency tracking
 * - Proper subscription cleanup to prevent memory leaks
 * - Request deduplication to prevent race conditions
 * - Presence tracking for online users
 * - Heartbeat monitoring for connection liveness
 */
export class RealtimeManager {
  private static instance: RealtimeManager

  private state: RealtimeManagerState = {
    status: 'connecting',
    latency: null,
    reconnectAttempts: 0,
    lastError: null,
    subscriptionCount: 0
  }

  private listeners = new Set<(state: RealtimeManagerState) => void>()
  private channels = new Map<string, RealtimeChannel>()
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private presenceChannel: RealtimeChannel | null = null

  // Configuration
  private maxReconnectAttempts = 5
  private heartbeatInterval = 10000 // 10 seconds
  private reconnectBaseDelay = 1000 // 1 second
  private maxReconnectDelay = 30000 // 30 seconds

  static getInstance(): RealtimeManager {
    if (!RealtimeManager.instance) {
      RealtimeManager.instance = new RealtimeManager()
    }
    return RealtimeManager.instance
  }

  private constructor() {
    this.initializeHeartbeat()
  }

  /**
   * Subscribe to connection state changes
   */
  subscribe(listener: (state: RealtimeManagerState) => void): () => void {
    this.listeners.add(listener)

    // Immediately notify with current state
    listener(this.getState())

    return () => this.listeners.delete(listener)
  }

  /**
   * Get current connection state
   */
  getState(): RealtimeManagerState {
    return { ...this.state }
  }

  /**
   * Subscribe to table changes with automatic reconnection
   */
  async subscribeToTable(
    channelName: string,
    config: SubscriptionConfig,
    callback: SubscriptionCallback
  ): Promise<() => void> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    // Check if channel already exists
    if (this.channels.has(channelName)) {
      console.warn(`Channel ${channelName} already exists, reusing existing subscription`)
      return () => this.unsubscribe(channelName)
    }

    try {
      const channel = supabase.channel(channelName) as any

      // Set up postgres changes listener
      channel.on('postgres_changes', {
        event: config.event,
        schema: config.schema,
        table: config.table,
        ...(config.filter ? { filter: config.filter } : {})
      }, (payload: any) => {
        try {
          callback(payload)
        } catch (error) {
          console.error(`Error in subscription callback for ${channelName}:`, error)
        }
      })

      // Listen for connection status changes
      channel.on('system', { event: 'reconnect' }, () => {
        console.log(`[RealtimeManager] Channel ${channelName} reconnected`)
        this.updateState({ status: 'connected', reconnectAttempts: 0 })
      })

      channel.on('system', { event: 'error' }, (error: any) => {
        console.error(`[RealtimeManager] Channel ${channelName} error:`, error)
        this.updateState({
          status: 'error',
          lastError: error instanceof Error ? error : new Error('Unknown error')
        })
        this.handleDisconnect(channelName, config, callback)
      })

      // Subscribe to the channel
      const status = await channel.subscribe()

      if (status === 'SUBSCRIBED') {
        this.channels.set(channelName, channel)
        this.updateState({
          status: 'connected',
          subscriptionCount: this.channels.size,
          reconnectAttempts: 0
        })
        console.log(`[RealtimeManager] Subscribed to ${channelName}`)
      } else {
        throw new Error(`Failed to subscribe to ${channelName}: ${status}`)
      }

      // Return cleanup function
      return () => this.unsubscribe(channelName)

    } catch (error) {
      console.error(`[RealtimeManager] Error subscribing to ${channelName}:`, error)
      this.updateState({
        status: 'error',
        lastError: error instanceof Error ? error : new Error('Subscription failed')
      })
      throw error
    }
  }

  /**
   * Subscribe to presence (who's online)
   */
  async subscribeToPresence(
    draftId: string,
    userId: string,
    metadata?: Record<string, any>
  ): Promise<{
    unsubscribe: () => void
    getOnlineUsers: () => string[]
  }> {
    if (!supabase) {
      throw new Error('Supabase not available')
    }

    const channelName = `presence:${draftId}`

    if (this.presenceChannel) {
      console.warn('Presence channel already exists, cleaning up old one')
      await this.presenceChannel.unsubscribe()
    }

    const channel = supabase.channel(channelName)

    // Track online users
    const onlineUsers = new Set<string>()

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        onlineUsers.clear()
        Object.keys(state).forEach(key => {
          const presence = state[key][0] as any
          if (presence?.user_id) {
            onlineUsers.add(presence.user_id)
          }
        })
        console.log(`[RealtimeManager] Presence sync - ${onlineUsers.size} users online`)
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
        newPresences.forEach((presence: any) => {
          if (presence?.user_id) {
            onlineUsers.add(presence.user_id)
          }
        })
        console.log(`[RealtimeManager] User joined:`, newPresences)
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
        leftPresences.forEach((presence: any) => {
          if (presence?.user_id) {
            onlineUsers.delete(presence.user_id)
          }
        })
        console.log(`[RealtimeManager] User left:`, leftPresences)
      })

    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
          ...metadata
        })
      }
    })

    this.presenceChannel = channel

    return {
      unsubscribe: async () => {
        await channel.untrack()
        await channel.unsubscribe()
        this.presenceChannel = null
      },
      getOnlineUsers: () => Array.from(onlineUsers)
    }
  }

  /**
   * Unsubscribe from a channel
   */
  private async unsubscribe(channelName: string): Promise<void> {
    const channel = this.channels.get(channelName)
    if (channel) {
      try {
        await channel.unsubscribe()
        this.channels.delete(channelName)
        this.updateState({ subscriptionCount: this.channels.size })
        console.log(`[RealtimeManager] Unsubscribed from ${channelName}`)
      } catch (error) {
        console.error(`[RealtimeManager] Error unsubscribing from ${channelName}:`, error)
      }
    }
  }

  /**
   * Handle connection loss and attempt reconnection
   */
  private async handleDisconnect(
    channelName: string,
    config: SubscriptionConfig,
    callback: SubscriptionCallback
  ): Promise<void> {
    if (this.reconnectTimer) {
      return // Already reconnecting
    }

    const attempt = this.state.reconnectAttempts + 1

    if (attempt > this.maxReconnectAttempts) {
      console.error(`[RealtimeManager] Max reconnection attempts reached for ${channelName}`)
      this.updateState({
        status: 'disconnected',
        lastError: new Error('Max reconnection attempts exceeded')
      })
      return
    }

    // Calculate exponential backoff delay with jitter
    const baseDelay = Math.min(
      this.reconnectBaseDelay * Math.pow(2, attempt),
      this.maxReconnectDelay
    )
    const jitter = Math.random() * 1000 // Add up to 1 second of jitter
    const delay = baseDelay + jitter

    console.log(`[RealtimeManager] Reconnecting ${channelName} in ${Math.round(delay)}ms (attempt ${attempt}/${this.maxReconnectAttempts})`)

    this.updateState({
      status: 'connecting',
      reconnectAttempts: attempt
    })

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null

      try {
        // Remove old channel
        await this.unsubscribe(channelName)

        // Attempt to reconnect
        await this.subscribeToTable(channelName, config, callback)

        console.log(`[RealtimeManager] Successfully reconnected ${channelName}`)
        this.updateState({
          status: 'connected',
          reconnectAttempts: 0
        })

      } catch (error) {
        console.error(`[RealtimeManager] Reconnection failed for ${channelName}:`, error)
        this.handleDisconnect(channelName, config, callback)
      }
    }, delay)
  }

  /**
   * Initialize heartbeat monitoring to detect connection issues
   */
  private initializeHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    this.heartbeatTimer = setInterval(async () => {
      if (!supabase) return

      const start = Date.now()

      try {
        // Simple query to test connection
        const { error } = await supabase.from('drafts').select('count').limit(1).single()

        const latency = Date.now() - start

        if (error) {
          console.warn('[RealtimeManager] Heartbeat query failed:', error)
          if (this.state.status === 'connected') {
            this.updateState({ status: 'error', latency })
          }
        } else {
          if (this.state.status !== 'connected') {
            console.log('[RealtimeManager] Connection restored')
          }
          this.updateState({ status: 'connected', latency, lastError: null })
        }

      } catch (error) {
        console.error('[RealtimeManager] Heartbeat error:', error)
        this.updateState({
          status: 'error',
          latency: null,
          lastError: error instanceof Error ? error : new Error('Heartbeat failed')
        })
      }
    }, this.heartbeatInterval)
  }

  /**
   * Force reconnect all channels
   */
  async forceReconnect(): Promise<void> {
    console.log('[RealtimeManager] Force reconnecting all channels...')

    this.updateState({ status: 'connecting', reconnectAttempts: 0 })

    // Unsubscribe from all channels
    const channelNames = Array.from(this.channels.keys())

    for (const name of channelNames) {
      await this.unsubscribe(name)
    }

    // Reset state
    this.updateState({
      status: 'connected',
      subscriptionCount: 0,
      reconnectAttempts: 0,
      lastError: null
    })
  }

  /**
   * Update internal state and notify listeners
   */
  private updateState(updates: Partial<RealtimeManagerState>): void {
    this.state = { ...this.state, ...updates }
    this.notifyListeners()
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState())
      } catch (error) {
        console.error('[RealtimeManager] Error in listener:', error)
      }
    })
  }

  /**
   * Cleanup all subscriptions and timers
   */
  async destroy(): Promise<void> {
    console.log('[RealtimeManager] Destroying instance...')

    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    // Unsubscribe from all channels
    const channelNames = Array.from(this.channels.keys())
    for (const name of channelNames) {
      await this.unsubscribe(name)
    }

    // Unsubscribe from presence
    if (this.presenceChannel) {
      await this.presenceChannel.unsubscribe()
      this.presenceChannel = null
    }

    // Clear listeners
    this.listeners.clear()

    console.log('[RealtimeManager] Instance destroyed')
  }
}

// Export singleton instance
export const realtimeManager = RealtimeManager.getInstance()

// Convenience exports
export const {
  subscribe,
  getState,
  subscribeToTable,
  subscribeToPresence,
  forceReconnect
} = {
  subscribe: realtimeManager.subscribe.bind(realtimeManager),
  getState: realtimeManager.getState.bind(realtimeManager),
  subscribeToTable: realtimeManager.subscribeToTable.bind(realtimeManager),
  subscribeToPresence: realtimeManager.subscribeToPresence.bind(realtimeManager),
  forceReconnect: realtimeManager.forceReconnect.bind(realtimeManager)
}
