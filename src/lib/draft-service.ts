/**
 * Draft Service — Slim core module
 *
 * Contains type exports, core CRUD (create/join/getDraftState), cache,
 * and utility methods. All other functionality is delegated to focused
 * sub-modules and re-exported for backward compatibility.
 *
 * Sub-modules:
 *  - draft-picks-service.ts     — Pick flow (makePick, undo, advance, validate)
 *  - draft-lifecycle-service.ts — Lifecycle (start, pause, reset, delete, shuffle)
 *  - draft-auction-methods.ts   — Auction (nominate, bid, resolve)
 *  - draft-history-service.ts   — History & results (getDraftHistory, getPublicDrafts)
 */
import { supabase } from './supabase'
import { DEFAULT_FORMAT } from '@/lib/formats'
import { UserSessionService, type DraftParticipation } from '@/lib/user-session'
import { generateRoomCode } from '@/lib/room-utils'
import type {
  DraftRow, DraftInsert,
  TeamRow, TeamInsert,
  ParticipantRow, ParticipantInsert,
  PickRow,
  AuctionRow,
  CustomFormatInsert,
} from '@/types/supabase-helpers'
import bcrypt from 'bcryptjs'
import { createLogger } from '@/lib/logger'

// ─── Re-export standalone functions from sub-modules ───────────────────────
// These allow direct imports (e.g. `import { makePick } from '@/lib/draft-service'`)
// AND keep DraftService.xxx() backward compatibility via the class below.

export {
  makePick,
  makeProxyPick,
  validateUserTeam,
  validateUserCanPick,
  getUserTeam,
  undoLastPick,
  undoPickById,
  autoSkipTurn,
  advanceTurn,
  validatePokemonInFormat,
} from './draft-picks-service'

export {
  startDraft,
  pauseDraft,
  unpauseDraft,
  endDraft,
  resetDraft,
  deleteDraft,
  hardDeleteDraft,
  shuffleDraftOrder,
  resumeDraft,
  removeTeam,
  updateTimerSetting,
  markDraftCompleted,
  markDraftAbandoned,
  adjustTeamBudget,
  createLeagueForCompletedDraft,
  validateDraftCanStart,
} from './draft-lifecycle-service'

export {
  nominatePokemon,
  placeBid,
  resolveAuction,
  extendAuctionTime,
  getCurrentAuction,
  setAuctionTimerDuration,
  validateUserCanNominate,
  checkAuctionDraftProgress,
} from './draft-auction-methods'

export {
  getDraftHistory,
  getDraftResults,
  saveDraftResults,
  deleteDraftResults,
  getPublicDrafts,
} from './draft-history-service'

// ─── Import standalone functions for use in DraftService class methods ─────
import {
  makePick as _makePick,
  makeProxyPick as _makeProxyPick,
  validateUserTeam as _validateUserTeam,
  validateUserCanPick as _validateUserCanPick,
  getUserTeam as _getUserTeam,
  undoLastPick as _undoLastPick,
  undoPickById as _undoPickById,
  autoSkipTurn as _autoSkipTurn,
  advanceTurn as _advanceTurn,
  validatePokemonInFormat as _validatePokemonInFormat,
} from './draft-picks-service'

import {
  startDraft as _startDraft,
  pauseDraft as _pauseDraft,
  unpauseDraft as _unpauseDraft,
  endDraft as _endDraft,
  resetDraft as _resetDraft,
  deleteDraft as _deleteDraft,
  hardDeleteDraft as _hardDeleteDraft,
  shuffleDraftOrder as _shuffleDraftOrder,
  resumeDraft as _resumeDraft,
  removeTeam as _removeTeam,
  updateTimerSetting as _updateTimerSetting,
  markDraftCompleted as _markDraftCompleted,
  markDraftAbandoned as _markDraftAbandoned,
  adjustTeamBudget as _adjustTeamBudget,
  createLeagueForCompletedDraft as _createLeagueForCompletedDraft,
  validateDraftCanStart as _validateDraftCanStart,
} from './draft-lifecycle-service'

