import { supabase } from './supabase'
import { generateSnakeDraftOrder } from '@/utils/draft'
import { getFormatById, DEFAULT_FORMAT } from '@/lib/formats'
import { createFormatRulesEngine as createNewFormatRulesEngine } from '@/domain/rules'
import { Team as AppTeam } from '@/types'
import { UserSessionService, type DraftParticipation } from '@/lib/user-session'
import { generateRoomCode } from '@/lib/room-utils'
import { fetchPokemon } from '@/lib/pokemon-api'
import type {
  DraftRow, DraftInsert,
  TeamRow, TeamInsert,
  ParticipantRow, ParticipantInsert,
  PickRow,
  AuctionRow,
  CustomFormatInsert,
  DraftSettings as DraftSettingsJson,
} from '@/types/supabase-helpers'
import bcrypt from 'bcryptjs'
import { createLogger } from '@/lib/logger'

const log = createLogger('DraftService')

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

export interface DraftSettings {
  maxTeams: number
  /** User-facing draft type:
   *  - 'tiered'  → snake format + tiered scoring (S–E tier slots)
   *  - 'points'  → snake format + budget scoring
   *  - 'auction' → auction format
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

export class DraftService {
  static generateRoomCode(): string {
    return generateRoomCode()
  }

  /**
   * Verify draft password
   */
  static async verifyDraftPassword({ roomCode, password }: { roomCode: string; password: string }): Promise<boolean> {
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

    // Securely compare passwords using bcrypt
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
      throw new Error('Points and tiered drafts require at least 6 Pokémon per team')
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
    if (password) draftInsert.password = await bcrypt.hash(password, 10)
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

    // Note: Auto-start removed to allow all teams to join before starting
    // Host must manually start the draft once all teams are ready

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

  // Short-lived cache to deduplicate getDraftState calls within the same request lifecycle.
  // Multiple service methods (placeBid, getUserTeam, etc.) call getDraftState independently,
  // causing redundant 5-table join queries. TTL of 2s ensures freshness while eliminating duplicates.
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

  static async shuffleDraftOrder(roomCodeOrDraftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get draft by room code
    const draftState = await this.getDraftState(roomCodeOrDraftId)
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
   * Validate that a draft can be started
   * Returns validation result with detailed error messages
   */
  private static async validateDraftCanStart(draftState: { draft: DraftRow; teams: TeamRow[]; participants: ParticipantRow[] }): Promise<{ valid: boolean; error?: string }> {
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
  static async startDraft(roomCodeOrDraftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get draft state
    const draftState = await this.getDraftState(roomCodeOrDraftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    const draftUuid = draftState.draft.id
    const teams = draftState.teams

    // Validate draft can be started
    const validation = await this.validateDraftCanStart(draftState)
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

    log.info('Draft started successfully:', { draftId: draftUuid, roomCode: roomCodeOrDraftId })
  }

  /**
   * Make a pick using the atomic database function.
   * This eliminates race conditions by performing all operations in a single transaction.
   */
  static async makePick(draftId: string, userId: string, pokemonId: string, pokemonName: string, cost: number): Promise<{
    pickId: string
    newBudget: number
    nextTurn: number
    isComplete: boolean
  }> {
    if (!supabase) throw new Error('Supabase not available')

    // Get draft state to resolve room_code to UUID and get team info
    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    const draftUuid = draftState.draft.id
    const currentTurn = draftState.draft.current_turn || 1

    // Get user's team
    const teamId = await this.getUserTeam(draftId, userId)
    if (!teamId) {
      throw new Error('User not in this draft')
    }

    // Validate Pokemon against format rules (client-side pre-check)
    const formatValidation = await this.validatePokemonInFormat(draftState.draft, pokemonId, pokemonName, cost)
    if (!formatValidation.isValid) {
      throw new Error(formatValidation.reason || 'Pokemon is not legal in this format')
    }

    const validatedCost = formatValidation.validatedCost

    // Tier budget validation for tiered scoring system
    const scoringSystem = draftState.draft.settings?.scoringSystem
    let pickCost = validatedCost
    if (scoringSystem === 'tiered') {
      const tierConfig = draftState.draft.settings?.tierConfig as { tiers: import('@/types').TierDefinition[] } | undefined
      if (tierConfig?.tiers?.length) {
        const { getPokemonTier } = await import('@/lib/tier-utils')
        const tier = getPokemonTier(validatedCost, tierConfig.tiers)
        if (!tier) {
          throw new Error(`${pokemonName} doesn't fit into any tier in this draft.`)
        }
        // In tiered drafts the deducted cost is the tier's point cost, not the raw format cost
        pickCost = tier.cost
        const team = draftState.teams.find(t => t.id === teamId)
        if (team && team.budget_remaining < pickCost) {
          throw new Error(`Not enough budget. ${tier.label} costs ${pickCost} pts and you have ${team.budget_remaining} pts remaining.`)
        }
      }
    }

    // Call the atomic database function
    // This performs all validation and updates in a single transaction with row-level locking
    const { data, error } = await supabase.rpc('make_draft_pick', {
      p_draft_id: draftUuid,
      p_team_id: teamId,
      p_user_id: userId,
      p_pokemon_id: pokemonId,
      p_pokemon_name: pokemonName,
      p_cost: pickCost,
      p_expected_turn: currentTurn
    })

    if (error) {
      log.error('Database RPC error:', error)
      throw new Error(error?.message || 'Failed to make pick')
    }

    // The function returns a JSONB object with success/error info
    if (!data) {
      throw new Error('No response from pick function')
    }

    // Cast RPC JSONB response to expected shape
    const result = data as Record<string, unknown>

    if (!result.success) {
      // The atomic function returned an error (validation failed)
      const errorMessage = (result.error as string) || 'Failed to make pick'
      log.error('Atomic function error:', errorMessage, result)

      // Provide user-friendly error messages
      if (errorMessage.includes('Not your turn')) {
        throw new Error('Not your turn! The turn may have changed. Please wait for your turn.')
      }
      if (errorMessage.includes('Insufficient budget')) {
        throw new Error(`Insufficient budget! You have ${result.budgetRemaining || 0} points but this costs ${result.cost || validatedCost} points.`)
      }
      if (errorMessage.includes('Maximum picks reached')) {
        throw new Error(`Your team has reached the maximum number of picks (${result.maxPicks || 6}).`)
      }
      if (errorMessage.includes('already drafted')) {
        throw new Error('This Pokemon has already been drafted by your team.')
      }
      if (errorMessage.includes('not active')) {
        throw new Error('Draft is not active. It may have been paused or completed.')
      }

      throw new Error(errorMessage)
    }

    log.info('Success:', {
      pickId: result.pickId,
      newBudget: result.newBudget,
      nextTurn: result.nextTurn,
      isComplete: result.isComplete
    })

    // Invalidate cache so the next getDraftState fetches fresh data
    this.invalidateDraftStateCache(draftId)

    // League creation is handled on the results page so the host can configure settings first

    return {
      pickId: result.pickId as string,
      newBudget: result.newBudget as number,
      nextTurn: result.nextTurn as number,
      isComplete: result.isComplete as boolean
    }
  }

  static async makeProxyPick(draftId: string, hostUserId: string, targetTeamId: string, pokemonId: string, pokemonName: string, cost: number): Promise<void> {
    // Validate format rules for proxy pick too
    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    const formatValidation = await this.validatePokemonInFormat(draftState.draft, pokemonId, pokemonName, cost)
    if (!formatValidation.isValid) {
      throw new Error(formatValidation.reason || 'Pokemon is not legal in this format')
    }

    // For production Supabase implementation - verify host permissions and make pick for target team
    // This would need to be implemented when moving beyond demo mode
    throw new Error('Proxy picking not yet implemented for production mode')
  }

  static async validateUserTeam(draftId: string, userId: string, teamId: string): Promise<boolean> {
    if (!supabase) return false
    
    const draftState = await this.getDraftState(draftId)
    if (!draftState) return false
    
    const { data: participant } = await supabase
      .from('participants')
      .select('team_id')
      .eq('draft_id', draftState.draft.id)
      .eq('user_id', userId)
      .single()

    return participant?.team_id === teamId
  }

  static async getUserTeam(draftId: string, userId: string): Promise<string | null> {
    if (!supabase) return null

    const draftState = await this.getDraftState(draftId)
    if (!draftState) return null

    // Debug logging to help troubleshoot participant lookup issues
    log.info('Looking up participant:', {
      draftId,
      userId,
      draftUuid: draftState.draft.id
    })

    const { data: participant, error } = await supabase
      .from('participants')
      .select('team_id, user_id')
      .eq('draft_id', draftState.draft.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      log.error('Error looking up participant:', error)
      throw new Error(`Failed to look up participant: ${error?.message || 'Unknown error'}`)
    }

    if (!participant) {
      log.warn('No participant found for user. All participants in draft:',
        draftState.participants.map(p => ({
          userId: p.user_id,
          teamId: p.team_id,
          displayName: p.display_name
        }))
      )
    }

    return participant?.team_id || null
  }

  static async validateUserCanPick(draftId: string, userId: string): Promise<{ canPick: boolean; teamId: string | null; reason?: string }> {
    // Get draft state
    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      return { canPick: false, teamId: null, reason: 'Draft not found' }
    }

    // Check if draft is active
    if (draftState.draft.status !== 'active') {
      return { canPick: false, teamId: null, reason: 'Draft is not active' }
    }

    // Get user's team
    const userTeamId = await this.getUserTeam(draftId, userId)
    if (!userTeamId) {
      return { canPick: false, teamId: null, reason: 'You are not part of this draft' }
    }

    // For auction drafts, different validation logic
    if (draftState.draft.format === 'auction') {
      return { canPick: false, teamId: userTeamId, reason: 'Use auction bidding for auction drafts' }
    }

    // Check if it's user's turn (snake draft logic)
    const maxRounds = draftState.draft.settings?.maxPokemonPerTeam || 10
    const currentTurn = draftState.draft.current_turn || 1

    const draftOrder = generateSnakeDraftOrder(draftState.teams as unknown as AppTeam[], maxRounds)
    if (currentTurn > draftOrder.length) {
      return { canPick: false, teamId: userTeamId, reason: 'Draft is complete' }
    }

    const currentTeamOrder = draftOrder[currentTurn - 1]
    const currentTeam = draftState.teams.find(team => team.draft_order === currentTeamOrder)

    if (!currentTeam || currentTeam.id !== userTeamId) {
      return { canPick: false, teamId: userTeamId, reason: 'It is not your turn' }
    }

    return { canPick: true, teamId: userTeamId }
  }

  static async pauseDraft(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const draftState = await this.getDraftState(draftId)
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

  static async unpauseDraft(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const draftState = await this.getDraftState(draftId)
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

  static async endDraft(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const draftState = await this.getDraftState(draftId)
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

  static async resetDraft(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get the draft to verify it exists
    const draftState = await this.getDraftState(draftId)
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

  static async deleteDraft(draftId: string, userId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get the draft to verify it exists and get the internal ID
    const draftState = await this.getDraftState(draftId)
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
  static async hardDeleteDraft(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get the draft to verify it exists and get the internal ID
    const draftState = await this.getDraftState(draftId)
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

  static async removeTeam(draftId: string, teamId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const draftState = await this.getDraftState(draftId)
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

    this.invalidateDraftStateCache(draftId)
    log.info(`Team ${teamId} removed from draft ${draftId}`)
  }

  static async updateTimerSetting(draftId: string, timerSeconds: number): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const draftState = await this.getDraftState(draftId)
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

  static async advanceTurn(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    const internalId = draftState.draft.id
    const totalTeams = draftState.teams.length
    const maxRounds = draftState.draft.settings?.maxPokemonPerTeam || 10
    const currentTurn = draftState.draft.current_turn || 1
    const nextTurn = currentTurn + 1
    const nextRound = Math.floor((nextTurn - 1) / totalTeams) + 1

    const isComplete = nextTurn > totalTeams * maxRounds

    // Apply any pending timer changes when advancing turn
    const currentSettings = draftState.draft.settings || {}
    let updatedSettings = currentSettings
    if (currentSettings.pendingTimerChange !== undefined) {
      updatedSettings = {
        ...currentSettings,
        timeLimit: currentSettings.pendingTimerChange,
        pendingTimerChange: undefined // Clear the pending flag
      }
    }

    const updateData = isComplete
      ? {
          status: 'completed' as const,
          updated_at: new Date().toISOString(),
          settings: updatedSettings,
          turn_started_at: null // Clear turn_started_at when draft completes
        }
      : {
          current_turn: nextTurn,
          current_round: nextRound,
          updated_at: new Date().toISOString(),
          settings: updatedSettings,
          turn_started_at: new Date().toISOString() // Track when turn started for disconnect handling
        }

    // Add optimistic locking to prevent concurrent turn advancements
    const { data: updateResult, error } = await (supabase
      .from('drafts'))
      .update(updateData)
      .eq('id', internalId)
      .eq('current_turn', currentTurn) // Optimistic lock: only update if turn hasn't changed
      .select()

    if (error) {
      log.error('Error advancing turn:', error)
      throw new Error('Failed to advance turn')
    }

    if (!updateResult || updateResult.length === 0) {
      // Optimistic lock failed - turn was already advanced by another process
      log.warn('Optimistic lock failed - turn was already advanced')
      throw new Error('Turn was already advanced by another process')
    }
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

  /**
   * Validate a Pokemon pick against the draft's format rules
   */
  private static async validatePokemonInFormat(
    draft: Draft,
    pokemonId: string,
    pokemonName: string,
    proposedCost: number
  ): Promise<{ isValid: boolean; reason?: string; validatedCost: number }> {
    try {
      // Get format from draft settings
      const formatId = draft.settings?.formatId || DEFAULT_FORMAT
      const format = getFormatById(formatId)

      if (!format) {
        return {
          isValid: false,
          reason: `Invalid format: ${formatId}`,
          validatedCost: proposedCost
        }
      }

      // Fetch the Pokemon object to validate
      const pokemon = await fetchPokemon(pokemonId)

      // Use NEW format rules engine to validate (async)
      const rulesEngine = await createNewFormatRulesEngine(format.id)
      const validation = await rulesEngine.validatePokemon(pokemon)

      if (!validation.isLegal) {
        return {
          isValid: false,
          reason: validation.reason,
          validatedCost: proposedCost
        }
      }

      // Return validated cost from format rules
      return {
        isValid: true,
        validatedCost: validation.cost
      }
    } catch (error) {
      log.error('Error validating Pokemon in format:', error)
      return {
        isValid: false,
        reason: 'Failed to validate Pokemon against format rules',
        validatedCost: proposedCost
      }
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

  /**
   * Resume a draft by rejoining with stored session data
   */
  static async resumeDraft(draftId: string): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      // Check if draft still exists
      const draftState = await this.getDraftState(draftId)
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

  /**
   * Mark a draft as completed in user session
   */
  static markDraftCompleted(draftId: string): void {
    UserSessionService.updateDraftParticipation(draftId, { status: 'completed' })
  }

  /**
   * Mark a draft as abandoned in user session
   */
  static markDraftAbandoned(draftId: string): void {
    UserSessionService.updateDraftParticipation(draftId, { status: 'abandoned' })
  }

  /**
   * Adjust team budget (admin/host only)
   */
  static async adjustTeamBudget(
    draftId: string,
    teamId: string,
    newBudget: number
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    if (newBudget < 0) {
      throw new Error('Budget cannot be negative')
    }

    const draftState = await this.getDraftState(draftId)
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
   * Set default auction timer duration (admin/host only)
   */
  static async setAuctionTimerDuration(
    draftId: string,
    durationSeconds: number
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    if (durationSeconds < 10) {
      throw new Error('Auction duration must be at least 10 seconds')
    }

    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    const internalId = draftState.draft.id

    // Get current settings
    const { data: draft, error: fetchError } = await supabase
      .from('drafts')
      .select('settings')
      .eq('id', internalId)
      .single()

    if (fetchError) {
      throw new Error('Failed to fetch draft settings')
    }

    // Update settings with new auction duration
    const currentSettings = draft.settings || {}
    const updatedSettings = {
      ...currentSettings,
      auctionDurationSeconds: durationSeconds
    }

    const { error } = await (supabase
      .from('drafts'))
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString()
      })
      .eq('id', internalId)

    if (error) {
      log.error('Error setting auction timer duration:', error)
      throw new Error('Failed to set auction timer duration')
    }
  }

  /**
   * Create league(s) for a completed draft
   */
  private static async createLeagueForCompletedDraft(
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

  // =====================
  // AUCTION DRAFT METHODS
  // =====================

  /**
   * Nominate a Pokemon for auction
   */
  static async nominatePokemon(
    draftId: string,
    userId: string,
    pokemonId: string,
    pokemonName: string,
    startingBid: number = 1,
    auctionDurationSeconds: number = 60
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Validate user can nominate
    const validation = await this.validateUserCanNominate(draftId, userId)
    if (!validation.canNominate) {
      throw new Error(validation.reason || 'Cannot nominate Pokemon')
    }

    const teamId = validation.teamId!
    const auctionEnd = new Date(Date.now() + auctionDurationSeconds * 1000)

    // Get draft state to validate Pokemon against format
    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    // Validate Pokemon against format rules
    const formatValidation = await this.validatePokemonInFormat(
      draftState.draft,
      pokemonId,
      pokemonName,
      startingBid
    )
    if (!formatValidation.isValid) {
      throw new Error(formatValidation.reason || 'Pokemon is not legal in this format')
    }

    // Create auction
    const { error } = await (supabase
      .from('auctions'))
      .insert({
        draft_id: draftState.draft.id,
        pokemon_id: pokemonId,
        pokemon_name: pokemonName,
        nominated_by: teamId,
        current_bid: startingBid,
        current_bidder: null,
        auction_end: auctionEnd.toISOString(),
        status: 'active'
      })

    if (error) {
      log.error('Error creating auction:', error)
      throw new Error('Failed to nominate Pokemon')
    }
  }

  /**
   * Place a bid on an active auction
   */
  static async placeBid(
    draftId: string,
    userId: string,
    auctionId: string,
    bidAmount: number
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }
    const internalId = draftState.draft.id

    // Get user's team first (doesn't change during auction)
    const userTeamId = await this.getUserTeam(draftId, userId)
    if (!userTeamId) {
      throw new Error('You are not part of this draft')
    }

    // Validate budget
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('budget_remaining')
      .eq('id', userTeamId)
      .single()

    if (teamError || !team) {
      throw new Error('Team not found')
    }

    if (bidAmount > team.budget_remaining) {
      throw new Error(`Bid exceeds your remaining budget of $${team.budget_remaining}`)
    }

    // Retry loop with optimistic locking to handle concurrent bids from 20+ players
    const MAX_RETRIES = 3
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Read current auction state
      const { data: auction, error: auctionError } = await supabase
        .from('auctions')
        .select('*')
        .eq('id', auctionId)
        .eq('draft_id', internalId)
        .single()

      if (auctionError || !auction) {
        throw new Error('Auction not found')
      }

      if (auction.status !== 'active') {
        throw new Error('Auction is not active')
      }

      if (new Date() > new Date(auction.auction_end)) {
        throw new Error('Auction has expired')
      }

      if (bidAmount <= auction.current_bid) {
        throw new Error(`Bid must be higher than current bid of $${auction.current_bid}`)
      }

      // Optimistic lock: only update if current_bid hasn't changed since we read it.
      // This prevents a lower bid from overwriting a higher concurrent bid.
      const { data: updated, error: updateError } = await supabase
        .from('auctions')
        .update({
          current_bid: bidAmount,
          current_bidder: userTeamId,
          updated_at: new Date().toISOString()
        })
        .eq('id', auctionId)
        .eq('current_bid', auction.current_bid) // optimistic lock
        .select()

      if (updateError) {
        log.error('Error placing bid:', updateError)
        throw new Error('Failed to place bid')
      }

      // If no rows updated, another bid landed between our read and write
      if (!updated || updated.length === 0) {
        if (attempt < MAX_RETRIES - 1) {
          log.info(`Bid conflict on attempt ${attempt + 1}, retrying...`)
          continue // Re-read auction and re-validate
        }
        // On final retry failure, re-read to give the user accurate info
        const { data: latest } = await supabase
          .from('auctions')
          .select('current_bid')
          .eq('id', auctionId)
          .single()

        if (latest && bidAmount <= latest.current_bid) {
          throw new Error(`Someone else bid higher! Current bid is now $${latest.current_bid}`)
        }
        throw new Error('Bid failed due to high traffic. Please try again.')
      }

      // Bid succeeded
      return
    }
  }

  /**
   * Resolve an expired auction
   */
  static async resolveAuction(draftId: string, auctionId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }
    const internalId = draftState.draft.id

    // Get auction details
    const { data: auction, error: auctionError } = await supabase
      .from('auctions')
      .select('*')
      .eq('id', auctionId)
      .eq('draft_id', internalId)
      .single()

    if (auctionError || !auction) {
      throw new Error('Auction not found')
    }

    if (auction.status !== 'active') {
      throw new Error('Auction is not active')
    }

    // Check if there was a winning bidder
    if (auction.current_bidder) {

      const pickOrder = draftState.picks.length + 1
      const currentRound = Math.floor(pickOrder / draftState.teams.length) + 1

      // Create the pick
      const { error: pickError } = await supabase
        .from('picks')
        .insert({
          draft_id: internalId,
          team_id: auction.current_bidder,
          pokemon_id: auction.pokemon_id,
          pokemon_name: auction.pokemon_name,
          cost: auction.current_bid,
          pick_order: pickOrder,
          round: currentRound
        })

      if (pickError) {
        log.error('Error creating pick from auction:', pickError)
        throw new Error('Failed to create pick from auction')
      }

      // Update team budget with optimistic locking
      const { data: team, error: teamFetchError} = await supabase
        .from('teams')
        .select('budget_remaining')
        .eq('id', auction.current_bidder)
        .single()

      if (teamFetchError || !team) {
        log.error('Error fetching team budget after auction:', teamFetchError)
        throw new Error('Failed to fetch team budget after auction')
      }

      const oldBudget = team.budget_remaining
      const newBudget = oldBudget - auction.current_bid

      // Use optimistic locking to prevent budget race conditions
      const { data: budgetUpdateResult, error: teamError } = await supabase
        .from('teams')
        .update({ budget_remaining: newBudget })
        .eq('id', auction.current_bidder)
        .eq('budget_remaining', oldBudget) // Optimistic lock
        .select()

      if (teamError || !budgetUpdateResult || budgetUpdateResult.length === 0) {
        log.error('Error updating team budget after auction (possible race condition):', teamError)
        throw new Error('Failed to update team budget after auction. Budget may have been modified.')
      }

      // Verify budget didn't go negative
      if (budgetUpdateResult[0].budget_remaining < 0) {
        log.error(`Budget went negative for team ${auction.current_bidder}`)
        // Rollback budget
        await supabase
          .from('teams')
          .update({ budget_remaining: oldBudget })
          .eq('id', auction.current_bidder)
        throw new Error('Insufficient budget for auction win')
      }
    }

    // Mark auction as completed
    const { error: updateError } = await supabase
      .from('auctions')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', auctionId)

    if (updateError) {
      log.error('Error completing auction:', updateError)
      throw new Error('Failed to complete auction')
    }

    // Check if draft should advance to next nomination or end
    await this.checkAuctionDraftProgress(draftId)
  }

  /**
   * Extend auction time (host only)
   */
  static async extendAuctionTime(
    draftId: string,
    auctionId: string,
    additionalSeconds: number
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }
    const internalId = draftState.draft.id

    const { data: auction, error: auctionError } = await supabase
      .from('auctions')
      .select('auction_end')
      .eq('id', auctionId)
      .eq('draft_id', internalId)
      .single()

    if (auctionError || !auction) {
      throw new Error('Auction not found')
    }

    const newEndTime = new Date(new Date(auction.auction_end).getTime() + additionalSeconds * 1000)

    const { error } = await supabase
      .from('auctions')
      .update({
        auction_end: newEndTime.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', auctionId)

    if (error) {
      log.error('Error extending auction time:', error)
      throw new Error('Failed to extend auction time')
    }
  }

  /**
   * Get current active auction for a draft
   */
  static async getCurrentAuction(draftId: string): Promise<Auction | null> {
    if (!supabase) return null

    const draftState = await this.getDraftState(draftId)
    if (!draftState) return null

    const { data: auction, error } = await supabase
      .from('auctions')
      .select('*')
      .eq('draft_id', draftState.draft.id)
      .eq('status', 'active')
      .single()

    if (error) {
      log.error('Error fetching current auction:', error)
      return null
    }

    return auction
  }

  /**
   * Validate if user can nominate in auction draft
   */
  private static async validateUserCanNominate(
    draftId: string,
    userId: string
  ): Promise<{ canNominate: boolean; teamId: string | null; reason?: string }> {
    // Get draft state
    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      return { canNominate: false, teamId: null, reason: 'Draft not found' }
    }

    // Check if draft is active
    if (draftState.draft.status !== 'active') {
      return { canNominate: false, teamId: null, reason: 'Draft is not active' }
    }

    // Check if this is an auction draft
    if (draftState.draft.format !== 'auction') {
      return { canNominate: false, teamId: null, reason: 'This is not an auction draft' }
    }

    // Get user's team
    const userTeamId = await this.getUserTeam(draftId, userId)
    if (!userTeamId) {
      return { canNominate: false, teamId: null, reason: 'You are not part of this draft' }
    }

    // Check if there's already an active auction
    const currentAuction = await this.getCurrentAuction(draftId)
    if (currentAuction) {
      return { canNominate: false, teamId: userTeamId, reason: 'There is already an active auction' }
    }

    // Implement turn-based nomination logic for auction drafts
    const { draft: _draft, teams, picks } = draftState

    // Calculate whose turn it is to nominate
    const totalPicks = picks.length
    const totalTeams = teams.length

    if (totalTeams === 0) {
      return { canNominate: false, teamId: userTeamId, reason: 'No teams in draft' }
    }

    // Determine current nominating team using round-robin
    // Each team nominates once per round in order
    const currentNominatorIndex = totalPicks % totalTeams
    const sortedTeams = [...teams].sort((a, b) => a.draft_order - b.draft_order)
    const currentNominatingTeam = sortedTeams[currentNominatorIndex]

    if (!currentNominatingTeam) {
      return { canNominate: false, teamId: userTeamId, reason: 'Could not determine current turn' }
    }

    const isUserTurn = currentNominatingTeam.id === userTeamId

    if (!isUserTurn) {
      return {
        canNominate: false,
        teamId: userTeamId,
        reason: `It's ${currentNominatingTeam.name}'s turn to nominate`
      }
    }

    return { canNominate: true, teamId: userTeamId }
  }

  /**
   * Check auction draft progress and advance if needed
   */
  private static async checkAuctionDraftProgress(draftId: string): Promise<void> {
    const draftState = await this.getDraftState(draftId)
    if (!draftState) return
    if (!supabase) return

    const internalId = draftState.draft.id
    const maxPicks = Number(draftState.draft.settings?.pokemonPerTeam || 10)
    const totalPossiblePicks = draftState.teams.length * maxPicks
    const currentPicks = draftState.picks.length

    // Check if draft is complete
    if (currentPicks >= totalPossiblePicks) {
      const { error } = await supabase
        .from('drafts')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', internalId)

      if (error) {
        log.error('Error completing auction draft:', error)
      }

      // League creation is handled on the results page so the host can configure settings first
    }

    // Update current turn/round for auction drafts
    const currentTurn = currentPicks + 1
    const currentRound = Math.floor(currentPicks / draftState.teams.length) + 1

    const { error: turnError } = await supabase
      .from('drafts')
      .update({
        current_turn: currentTurn,
        current_round: currentRound,
        updated_at: new Date().toISOString()
      })
      .eq('id', internalId)

    if (turnError) {
      log.error('Error updating auction draft turn:', turnError)
    }
  }

  /**
   * Undo the last pick in a draft (only if allowUndos is enabled in settings)
   */
  static async undoLastPick(draftId: string, userId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get draft state and check if undos are allowed
    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    if (!draftState.draft.settings?.allowUndos) {
      throw new Error('Undo is not enabled for this draft')
    }

    // Check if user is host (only host can undo)
    const participant = draftState.participants.find(p => p.user_id === userId)
    if (!participant?.is_host) {
      throw new Error('Only the host can undo picks')
    }

    // Get the last pick
    const lastPick = draftState.picks.sort((a, b) => b.pick_order - a.pick_order)[0]
    if (!lastPick) {
      throw new Error('No picks to undo')
    }

    // Delete the pick
    const { error: deleteError } = await (supabase
      .from('picks'))
      .delete()
      .eq('id', lastPick.id)

    if (deleteError) {
      log.error('Error deleting pick:', deleteError)
      throw new Error('Failed to undo pick')
    }

    // Restore team budget (read-update pattern since supabase-js doesn't support SQL expressions)
    const { data: teamBudgetData, error: teamFetchError } = await supabase
      .from('teams')
      .select('budget_remaining')
      .eq('id', lastPick.team_id)
      .single()

    if (teamFetchError || !teamBudgetData) {
      log.error('Error fetching team budget for undo:', teamFetchError)
    } else {
      const newBudget = teamBudgetData.budget_remaining + lastPick.cost
      const { error: budgetError } = await supabase
        .from('teams')
        .update({ budget_remaining: newBudget })
        .eq('id', lastPick.team_id)

      if (budgetError) {
        log.error('Error restoring budget:', budgetError)
      }
    }

    // Revert draft turn
    const newTurn = Math.max(1, (draftState.draft.current_turn || 1) - 1)
    const totalTeams = draftState.teams.length
    const newRound = Math.floor((newTurn - 1) / totalTeams) + 1

    await (supabase
      .from('drafts'))
      .update({
        current_turn: newTurn,
        current_round: newRound,
        status: 'active' // Revert from completed if needed
      })
      .eq('id', draftState.draft.id)
  }

  /**
   * Undo a specific pick by ID (for more control)
   */
  static async undoPickById(draftId: string, userId: string, pickId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get draft state and check if undos are allowed
    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    if (!draftState.draft.settings?.allowUndos) {
      throw new Error('Undo is not enabled for this draft')
    }

    // Check if user is host
    const participant = draftState.participants.find(p => p.user_id === userId)
    if (!participant?.is_host) {
      throw new Error('Only the host can undo picks')
    }

    // Get the specific pick
    const pick = draftState.picks.find(p => p.id === pickId)
    if (!pick) {
      throw new Error('Pick not found')
    }

    // Don't allow undoing old picks that would break the sequence
    const lastPick = draftState.picks.sort((a, b) => b.pick_order - a.pick_order)[0]
    if (pick.pick_order !== lastPick.pick_order) {
      throw new Error('Can only undo the most recent pick')
    }

    // Use the same logic as undoLastPick
    await this.undoLastPick(draftId, userId)
  }


  /**
   * Get draft history/results for browsing past drafts
   */
  static async getDraftHistory(limit: number = 20, offset: number = 0): Promise<Record<string, unknown>[]> {
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
  static async getDraftResults(draftId: string): Promise<Record<string, unknown> | null> {
    if (!supabase) throw new Error('Supabase not available')

    const draftState = await this.getDraftState(draftId)
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
  static async saveDraftResults(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const draftState = await this.getDraftState(draftId)
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
  static async deleteDraftResults(draftResultId: string): Promise<void> {
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
   * Auto-skip a turn when time expires (AFK handling)
   */
  static async autoSkipTurn(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    try {
      // Get current draft state
      const draftState = await this.getDraftState(draftId)
      if (!draftState) {
        log.warn(`Auto-skip aborted: Draft ${draftId} not found or has ended`)
        return // Don't throw, just return silently
      }

      if (draftState.draft.status !== 'active') {
        log.warn(`Auto-skip aborted: Draft ${draftId} is not active (status: ${draftState.draft.status})`)
        return // Don't throw for non-active drafts
      }

      // Simply advance to the next turn without making a pick
      // This effectively skips the current team's turn
      await this.advanceTurn(draftId)

      log.info(`Auto-skipped turn ${draftState.draft.current_turn} for draft ${draftId}`)
    } catch (error) {
      log.error(`Auto-skip failed for draft ${draftId}:`, error)
      // Re-throw only if it's not a "not found" error
      if (error instanceof Error && !error.message?.includes('not found')) {
        throw error
      }
    }
  }

  /**
   * Get all public drafts
   */
  static async getPublicDrafts(options?: {
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

}