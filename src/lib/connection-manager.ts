'use client'

import { supabase } from './supabase'

export type ConnectionStatus = 'online' | 'offline' | 'reconnecting' | 'degraded'

export interface ConnectionState {
  status: ConnectionStatus
  isSupabaseConnected: boolean
  lastConnected: string | null
  retryCount: number
  latency: number | null
  offlineCapabilities: {
    canRead: boolean
    canWrite: boolean
    hasCachedData: boolean
  }
}

export interface OfflineAction {
  id: string
  type: 'pick' | 'bid' | 'nominate' | 'join' | 'leave'
  data: any
  timestamp: string
  retryCount: number
  priority: 'high' | 'medium' | 'low'
}

export interface NetworkQuality {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | undefined
  downlink: number | undefined
  rtt: number | undefined
  saveData: boolean
}

class ConnectionManager {
  private static instance: ConnectionManager
  private state: ConnectionState = {
    status: 'online',
    isSupabaseConnected: true,
    lastConnected: new Date().toISOString(),
    retryCount: 0,
    latency: null,
    offlineCapabilities: {
      canRead: true,
      canWrite: false,
      hasCachedData: false
    }
  }
  private listeners = new Set<(state: ConnectionState) => void>()
  private offlineQueue: OfflineAction[] = []
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private networkQuality: NetworkQuality | null = null

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager()
    }
    return ConnectionManager.instance
  }

  constructor() {
    this.initializeConnectionMonitoring()
    this.loadOfflineQueue()
    this.detectNetworkQuality()
  }

  /**
   * Subscribe to connection state changes
   */
  subscribe(listener: (state: ConnectionState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return { ...this.state }
  }

  /**
   * Get current network quality information
   */
  getNetworkQuality(): NetworkQuality | null {
    return this.networkQuality
  }

  /**
   * Check if device is currently online
   */
  isOnline(): boolean {
    return this.state.status === 'online' || this.state.status === 'degraded'
  }

  /**
   * Check if offline mode can handle an action
   */
  canHandleOffline(actionType: string): boolean {
    switch (actionType) {
      case 'read':
        return this.state.offlineCapabilities.canRead
      case 'write':
        return this.state.offlineCapabilities.canWrite
      default:
        return false
    }
  }

  /**
   * Queue an action for when connection is restored
   */
  queueOfflineAction(action: Omit<OfflineAction, 'id' | 'retryCount'>): string {
    const offlineAction: OfflineAction = {
      ...action,
      id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      retryCount: 0
    }

    this.offlineQueue.push(offlineAction)
    this.persistOfflineQueue()

    console.debug(`Queued offline action: ${action.type}`)
    return offlineAction.id
  }

  /**
   * Get queued offline actions
   */
  getOfflineQueue(): OfflineAction[] {
    return [...this.offlineQueue]
  }

  /**
   * Process queued offline actions when connection is restored
   */
  async processOfflineQueue(): Promise<void> {
    if (!this.isOnline() || this.offlineQueue.length === 0) return

    console.debug(`Processing ${this.offlineQueue.length} offline actions`)
    
    // Sort by priority and timestamp
    const sortedActions = [...this.offlineQueue].sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      }
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    })

    const processedActions: string[] = []
    const failedActions: OfflineAction[] = []

    for (const action of sortedActions) {
      try {
        await this.processOfflineAction(action)
        processedActions.push(action.id)
        console.debug(`Successfully processed offline action: ${action.type}`)
      } catch (error) {
        console.warn(`Failed to process offline action ${action.type}:`, error)
        
        action.retryCount++
        if (action.retryCount < 3) {
          failedActions.push(action)
        } else {
          console.error(`Giving up on offline action ${action.type} after ${action.retryCount} retries`)
        }
      }
    }

    // Update queue with only failed actions that haven't exceeded retry limit
    this.offlineQueue = failedActions
    this.persistOfflineQueue()

    if (processedActions.length > 0) {
      this.notifyListeners()
    }
  }

  /**
   * Force reconnection attempt
   */
  async forceReconnect(): Promise<boolean> {
    this.updateState({ status: 'reconnecting', retryCount: this.state.retryCount + 1 })

    try {
      const isConnected = await this.testConnection()
      if (isConnected) {
        this.updateState({
          status: 'online',
          isSupabaseConnected: true,
          lastConnected: new Date().toISOString(),
          retryCount: 0
        })
        
        // Process offline queue
        await this.processOfflineQueue()
        
        return true
      } else {
        this.updateState({ status: 'offline' })
        this.scheduleReconnect()
        return false
      }
    } catch (error) {
      console.error('Force reconnect failed:', error)
      this.updateState({ status: 'offline' })
      this.scheduleReconnect()
      return false
    }
  }

  /**
   * Clear offline queue (useful for cleanup or forced sync)
   */
  clearOfflineQueue(): void {
    this.offlineQueue = []
    this.persistOfflineQueue()
    this.notifyListeners()
  }

  // Private methods

  private initializeConnectionMonitoring(): void {
    if (typeof window === 'undefined') return

    // Monitor browser online/offline events
    window.addEventListener('online', this.handleOnline.bind(this))
    window.addEventListener('offline', this.handleOffline.bind(this))

    // Monitor Supabase connection
    if (supabase) {
      this.setupSupabaseMonitoring()
    }

    // Start heartbeat monitoring
    this.startHeartbeat()

    // Initial connection test
    this.testConnection()
  }

  private setupSupabaseMonitoring(): void {
    if (!supabase) return

    // Monitor Supabase realtime connection
    // Note: These methods may not be available in all Supabase versions
    try {
      if ((supabase.realtime as any).onOpen) {
        (supabase.realtime as any).onOpen(() => {
          console.debug('Supabase realtime connected')
          this.updateState({ isSupabaseConnected: true })
        })
      }

      if ((supabase.realtime as any).onClose) {
        (supabase.realtime as any).onClose(() => {
          console.debug('Supabase realtime disconnected')
          this.updateState({ isSupabaseConnected: false })
        })
      }

      if ((supabase.realtime as any).onError) {
        (supabase.realtime as any).onError((error: any) => {
          console.warn('Supabase realtime error:', error)
          this.updateState({ isSupabaseConnected: false, status: 'degraded' })
        })
      }
    } catch (error) {
      console.warn('Supabase realtime monitoring not available:', error)
    }
  }

  private async testConnection(): Promise<boolean> {
    try {
      const startTime = performance.now()
      
      // Test network connectivity
      const response = await fetch('/api/health', { 
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000)
      })
      
      const latency = performance.now() - startTime
      this.updateState({ latency })

      if (response.ok) {
        // Test Supabase connectivity if available
        if (supabase) {
          const { error } = await supabase.from('drafts').select('count').limit(1)
          const isSupabaseConnected = !error
          
          this.updateState({
            status: isSupabaseConnected ? 'online' : 'degraded',
            isSupabaseConnected,
            lastConnected: new Date().toISOString()
          })
          
          return isSupabaseConnected
        }
        
        return true
      }
      
      return false
    } catch (error) {
      console.warn('Connection test failed:', error)
      return false
    }
  }

  private handleOnline(): void {
    console.debug('Browser reported online')
    this.testConnection().then(isConnected => {
      if (isConnected) {
        this.updateState({
          status: 'online',
          lastConnected: new Date().toISOString(),
          retryCount: 0
        })
        this.processOfflineQueue()
      }
    })
  }

  private handleOffline(): void {
    console.debug('Browser reported offline')
    this.updateState({
      status: 'offline',
      isSupabaseConnected: false
    })
    this.updateOfflineCapabilities()
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.testConnection()
    }, 30000) // Test every 30 seconds
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    // Exponential backoff with jitter
    const delay = Math.min(1000 * Math.pow(2, this.state.retryCount), 30000) + Math.random() * 1000
    
    this.reconnectTimer = setTimeout(() => {
      this.forceReconnect()
    }, delay)
  }

  private updateOfflineCapabilities(): void {
    // Check what we can do offline
    const hasCachedData = this.checkCachedData()
    
    this.updateState({
      offlineCapabilities: {
        canRead: hasCachedData,
        canWrite: false, // Writing requires network
        hasCachedData
      }
    })
  }

  private checkCachedData(): boolean {
    try {
      // Check if we have cached Pokemon data
      const cached = localStorage.getItem('pokemon-cache')
      return !!cached
    } catch {
      return false
    }
  }

  private detectNetworkQuality(): void {
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const connection = (navigator as any).connection
      
      this.networkQuality = {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData || false
      }

      // Listen for network quality changes
      connection.addEventListener('change', () => {
        this.networkQuality = {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData || false
        }
        this.notifyListeners()
      })
    }
  }

  private async processOfflineAction(action: OfflineAction): Promise<void> {
    // This would contain the actual processing logic for each action type
    // For now, we'll simulate the processing
    switch (action.type) {
      case 'pick':
        // Process draft pick
        console.debug('Processing offline pick:', action.data)
        break
      case 'bid':
        // Process auction bid
        console.debug('Processing offline bid:', action.data)
        break
      case 'nominate':
        // Process auction nomination
        console.debug('Processing offline nomination:', action.data)
        break
      default:
        throw new Error(`Unknown offline action type: ${action.type}`)
    }
  }

  private persistOfflineQueue(): void {
    try {
      localStorage.setItem('offline-queue', JSON.stringify(this.offlineQueue))
    } catch (error) {
      console.warn('Failed to persist offline queue:', error)
    }
  }

  private loadOfflineQueue(): void {
    try {
      const stored = localStorage.getItem('offline-queue')
      if (stored) {
        this.offlineQueue = JSON.parse(stored)
        console.debug(`Loaded ${this.offlineQueue.length} offline actions from storage`)
      }
    } catch (error) {
      console.warn('Failed to load offline queue:', error)
      this.offlineQueue = []
    }
  }

  private updateState(updates: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...updates }
    this.notifyListeners()
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state))
  }

  // Cleanup
  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline.bind(this))
      window.removeEventListener('offline', this.handleOffline.bind(this))
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    this.listeners.clear()
  }
}

// Export singleton instance
export const connectionManager = ConnectionManager.getInstance()

// Convenience exports
export const {
  subscribe,
  getState,
  getNetworkQuality,
  isOnline,
  canHandleOffline,
  queueOfflineAction,
  getOfflineQueue,
  processOfflineQueue,
  forceReconnect,
  clearOfflineQueue
} = connectionManager