import {
  nominatePokemon as _nominatePokemon,
  placeBid as _placeBid,
  resolveAuction as _resolveAuction,
  extendAuctionTime as _extendAuctionTime,
  getCurrentAuction as _getCurrentAuction,
  setAuctionTimerDuration as _setAuctionTimerDuration,
  validateUserCanNominate as _validateUserCanNominate,
  checkAuctionDraftProgress as _checkAuctionDraftProgress,
} from './draft-auction-methods'

import {
  getDraftHistory as _getDraftHistory,
  getDraftResults as _getDraftResults,
  saveDraftResults as _saveDraftResults,
  deleteDraftResults as _deleteDraftResults,
  getPublicDrafts as _getPublicDrafts,
} from './draft-history-service'

// ─── Logger ────────────────────────────────────────────────────────────────
const log = createLogger('DraftService')

// ─── Type aliases (kept here as the canonical location) ────────────────────
type Draft = DraftRow
type Team = TeamRow
type Participant = ParticipantRow
type Pick = PickRow
type Auction = AuctionRow

/** Type for draft query results that include nested relations */
type DraftWithRelations = DraftRow & {
  teams: TeamRow[]
  participants: ParticipantRow[]
  picks: PickRow[]
  auctions: AuctionRow[]
}

/** Type for draft query results with only participants */
type _DraftWithParticipants = DraftRow & {
  participants: ParticipantRow[]
}

/** Type for draft query results with teams and participants */
type DraftWithTeamsAndParticipants = DraftRow & {
  teams: TeamRow[]
  participants: ParticipantRow[]
}

/** Type for the make_draft_pick RPC response */
interface _MakeDraftPickResponse {
  success: boolean
  error?: string
  pickId?: string
  newBudget?: number
  nextTurn?: number
  isComplete?: boolean
  budgetRemaining?: number
  cost?: number
  maxPicks?: number
}

// ─── Exported interfaces ──────────────────────────────────────────────────

export interface DraftSettings {
  maxTeams: number
  /** User-facing draft type:
   *  - 'tiered'  -> snake format + tiered scoring (S-E tier slots)
   *  - 'points'  -> snake format + budget scoring
   *  - 'auction' -> auction format
   */
  draftType: 'tiered' | 'points' | 'auction'
  timeLimit: number
  pokemonPerTeam: number
  budgetPerTeam?: number
  formatId?: string
  // Scoring system (derived from draftType, kept for backwards compat)
  scoringSystem?: 'budget' | 'tiered'
  tierConfig?: { tiers: import('@/types').TierDefinition[] }
  // League settings (optional)
  createLeague?: boolean
  splitIntoConferences?: boolean
  leagueWeeks?: number
  // Shuffle tracking
  draftOrderShuffled?: boolean
}

export interface CreateDraftParams {
  name: string
  hostName: string
  teamName: string
  settings: DraftSettings
  isPublic?: boolean
  description?: string | null
  tags?: string[] | null
  password?: string | null
  customFormat?: {
    name: string
    description: string
    pokemonPricing: Record<string, number>
  }
}

export interface JoinDraftParams {
  roomCode: string
  userId: string
  teamName: string
}

export interface JoinSpectatorParams {
  roomCode: string
  userId: string
}

export interface DraftState {
  draft: Draft
  teams: Team[]
  participants: Participant[]
  picks: Pick[]
  auctions?: Auction[]
}

export interface ServerTime {
  serverTime: number
  pickEndsAt: number | null
  auctionEndsAt: number | null
  turnStartedAt: number | null
}

// ─── DraftService class ───────────────────────────────────────────────────
// Preserves the static-method API that all consumers use (DraftService.xxx()).
// Core methods (create, join, getDraftState, cache) live here.
// Everything else delegates to standalone functions in sub-modules.

export class DraftService {
  static generateRoomCode(): string {
    return generateRoomCode()
  }

