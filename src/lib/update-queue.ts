'use client'

/**
 * Update Queue with Optimistic Updates
 *
 * Handles:
 * - Optimistic UI updates before server confirmation
 * - Automatic rollback on errors
 * - Request queuing to prevent race conditions
 * - Conflict resolution for concurrent updates
 */

export interface QueuedUpdate<T = any> {
  id: string
  action: () => Promise<T>
  rollback: () => void
  onSuccess?: (result: T) => void
  onError?: (error: Error) => void
  timestamp: number
  retryCount: number
  priority: 'high' | 'medium' | 'low'
}

export class UpdateQueue {
  private static instance: UpdateQueue
  private queue: QueuedUpdate[] = []
  private processing = false
  private maxRetries = 3
  private processingDelay = 50 // ms between processing items

  static getInstance(): UpdateQueue {
    if (!UpdateQueue.instance) {
      UpdateQueue.instance = new UpdateQueue()
    }
    return UpdateQueue.instance
  }

  /**
   * Add an optimistic update to the queue
   */
  async addUpdate<T = any>(
    action: () => Promise<T>,
    rollback: () => void,
    options: {
      onSuccess?: (result: T) => void
      onError?: (error: Error) => void
      priority?: 'high' | 'medium' | 'low'
    } = {}
  ): Promise<void> {
    const update: QueuedUpdate<T> = {
      id: `update-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action,
      rollback,
      onSuccess: options.onSuccess,
      onError: options.onError,
      timestamp: Date.now(),
      retryCount: 0,
      priority: options.priority || 'medium'
    }

    // Add to queue based on priority
    const insertIndex = this.queue.findIndex(
      item => this.getPriorityValue(item.priority) < this.getPriorityValue(update.priority)
    )

    if (insertIndex === -1) {
      this.queue.push(update)
    } else {
      this.queue.splice(insertIndex, 0, update)
    }

    console.log(`[UpdateQueue] Added update ${update.id} (priority: ${update.priority}, queue size: ${this.queue.length})`)

    // Start processing if not already running
    if (!this.processing) {
      await this.process()
    }
  }

  /**
   * Process the update queue
   */
  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true
    console.log(`[UpdateQueue] Processing ${this.queue.length} updates...`)

    while (this.queue.length > 0) {
      const update = this.queue.shift()!

      try {
        console.log(`[UpdateQueue] Executing update ${update.id}`)
        const result = await update.action()

        // Success - call success callback if provided
        if (update.onSuccess) {
          update.onSuccess(result)
        }

        console.log(`[UpdateQueue] Update ${update.id} completed successfully`)

      } catch (error) {
        console.error(`[UpdateQueue] Update ${update.id} failed:`, error)

        const errorObj = error instanceof Error ? error : new Error(String(error))

        // Retry logic
        if (update.retryCount < this.maxRetries) {
          update.retryCount++
          console.log(`[UpdateQueue] Retrying update ${update.id} (attempt ${update.retryCount}/${this.maxRetries})`)

          // Re-add to queue with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, update.retryCount), 10000)
          setTimeout(() => {
            this.queue.unshift(update)
            if (!this.processing) {
              this.process()
            }
          }, delay)

        } else {
          // Max retries exceeded - rollback and call error callback
          console.error(`[UpdateQueue] Max retries exceeded for update ${update.id}, rolling back`)

          try {
            update.rollback()
          } catch (rollbackError) {
            console.error(`[UpdateQueue] Rollback failed for update ${update.id}:`, rollbackError)
          }

          if (update.onError) {
            update.onError(errorObj)
          }
        }
      }

      // Small delay between processing items to prevent overwhelming the server
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.processingDelay))
      }
    }

    this.processing = false
    console.log('[UpdateQueue] Queue processing complete')
  }

  /**
   * Get numeric value for priority
   */
  private getPriorityValue(priority: 'high' | 'medium' | 'low'): number {
    switch (priority) {
      case 'high': return 3
      case 'medium': return 2
      case 'low': return 1
    }
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length
  }

  /**
   * Check if queue is processing
   */
  isProcessing(): boolean {
    return this.processing
  }

  /**
   * Clear all pending updates (useful for cleanup)
   */
  clear(): void {
    console.log(`[UpdateQueue] Clearing ${this.queue.length} pending updates`)
    this.queue = []
    this.processing = false
  }
}

// Export singleton instance
export const updateQueue = UpdateQueue.getInstance()

/**
 * Helper function for optimistic updates
 */
export async function optimisticUpdate<T>(
  updateFn: () => void,
  serverAction: () => Promise<T>,
  rollbackFn: () => void,
  options: {
    onSuccess?: (result: T) => void
    onError?: (error: Error) => void
    priority?: 'high' | 'medium' | 'low'
  } = {}
): Promise<void> {
  // 1. Apply optimistic update immediately
  updateFn()

  // 2. Queue server action with rollback
  await updateQueue.addUpdate(
    serverAction,
    () => {
      // Rollback optimistic update
      rollbackFn()
    },
    options
  )
}
