/**
 * IndexedDB Persistent Cache for Draft State
 *
 * Provides offline persistence for active draft state so users can
 * view their draft UI even when disconnected. On reconnection the
 * cached state is replaced by the live server state.
 *
 * Pattern mirrors pokemon-cache-db.ts using the `idb` package.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb'
import { createLogger } from '@/lib/logger'

const log = createLogger('DraftCacheDb')

export interface CachedTeam {
  id: string
  name: string
  userName: string
  draftOrder: number
  budgetRemaining: number
  picks: string[] // pokemon IDs
}

export interface CachedPick {
  id: string
  teamId: string
  pokemonId: string
  pokemonName: string
  cost: number
  pickNumber: number
  round: number
}

export interface CachedDraftState {
  draftId: string
  status: 'setup' | 'active' | 'completed' | 'paused'
  currentTurn: number
  currentRound: number
  totalRounds: number
  teams: CachedTeam[]
  picks: CachedPick[]
  formatId: string | null
  budgetPerTeam: number
  maxPokemonPerTeam: number
  draftType: 'snake' | 'auction'
  cachedAt: number
}

interface DraftCacheDBSchema extends DBSchema {
  drafts: {
    key: string
    value: CachedDraftState
    indexes: { 'by-cached-at': number; 'by-status': string }
  }
}

const DB_NAME = 'pokemon-draft-state-cache'
const DB_VERSION = 1
// Keep cached drafts for 24 hours — they are replaced by live state on reconnection
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000

export class DraftCacheDB {
  private static dbPromise: Promise<IDBPDatabase<DraftCacheDBSchema>> | null = null

  private static async getDB(): Promise<IDBPDatabase<DraftCacheDBSchema>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<DraftCacheDBSchema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('drafts')) {
            const store = db.createObjectStore('drafts', { keyPath: 'draftId' })
            store.createIndex('by-cached-at', 'cachedAt')
            store.createIndex('by-status', 'status')
          }
        },
      })
    }
    return this.dbPromise
  }

  /**
   * Save current draft state to IndexedDB.
   * Called periodically during an active draft and on each pick.
   */
  static async cacheDraftState(draftId: string, state: Omit<CachedDraftState, 'draftId' | 'cachedAt'>): Promise<void> {
    try {
      const db = await this.getDB()
      const cached: CachedDraftState = {
        ...state,
        draftId,
        cachedAt: Date.now(),
      }
      await db.put('drafts', cached)
      log.info(`Cached draft state for ${draftId}`)
    } catch (error) {
      log.error(`Failed to cache draft ${draftId}:`, error)
    }
  }

  /**
   * Retrieve cached draft state by ID.
   * Returns null if not found or if the cache has expired.
   */
  static async getCachedDraftState(draftId: string): Promise<CachedDraftState | null> {
    try {
      const db = await this.getDB()
      const cached = await db.get('drafts', draftId)

      if (!cached) return null

      if (Date.now() - cached.cachedAt > CACHE_DURATION_MS) {
        log.info(`Cache expired for draft ${draftId}, removing`)
        await db.delete('drafts', draftId)
        return null
      }

      return cached
    } catch (error) {
      log.error(`Failed to get cached draft ${draftId}:`, error)
      return null
    }
  }

  /**
   * Remove cached state for a specific draft.
   * Call this when a draft completes or is no longer needed.
   */
  static async clearCachedDraftState(draftId: string): Promise<void> {
    try {
      const db = await this.getDB()
      await db.delete('drafts', draftId)
      log.info(`Cleared cached draft ${draftId}`)
    } catch (error) {
      log.error(`Failed to clear cached draft ${draftId}:`, error)
    }
  }

  /**
   * List all cached draft summaries for recovery UI.
   * Returns lightweight info: draft ID, status, team count, and cache timestamp.
   */
  static async getAllCachedDrafts(): Promise<
    Array<{
      draftId: string
      status: CachedDraftState['status']
      teamCount: number
      pickCount: number
      cachedAt: number
    }>
  > {
    try {
      const db = await this.getDB()
      const all = await db.getAll('drafts')
      const now = Date.now()

      return all
        .filter((d) => now - d.cachedAt <= CACHE_DURATION_MS)
        .map((d) => ({
          draftId: d.draftId,
          status: d.status,
          teamCount: d.teams.length,
          pickCount: d.picks.length,
          cachedAt: d.cachedAt,
        }))
    } catch (error) {
      log.error('Failed to get all cached drafts:', error)
      return []
    }
  }

  /**
   * Remove all expired entries from the cache.
   */
  static async clearStaleCache(): Promise<void> {
    try {
      const db = await this.getDB()
      const now = Date.now()
      const tx = db.transaction('drafts', 'readwrite')
      const index = tx.objectStore('drafts').index('by-cached-at')

      let cursor = await index.openCursor()
      let deletedCount = 0

      while (cursor) {
        if (now - cursor.value.cachedAt > CACHE_DURATION_MS) {
          await cursor.delete()
          deletedCount++
        }
        cursor = await cursor.continue()
      }

      await tx.done
      if (deletedCount > 0) {
        log.info(`Cleared ${deletedCount} stale draft cache entries`)
      }
    } catch (error) {
      log.error('Failed to clear stale draft cache:', error)
    }
  }

  /**
   * Remove all cached draft data.
   */
  static async clearAll(): Promise<void> {
    try {
      const db = await this.getDB()
      await db.clear('drafts')
      log.info('Cleared all draft cache data')
    } catch (error) {
      log.error('Failed to clear draft cache:', error)
    }
  }
}