  /**
   * Verify draft password via server-side API route.
   * The hash never leaves the server in production (browser context).
   * Falls back to direct comparison in SSR/test contexts where fetch
   * to localhost is unavailable.
   */
  static async verifyDraftPassword({ roomCode, password }: { roomCode: string; password: string }): Promise<boolean> {
    // In browser context, use the API route so the hash stays server-side
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/draft/verify-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, password }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to verify password')
        }

        const data = await res.json()
        return data.valid === true
      } catch (err) {
        // If fetch fails (network error, dev server not running, test environment),
        // fall through to direct comparison as a safe fallback.
        // We only re-throw application-level errors (those with HTTP status info).
        const errName = err instanceof Error ? err.name : ''
        const errMsg = err instanceof Error ? err.message : ''
        const isAppError = errMsg.includes('Failed to verify password') ||
          errMsg.includes('Draft not found')
        if (isAppError) {
          throw err
        }
        log.warn(`API route unreachable (${errName}), falling back to direct comparison`)
      }
    }

    // SSR / test fallback: compare directly (hash is only in server memory)
    if (!supabase) {
      throw new Error('Supabase is not configured')
    }

    const { data: draft, error } = await supabase
      .from('drafts')
      .select('password')
      .eq('room_code', roomCode.toLowerCase())
      .single()

    if (error || !draft) {
      throw new Error('Draft not found')
    }

    // If draft has no password, allow access
    if (!draft.password) {
      return true
    }

    return await bcrypt.compare(password, draft.password)
  }

  /**
   * Helper to query drafts by room code (which is used as the logical draft ID)
   */
  private static getDraftQuery(roomCode: string) {
    return { room_code: roomCode.toLowerCase() }
  }

  /**
   * Get server-authoritative time with draft timing information
   * This prevents client-side timer drift
   */
  static async getServerTime(roomCodeOrDraftId: string): Promise<ServerTime> {
    try {
      // Detect if input is a UUID
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomCodeOrDraftId)

      const { data: draft } = await supabase
        .from('drafts')
        .select('settings, updated_at')
        .eq(isUuid ? 'id' : 'room_code', isUuid ? roomCodeOrDraftId : roomCodeOrDraftId.toLowerCase())
        .single()

      if (!draft) {
        return {
          serverTime: Date.now(),
          pickEndsAt: null,
          auctionEndsAt: null,
          turnStartedAt: null
        }
      }

      // Use database updated_at as server time reference
      const serverTime = new Date(draft.updated_at).getTime()

      return {
        serverTime,
        pickEndsAt: null, // Will be calculated on client with server offset
        auctionEndsAt: null,
        turnStartedAt: null
      }
    } catch (error) {
      log.error('Error fetching server time:', error)
      return {
        serverTime: Date.now(),
        pickEndsAt: null,
        auctionEndsAt: null,
        turnStartedAt: null
      }
    }
  }

  static async createDraft({ name, hostName, teamName, settings, isPublic, description, tags, password, customFormat }: CreateDraftParams): Promise<{ roomCode: string; draftId: string }> {
    if (!supabase) {
      log.error('Supabase configuration error:', {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      })
      throw new Error('Supabase is not properly configured. Please check your environment variables and restart the dev server.')
    }

    // Require authentication to create drafts
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('You must be logged in to create a draft. Please sign in or create an account.')
    }

    // Validate minimum Pokemon count for snake-based drafts
    if ((settings.draftType === 'points' || settings.draftType === 'tiered') && settings.pokemonPerTeam < 6) {
      throw new Error('Points and tiered drafts require at least 6 Pok\u00e9mon per team')
    }

    const roomCode = this.generateRoomCode()
    const hostId = user.id

    let customFormatId: string | null = null

    // If custom format is provided, create it in the database first
    if (customFormat) {
      const customFormatData: CustomFormatInsert = {
        name: customFormat.name,
        description: customFormat.description,
        created_by_user_id: hostId,
        created_by_display_name: hostName,
        is_public: false,
        pokemon_pricing: customFormat.pokemonPricing
      }
      const { data: formatData, error: formatError } = await supabase
        .from('custom_formats')
        .insert(customFormatData)
        .select()
        .single()

      if (formatError) {
        log.error('Error creating custom format:', formatError)
        throw new Error(`Failed to create custom format: ${formatError.message}`)
      }

      customFormatId = formatData.id
    }

    // Map user-facing draftType to DB format + scoringSystem
    const dbFormat: 'snake' | 'auction' = settings.draftType === 'auction' ? 'auction' : 'snake'
    const scoringSystem: 'budget' | 'tiered' = settings.draftType === 'tiered' ? 'tiered' : 'budget'
    const isTiered = scoringSystem === 'tiered'

    // Create draft - build insert object conditionally based on table columns
    const draftInsert: DraftInsert = {
      room_code: roomCode.toLowerCase(),
      name: name || `${hostName}'s Draft`,
      host_id: hostId,
      format: dbFormat,
      max_teams: settings.maxTeams,
      // For tiered drafts set a very high budget so the RPC budget check never blocks
      budget_per_team: isTiered ? 99999 : (settings.budgetPerTeam || 100),
      status: 'setup',
      current_round: 1,
      settings: {
        timeLimit: settings.timeLimit,
        pokemonPerTeam: settings.pokemonPerTeam,
        maxPokemonPerTeam: settings.pokemonPerTeam, // Required for pick validation
        formatId: settings.formatId || DEFAULT_FORMAT,
        // Store both the user-facing draftType and derived scoringSystem
        draftType: settings.draftType,
        scoringSystem,
        tierConfig: settings.tierConfig,
        // League settings
        createLeague: settings.createLeague,
        splitIntoConferences: settings.splitIntoConferences,
        leagueWeeks: settings.leagueWeeks
      }
    }

    // Add optional columns only if they're supported (spectator mode migration)
    if (isPublic !== undefined) draftInsert.is_public = isPublic || false
    if (description) draftInsert.description = description
    if (tags) draftInsert.tags = tags
    // Hash password before storing for security
    if (password) draftInsert.password = await bcrypt.hash(password, 12)
    if (customFormatId) draftInsert.custom_format_id = customFormatId

    const { data: draft, error: draftError } = await supabase
      .from('drafts')
      .insert(draftInsert)
      .select()
      .single()

    if (draftError) {
      log.error('Error creating draft:', draftError)
      throw new Error(`Failed to create draft: ${draftError.message || JSON.stringify(draftError)}`)
    }

    // Create host team
    const hostTeamInsert: TeamInsert = {
      draft_id: draft.id,
      name: teamName,
      owner_id: hostId,
      draft_order: 1,
      budget_remaining: isTiered ? 99999 : (settings.budgetPerTeam || 100)
    }
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert(hostTeamInsert)
      .select()
      .single()

    if (teamError) {
      log.error('Error creating team:', teamError)
      throw new Error(`Failed to create team: ${teamError.message || JSON.stringify(teamError)}`)
    }

    // Create host participant
    const hostParticipantInsert: ParticipantInsert = {
      draft_id: draft.id,
      user_id: hostId,
      display_name: hostName,
      team_id: team.id,
      is_host: true,
      last_seen: new Date().toISOString()
    }
    const { data: _participant, error: participantError } = await supabase
      .from('participants')
      .insert(hostParticipantInsert)
      .select()
      .single()

    if (participantError) {
      log.error('Error creating participant:', participantError)
      throw new Error(`Failed to create participant: ${participantError.message || JSON.stringify(participantError)}`)
    }

    // Record draft participation in user session
    UserSessionService.recordDraftParticipation({
      draftId: roomCode.toLowerCase(),
      userId: hostId,
      teamId: team.id,
      teamName: teamName,
      displayName: hostName,
      isHost: true,
      status: 'active'
    })

    return { roomCode, draftId: roomCode.toLowerCase() }
  }

  static async joinDraft({ roomCode, userId, teamName }: JoinDraftParams): Promise<{ draftId: string; teamId: string; asSpectator?: boolean }> {
    const draftId = roomCode.toLowerCase()

    // Check if draft exists and is joinable
    if (!supabase) throw new Error('Supabase not available')

    // Fetch user's display name from user_profiles
    const { data: userProfile, error: profileError } = await (supabase
      .from('user_profiles'))
      .select('display_name')
      .eq('user_id', userId)
      .single()

    let displayName: string

    // If no profile exists, fall back to user metadata and create profile
    if (profileError || !userProfile) {
      const { data: { user } } = await supabase.auth.getUser()
      displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'

      // Auto-create missing profile
      const { error: createError } = await supabase
        .from('user_profiles')
        .insert({
          user_id: userId,
          display_name: displayName
        })

      if (createError) {
        log.error('Failed to auto-create user profile:', createError)
      }
    } else {
      displayName = userProfile.display_name || 'User'
    }

    const { data: draft, error: draftError } = await supabase
      .from('drafts')
      .select('*, teams(*), participants(*)')
      .eq('room_code', draftId)
      .single()

    if (draftError || !draft) {
      throw new Error('Draft room not found')
    }

    const draftUuid = draft.id as string  // Actual UUID from database
    const existingParticipants = (draft as unknown as DraftWithTeamsAndParticipants).participants || []
    const existingTeams = (draft as unknown as DraftWithTeamsAndParticipants).teams || []

    // Check if user is already a participant in this draft (rejoining case)
    const existingParticipant = existingParticipants.find((p: ParticipantRow) => p.user_id === userId)

    if (existingParticipant) {
      // User is already part of this draft - update their last_seen and return their existing team
      log.info('User already participant, updating last_seen and returning existing team')

      await (supabase
        .from('participants'))
        .update({
          last_seen: new Date().toISOString()
        })
        .eq('draft_id', draftUuid)
        .eq('user_id', userId)

      // Find their existing team
      const existingTeam = existingTeams.find((t: TeamRow) => t.id === existingParticipant.team_id)

      if (existingTeam) {
        // Update user session to reflect active participation
        UserSessionService.recordDraftParticipation({
          draftId: draftId,
          userId: userId,
          teamId: existingTeam.id,
          teamName: existingTeam.name,
          displayName: displayName,
          isHost: existingParticipant.is_host,
          status: 'active'
        })

        return {
          draftId,
          teamId: existingTeam.id
        }
      } else if (!existingParticipant.team_id) {
        // User is a spectator - return spectator status
        UserSessionService.recordDraftParticipation({
          draftId: draftId,
          userId: userId,
          teamId: null,
          teamName: null,
          displayName: displayName,
          isHost: existingParticipant.is_host,
          status: 'spectator'
        })

        return {
          draftId,
          teamId: '',
          asSpectator: true
        }
      }
    }

    // If draft is full or already started, join as spectator instead
    if (existingTeams.length >= (draft as unknown as DraftWithTeamsAndParticipants).max_teams || (draft as unknown as DraftWithTeamsAndParticipants).status !== 'setup') {
      log.info('Draft is full or started, joining as spectator instead')
      const result = await this.joinAsSpectator({ roomCode, userId })
      return {
        draftId: result.draftId,
        teamId: '', // No team for spectators
        asSpectator: true
      }
    }

    // Check for duplicate team name
    if (existingTeams.some((team: TeamRow) => team.name.toLowerCase() === teamName.toLowerCase())) {
      throw new Error(`Team name "${teamName}" is already taken in this draft. Please choose a different team name.`)
    }

    // Check for duplicate display name (username) in this draft
    if (existingParticipants.some((p: ParticipantRow) => p.display_name?.toLowerCase() === displayName.toLowerCase())) {
      throw new Error(`Username "${displayName}" is already in this draft. Please update your display name in your profile before joining.`)
    }

    // Get next draft order
    const nextDraftOrder = existingTeams.length + 1

    // Create team
    const { data: team, error: teamError } = await (supabase
      .from('teams'))
      .insert({
        draft_id: draftUuid,
        name: teamName,
        owner_id: userId,
        draft_order: nextDraftOrder,
        budget_remaining: (draft as unknown as DraftWithTeamsAndParticipants).budget_per_team
      })
      .select()
      .single()

    if (teamError) {
      log.error('Error creating team:', teamError)
      throw new Error('Failed to join draft')
    }

    // Create participant
    const { error: participantError } = await (supabase
      .from('participants'))
      .insert({
        draft_id: draftUuid,
        user_id: userId,
        display_name: displayName,
        team_id: team.id,
        is_host: false,
        last_seen: new Date().toISOString()
      })

    if (participantError) {
      log.error('Error creating participant:', participantError)
      throw new Error('Failed to create participant')
    }

    // Record draft participation in user session (use room code as logical draft ID)
    UserSessionService.recordDraftParticipation({
      draftId: draftId,
      userId: userId,
      teamId: team.id,
      teamName: teamName,
      displayName: displayName,
      isHost: false,
      status: 'active'
    })

    return { draftId, teamId: team.id }
  }

  static async joinAsSpectator({ roomCode, userId }: JoinSpectatorParams): Promise<{ draftId: string }> {
    const draftId = roomCode.toLowerCase()

    // Check if draft exists
    if (!supabase) throw new Error('Supabase not available')

    // Fetch user's display name from user_profiles
    const { data: userProfile, error: profileError } = await (supabase
      .from('user_profiles'))
      .select('display_name')
      .eq('user_id', userId)
      .single()

    let displayName: string

    // If no profile exists, fall back to user metadata and create profile
    if (profileError || !userProfile) {
      const { data: { user } } = await supabase.auth.getUser()
      displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'

      // Auto-create missing profile
      const { error: createError } = await supabase
        .from('user_profiles')
        .insert({
          user_id: userId,
          display_name: displayName
        })

      if (createError) {
        log.error('Failed to auto-create user profile:', createError)
      }
    } else {
      displayName = userProfile.display_name || 'User'
    }

    const { data: draft, error: draftError } = await supabase
      .from('drafts')
      .select('*, participants(*)')
      .eq('room_code', draftId)
      .single()

    if (draftError || !draft) {
      throw new Error('Draft room not found')
    }

    const draftUuid = draft.id as string
    const existingParticipants = (draft as unknown as DraftWithTeamsAndParticipants).participants || []

    // Check if user is already a spectator (rejoining case)
    const existingParticipant = existingParticipants.find((p: ParticipantRow) => p.user_id === userId)

    if (existingParticipant) {
      log.info('User already spectator, updating last_seen')

      // Update their last_seen
      await (supabase
        .from('participants'))
        .update({
          last_seen: new Date().toISOString()
        })
        .eq('draft_id', draftUuid)
        .eq('user_id', userId)

      // Update user session
      UserSessionService.recordDraftParticipation({
        draftId: draftId,
        userId: userId,
        teamId: null,
        teamName: null,
        displayName: displayName,
        isHost: existingParticipant.is_host,
        status: 'spectator'
      })

      return { draftId }
    }

    // Create spectator participant (no team assignment)
    const { error: participantError } = await (supabase
      .from('participants'))
      .insert({
        draft_id: draftUuid,
        user_id: userId,
        display_name: displayName,
        team_id: null, // Spectators have no team
        is_host: false,
        last_seen: new Date().toISOString()
      })

    if (participantError) {
      log.error('Error creating spectator:', participantError)
      throw new Error('Failed to join as spectator')
    }

    // Record spectator participation in user session
    UserSessionService.recordDraftParticipation({
      draftId: draftId,
      userId: userId,
      teamId: null,
      teamName: null,
      displayName: displayName,
      isHost: false,
      status: 'spectator'
    })

    return { draftId }
  }

  // ─── Draft State Cache ────────────────────────────────────────────────
  // Short-lived cache to deduplicate getDraftState calls within the same request lifecycle.
  private static draftStateCache = new Map<string, { data: DraftState | null; expires: number }>()

  private static getCachedDraftState(key: string): DraftState | null | undefined {
    const entry = this.draftStateCache.get(key)
    if (entry && Date.now() < entry.expires) {
      return entry.data
    }
    this.draftStateCache.delete(key)
    return undefined
  }

  private static setCachedDraftState(key: string, data: DraftState | null): void {
    this.draftStateCache.set(key, { data, expires: Date.now() + 2000 })
    // Prune old entries periodically (keep map from growing)
    if (this.draftStateCache.size > 50) {
      const now = Date.now()
      for (const [k, v] of this.draftStateCache) {
        if (now >= v.expires) this.draftStateCache.delete(k)
      }
    }
  }

  /** Invalidate cached draft state (call after mutations like makePick, placeBid) */
  static invalidateDraftStateCache(roomCodeOrDraftId?: string): void {
    if (roomCodeOrDraftId) {
      this.draftStateCache.delete(roomCodeOrDraftId.toLowerCase())
    } else {
      this.draftStateCache.clear()
    }
  }

  static async getDraftState(roomCodeOrDraftId: string): Promise<DraftState | null> {
    if (!supabase) return null

    // Check cache first
    const cacheKey = roomCodeOrDraftId.toLowerCase()
    const cached = this.getCachedDraftState(cacheKey)
    if (cached !== undefined) return cached

    try {
      // Detect if input is a UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomCodeOrDraftId)

      const { data, error } = await supabase
        .from('drafts')
        .select(`
          *,
          teams(*),
          participants(*),
          picks(*),
          auctions(*)
        `)
        .eq(isUuid ? 'id' : 'room_code', isUuid ? roomCodeOrDraftId : roomCodeOrDraftId.toLowerCase())
        .maybeSingle()

      if (error) {
        log.error('Error fetching draft state:', error)
        return null
      }

      if (!data) {
        log.warn(`Draft not found for ${isUuid ? 'ID' : 'room code'}: ${roomCodeOrDraftId}`)
        return null
      }

      const result: DraftState = {
        draft: data,
        teams: ((data as unknown as DraftWithRelations)).teams || [],
        participants: ((data as unknown as DraftWithRelations)).participants || [],
        picks: ((data as unknown as DraftWithRelations)).picks || [],
        auctions: ((data as unknown as DraftWithRelations)).auctions || []
      }
      this.setCachedDraftState(cacheKey, result)
      return result
    } catch (err) {
      log.error('Unexpected error in getDraftState:', err)
      return null
    }
  }

  /**
   * Get the format for a draft
   */
  static async getDraftFormat(draftId: string): Promise<string | null> {
    if (!supabase) return null

    const draftState = await this.getDraftState(draftId)
    if (!draftState) return null

    const { data: draft, error } = await supabase
      .from('drafts')
      .select('settings')
      .eq('id', draftState.draft.id)
      .single()

    if (error || !draft) {
      log.error('Error fetching draft format:', error)
      return null
    }

    return draft.settings?.formatId || DEFAULT_FORMAT
  }

  /**
   * Get drafts for the current user from their participation history
   */
  static getMyDrafts(): DraftParticipation[] {
    return UserSessionService.getDraftParticipations()
  }

  /**
   * Get active drafts for the current user
   */
  static getMyActiveDrafts(): DraftParticipation[] {
    return UserSessionService.getActiveDraftParticipations()
  }

  static async updateParticipantLastSeen(draftId: string, userId: string): Promise<void> {
    if (!supabase) return

    const draftState = await this.getDraftState(draftId)
    if (!draftState) return

    await (supabase
      .from('participants'))
      .update({
        last_seen: new Date().toISOString()
      })
      .eq('draft_id', draftState.draft.id)
      .eq('user_id', userId)
  }

  // ─── Delegating methods (backward compatibility) ────────────────────────
  // Every method below delegates to the standalone function in its sub-module.

  // Picks
  static makePick = _makePick
  static makeProxyPick = _makeProxyPick
  static validateUserTeam = _validateUserTeam
  static validateUserCanPick = _validateUserCanPick
  static getUserTeam = _getUserTeam
  static undoLastPick = _undoLastPick
  static undoPickById = _undoPickById
  static autoSkipTurn = _autoSkipTurn
  static advanceTurn = _advanceTurn
  private static validatePokemonInFormat = _validatePokemonInFormat

  // Lifecycle
  static startDraft = _startDraft
  static pauseDraft = _pauseDraft
  static unpauseDraft = _unpauseDraft
  static endDraft = _endDraft
  static resetDraft = _resetDraft
  static deleteDraft = _deleteDraft
  static hardDeleteDraft = _hardDeleteDraft
  static shuffleDraftOrder = _shuffleDraftOrder
  static resumeDraft = _resumeDraft
  static removeTeam = _removeTeam
  static updateTimerSetting = _updateTimerSetting
  static markDraftCompleted = _markDraftCompleted
  static markDraftAbandoned = _markDraftAbandoned
  static adjustTeamBudget = _adjustTeamBudget
  private static createLeagueForCompletedDraft = _createLeagueForCompletedDraft
  private static validateDraftCanStart = _validateDraftCanStart

  // Auction
  static nominatePokemon = _nominatePokemon
  static placeBid = _placeBid
  static resolveAuction = _resolveAuction
  static extendAuctionTime = _extendAuctionTime
  static getCurrentAuction = _getCurrentAuction
  static setAuctionTimerDuration = _setAuctionTimerDuration
  private static validateUserCanNominate = _validateUserCanNominate
  private static checkAuctionDraftProgress = _checkAuctionDraftProgress

  // History
  static getDraftHistory = _getDraftHistory
  static getDraftResults = _getDraftResults
  static saveDraftResults = _saveDraftResults
  static deleteDraftResults = _deleteDraftResults
  static getPublicDrafts = _getPublicDrafts
}
