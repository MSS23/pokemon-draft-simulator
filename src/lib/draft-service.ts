import { supabase } from './supabase'
import type { Database } from './supabase'
import { generateSnakeDraftOrder, getCurrentPick } from '@/utils/draft'
import { getFormatById, DEFAULT_FORMAT } from '@/lib/formats'
import { createFormatRulesEngine as createNewFormatRulesEngine } from '@/domain/rules'
import { Pokemon } from '@/types'
import { UserSessionService, type DraftParticipation } from '@/lib/user-session'
import { generateRoomCode } from '@/lib/room-utils'
import { fetchPokemon } from '@/lib/pokemon-api'

type Draft = Database['public']['Tables']['drafts']['Row']
type Team = Database['public']['Tables']['teams']['Row']
type Participant = Database['public']['Tables']['participants']['Row']
type Pick = Database['public']['Tables']['picks']['Row']
type Auction = Database['public']['Tables']['auctions']['Row']

export interface DraftSettings {
  maxTeams: number
  draftType: 'snake' | 'auction'
  timeLimit: number
  pokemonPerTeam: number
  budgetPerTeam?: number
  formatId?: string
}

export interface CreateDraftParams {
  name: string
  hostName: string
  teamName: string
  settings: DraftSettings
  isPublic?: boolean
  description?: string | null
  tags?: string[] | null
  customFormat?: {
    name: string
    description: string
    pokemonPricing: Record<string, number>
  }
}

export interface JoinDraftParams {
  roomCode: string
  userName: string
  teamName: string
}

export interface JoinSpectatorParams {
  roomCode: string
  userName: string
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
   * Helper to query drafts by room code (which is used as the logical draft ID)
   */
  private static getDraftQuery(roomCode: string) {
    return { room_code: roomCode.toLowerCase() }
  }

  /**
   * Get server-authoritative time with draft timing information
   * This prevents client-side timer drift
   */
  static async getServerTime(roomCode: string): Promise<ServerTime> {
    try {
      const { data: draft } = await supabase
        .from('drafts')
        .select('settings, updated_at')
        .eq('room_code', roomCode.toLowerCase())
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
      const serverTime = new Date((draft as any).updated_at).getTime()

      return {
        serverTime,
        pickEndsAt: null, // Will be calculated on client with server offset
        auctionEndsAt: null,
        turnStartedAt: null
      }
    } catch (error) {
      console.error('Error fetching server time:', error)
      return {
        serverTime: Date.now(),
        pickEndsAt: null,
        auctionEndsAt: null,
        turnStartedAt: null
      }
    }
  }

  static async createDraft({ name, hostName, teamName, settings, isPublic, description, tags, customFormat }: CreateDraftParams): Promise<{ roomCode: string; draftId: string }> {
    if (!supabase) {
      console.error('Supabase configuration error:', {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      })
      throw new Error('Supabase is not properly configured. Please check your environment variables and restart the dev server.')
    }

    const roomCode = this.generateRoomCode()
    const hostId = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    let customFormatId: string | null = null

    // If custom format is provided, create it in the database first
    if (customFormat) {
      const { data: formatData, error: formatError } = await (supabase
        .from('custom_formats') as any)
        .insert({
          name: customFormat.name,
          description: customFormat.description,
          created_by_display_name: hostName,
          is_public: false,
          pokemon_pricing: customFormat.pokemonPricing
        })
        .select()
        .single()

      if (formatError) {
        console.error('Error creating custom format:', formatError)
        throw new Error(`Failed to create custom format: ${formatError.message}`)
      }

      customFormatId = formatData.id
    }

    // Create draft - build insert object conditionally based on table columns
    const draftInsert: any = {
      room_code: roomCode.toLowerCase(),
      name: name || `${hostName}'s Draft`,
      host_id: hostId,
      format: settings.draftType,
      max_teams: settings.maxTeams,
      budget_per_team: settings.budgetPerTeam || 100,
      status: 'setup',
      current_round: 1,
      settings: {
        timeLimit: settings.timeLimit,
        pokemonPerTeam: settings.pokemonPerTeam,
        formatId: settings.formatId || DEFAULT_FORMAT
      }
    }

    // Add optional columns only if they're supported (spectator mode migration)
    if (isPublic !== undefined) draftInsert.is_public = isPublic || false
    if (description) draftInsert.description = description
    if (tags) draftInsert.tags = tags
    if (customFormatId) draftInsert.custom_format_id = customFormatId

    const { data: draft, error: draftError } = await (supabase
      .from('drafts') as any)
      .insert(draftInsert)
      .select()
      .single()

    if (draftError) {
      console.error('Error creating draft:', draftError)
      throw new Error(`Failed to create draft: ${draftError.message || JSON.stringify(draftError)}`)
    }

    // Create host team
    const { data: team, error: teamError } = await (supabase
      .from('teams') as any)
      .insert({
        draft_id: (draft as any).id,
        name: teamName,
        owner_id: hostId,
        draft_order: 1,
        budget_remaining: settings.budgetPerTeam || 100
      })
      .select()
      .single()

    if (teamError) {
      console.error('Error creating team:', teamError)
      throw new Error(`Failed to create team: ${teamError.message || JSON.stringify(teamError)}`)
    }

    // Create host participant
    const { error: participantError } = await (supabase
      .from('participants') as any)
      .insert({
        draft_id: (draft as any).id,
        user_id: hostId,
        display_name: hostName,
        team_id: team.id,
        is_host: true,
        last_seen: new Date().toISOString()
      })

    if (participantError) {
      console.error('Error creating participant:', participantError)
      throw new Error('Failed to create participant')
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

  static async joinDraft({ roomCode, userName, teamName }: JoinDraftParams): Promise<{ draftId: string; teamId: string; asSpectator?: boolean }> {
    const draftId = roomCode.toLowerCase()
    const userId = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Check if draft exists and is joinable
    if (!supabase) throw new Error('Supabase not available')

    const { data: draft, error: draftError } = await supabase
      .from('drafts')
      .select('*, teams(*), participants(*)')
      .eq('room_code', draftId)
      .single()

    if (draftError || !draft) {
      throw new Error('Draft room not found')
    }

    // If draft is full or already started, join as spectator instead
    if ((draft as any).teams.length >= (draft as any).max_teams || (draft as any).status !== 'setup') {
      console.log('Draft is full or started, joining as spectator instead')
      const result = await this.joinAsSpectator({ roomCode, userName })
      return {
        draftId: result.draftId,
        teamId: '', // No team for spectators
        asSpectator: true
      }
    }

    // Check for duplicate userName + teamName combination
    const existingTeams = (draft as any).teams || []
    const existingParticipants = (draft as any).participants || []

    for (const team of existingTeams) {
      const teamParticipant = existingParticipants.find((p: any) => p.team_id === team.id)
      if (teamParticipant &&
          team.name.toLowerCase() === teamName.toLowerCase() &&
          teamParticipant.display_name.toLowerCase() === userName.toLowerCase()) {
        throw new Error(`A team named "${teamName}" with trainer "${userName}" already exists in this draft. Please choose a different name.`)
      }
    }

    // Also check for duplicate team name alone (to prevent confusion)
    if (existingTeams.some((team: any) => team.name.toLowerCase() === teamName.toLowerCase())) {
      throw new Error(`Team name "${teamName}" is already taken. Please choose a different team name.`)
    }

    // Get next draft order
    const nextDraftOrder = (draft as any).teams.length + 1
    const draftUuid = (draft as any).id  // Actual UUID from database

    // Create team
    const { data: team, error: teamError } = await (supabase
      .from('teams') as any)
      .insert({
        draft_id: draftUuid,
        name: teamName,
        owner_id: userId,
        draft_order: nextDraftOrder,
        budget_remaining: (draft as any).budget_per_team
      })
      .select()
      .single()

    if (teamError) {
      console.error('Error creating team:', teamError)
      throw new Error('Failed to join draft')
    }

    // Create participant
    const { error: participantError } = await (supabase
      .from('participants') as any)
      .insert({
        draft_id: draftUuid,
        user_id: userId,
        display_name: userName,
        team_id: team.id,
        is_host: false,
        last_seen: new Date().toISOString()
      })

    if (participantError) {
      console.error('Error creating participant:', participantError)
      throw new Error('Failed to create participant')
    }

    // Record draft participation in user session (use room code as logical draft ID)
    UserSessionService.recordDraftParticipation({
      draftId: draftId,
      userId: userId,
      teamId: team.id,
      teamName: teamName,
      displayName: userName,
      isHost: false,
      status: 'active'
    })

    return { draftId, teamId: team.id }
  }

  static async joinAsSpectator({ roomCode, userName }: JoinSpectatorParams): Promise<{ draftId: string }> {
    const draftId = roomCode.toLowerCase()
    const userId = `spectator-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Check if draft exists
    if (!supabase) throw new Error('Supabase not available')

    const { data: draft, error: draftError } = await supabase
      .from('drafts')
      .select('*')
      .eq('room_code', draftId)
      .single()

    if (draftError || !draft) {
      throw new Error('Draft room not found')
    }

    const draftUuid = (draft as any).id

    // Create spectator participant (no team assignment)
    const { error: participantError } = await (supabase
      .from('participants') as any)
      .insert({
        draft_id: draftUuid,
        user_id: userId,
        display_name: userName,
        team_id: null, // Spectators have no team
        is_host: false,
        last_seen: new Date().toISOString()
      })

    if (participantError) {
      console.error('Error creating spectator:', participantError)
      throw new Error('Failed to join as spectator')
    }

    // Record spectator participation in user session
    UserSessionService.recordDraftParticipation({
      draftId: draftId,
      userId: userId,
      teamId: null,
      teamName: null,
      displayName: userName,
      isHost: false,
      status: 'spectator'
    })

    return { draftId }
  }

  static async getDraftState(roomCodeOrDraftId: string): Promise<DraftState | null> {
    if (!supabase) return null

    const { data, error} = await supabase
      .from('drafts')
      .select(`
        *,
        teams(*),
        participants(*),
        picks(*),
        auctions(*)
      `)
      .eq('room_code', roomCodeOrDraftId.toLowerCase())
      .single()

    if (error || !data) {
      console.error('Error fetching draft state:', error)
      return null
    }

    return {
      draft: data,
      teams: (data as any).teams || [],
      participants: (data as any).participants || [],
      picks: (data as any).picks || [],
      auctions: (data as any).auctions || []
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
    const updatePromises = teams.map((team, index) =>
      (supabase as any)
        .from('teams')
        .update({ draft_order: randomizedOrder[index] })
        .eq('id', (team as any).id)
    )

    await Promise.all(updatePromises)

    // Update draft timestamp to trigger refresh
    await (supabase as any)
      .from('drafts')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', draftUuid)
  }

  static async startDraft(roomCodeOrDraftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get draft by room code
    const draftState = await this.getDraftState(roomCodeOrDraftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    const draftUuid = draftState.draft.id

    // Get all teams for this draft
    const teams = draftState.teams

    if (!teams || teams.length === 0) {
      throw new Error('No teams in draft')
    }

    // Check if draft order has been set (shuffled)
    // If all teams have draft_order = their index + 1, it hasn't been shuffled
    const needsShuffle = teams.every((team, index) => (team as any).draft_order === index + 1)

    if (needsShuffle) {
      // Auto-shuffle if not done manually
      const randomizedOrder = teams.map((_, index) => index + 1)
      for (let i = randomizedOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [randomizedOrder[i], randomizedOrder[j]] = [randomizedOrder[j], randomizedOrder[i]]
      }

      // Update each team with new randomized draft order
      const updatePromises = teams.map((team, index) =>
        (supabase as any)
          .from('teams')
          .update({ draft_order: randomizedOrder[index] })
          .eq('id', (team as any).id)
      )

      await Promise.all(updatePromises)
    }

    // Set draft to active with first turn
    const { error } = await (supabase as any)
      .from('drafts')
      .update({
        status: 'active',
        current_turn: 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', draftUuid)

    if (error) {
      console.error('Error starting draft:', error)
      throw new Error('Failed to start draft')
    }
  }

  static async makePick(draftId: string, userId: string, pokemonId: string, pokemonName: string, cost: number): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')
    
    // Validate user can pick and get their team
    const validation = await this.validateUserCanPick(draftId, userId)
    if (!validation.canPick) {
      throw new Error(validation.reason || 'Cannot make pick')
    }

    const teamId = validation.teamId!

    // Get draft state to validate pick against format
    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    // Validate Pokemon against format rules
    const formatValidation = await this.validatePokemonInFormat(draftState.draft, pokemonId, pokemonName, cost)
    if (!formatValidation.isValid) {
      throw new Error(formatValidation.reason || 'Pokemon is not legal in this format')
    }

    // Use the validated cost from format rules
    const validatedCost = formatValidation.validatedCost

    const totalTeams = draftState.teams.length
    const maxRounds = draftState.draft.settings?.maxPokemonPerTeam || 10
    const currentTurn = draftState.draft.current_turn || 1

    // Generate snake draft order for all rounds
    const draftOrder = generateSnakeDraftOrder(draftState.teams as any, maxRounds)

    // Get current pick info
    const pickInfo = getCurrentPick(draftOrder, currentTurn)

    const pickOrder = draftState.picks.length + 1

    // Create the pick
    const { error: pickError } = await (supabase
      .from('picks') as any)
      .insert({
        draft_id: draftId,
        team_id: teamId,
        pokemon_id: pokemonId,
        pokemon_name: pokemonName,
        cost: validatedCost,
        pick_order: pickOrder,
        round: pickInfo.round
      })

    if (pickError) {
      console.error('Error making pick:', pickError)
      throw new Error('Failed to make pick')
    }

    // Update team budget
    const { error: teamError } = await (supabase
      .from('teams') as any)
      .update({
        budget_remaining: (supabase as any).sql`budget_remaining - ${validatedCost}`
      })
      .eq('id', teamId)

    if (teamError) {
      console.error('Error updating team budget:', teamError)
    }

    // Calculate next turn using proper snake draft logic
    const nextTurn = currentTurn + 1
    const nextRound = Math.floor((nextTurn - 1) / totalTeams) + 1

    // Check if draft is complete
    const isComplete = nextTurn > draftOrder.length

    // Update draft turn and round
    const updateData = isComplete
      ? {
          status: 'completed' as const,
          updated_at: new Date().toISOString()
        }
      : {
          current_turn: nextTurn,
          current_round: nextRound,
          updated_at: new Date().toISOString()
        }

    const { error: draftError } = await (supabase
      .from('drafts') as any)
      .update(updateData)
      .eq('id', draftId)

    if (draftError) {
      console.error('Error updating draft turn:', draftError)
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

  static subscribeToDraft(roomCodeOrDraftId: string, callback: (payload: { eventType?: string; new?: any; old?: any }) => void) {
    if (!supabase) throw new Error('Supabase not available')

    // We need to get the actual UUID for the subscription
    // The subscription will be set up asynchronously after resolving the ID
    const channels: any[] = []
    let setupAttempted = false
    let isCleanedUp = false

    // Async function to setup subscriptions
    const setupSubscriptions = async () => {
      // Prevent multiple setup attempts
      if (setupAttempted || isCleanedUp) return
      setupAttempted = true

      try {
        // Get the draft state to find the UUID
        const draftState = await this.getDraftState(roomCodeOrDraftId)

        // Check if cleanup happened while we were waiting
        if (isCleanedUp) return

        if (!draftState) {
          console.error('Draft not found for subscription:', roomCodeOrDraftId)
          // Don't retry if draft doesn't exist
          return
        }

        const draftUuid = draftState.draft.id

        // Check again if cleanup happened
        if (isCleanedUp) return

        // Now subscribe using the UUID
        const channel = supabase.channel(`draft-${roomCodeOrDraftId}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'drafts',
            filter: `id=eq.${draftUuid}`
          }, callback)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'teams',
            filter: `draft_id=eq.${draftUuid}`
          }, callback)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'participants',
            filter: `draft_id=eq.${draftUuid}`
          }, callback)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'picks',
            filter: `draft_id=eq.${draftUuid}`
          }, callback)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'auctions',
            filter: `draft_id=eq.${draftUuid}`
          }, callback)

        // Don't subscribe if cleanup already happened
        if (isCleanedUp) return

        channel.subscribe()
        channels.push(channel)
      } catch (error) {
        console.error('Error setting up draft subscriptions:', error)
      }
    }

    // Start setup
    setupSubscriptions()

    // Return cleanup function
    return () => {
      isCleanedUp = true
      if (supabase && channels.length > 0) {
        channels.forEach(channel => {
          try {
            supabase.removeChannel(channel)
          } catch (error) {
            // Ignore errors during cleanup
            console.debug('Error removing channel during cleanup:', error)
          }
        })
      }
    }
  }

  static async validateUserTeam(draftId: string, userId: string, teamId: string): Promise<boolean> {
    if (!supabase) return false
    
    const { data: participant } = await supabase
      .from('participants')
      .select('team_id')
      .eq('draft_id', draftId)
      .eq('user_id', userId)
      .single()

    return (participant as any)?.team_id === teamId
  }

  static async getUserTeam(draftId: string, userId: string): Promise<string | null> {
    if (!supabase) return null
    
    const { data: participant } = await supabase
      .from('participants')
      .select('team_id')
      .eq('draft_id', draftId)
      .eq('user_id', userId)
      .single()

    return (participant as any)?.team_id || null
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

    const draftOrder = generateSnakeDraftOrder(draftState.teams as any, maxRounds)
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

    const { error } = await (supabase
      .from('drafts') as any)
      .update({
        status: 'paused',
        updated_at: new Date().toISOString()
      })
      .eq('id', draftId)

    if (error) {
      console.error('Error pausing draft:', error)
      throw new Error('Failed to pause draft')
    }
  }


  static async endDraft(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const { error } = await (supabase
      .from('drafts') as any)
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', draftId)

    if (error) {
      console.error('Error ending draft:', error)
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
      .from('picks') as any)
      .delete()
      .eq('draft_id', draftState.draft.id)

    if (picksError) {
      console.error('Error deleting picks:', picksError)
      throw new Error('Failed to delete picks')
    }

    // Delete all auctions if any
    const { error: auctionsError } = await (supabase
      .from('auctions') as any)
      .delete()
      .eq('draft_id', draftState.draft.id)

    if (auctionsError) {
      console.error('Error deleting auctions:', auctionsError)
      // Don't throw - auctions might not exist
    }

    // Delete all bid history if any
    const { error: bidsError } = await (supabase
      .from('bid_history') as any)
      .delete()
      .eq('draft_id', draftState.draft.id)

    if (bidsError) {
      console.error('Error deleting bids:', bidsError)
      // Don't throw - bids might not exist
    }

    // Reset team budgets and picks
    const { error: teamsError } = await (supabase
      .from('teams') as any)
      .update({
        budget_remaining: draftState.draft.budget_per_team
      })
      .eq('draft_id', draftState.draft.id)

    if (teamsError) {
      console.error('Error resetting teams:', teamsError)
      throw new Error('Failed to reset teams')
    }

    // Reset draft status
    const { error: draftError } = await (supabase
      .from('drafts') as any)
      .update({
        status: 'setup',
        current_turn: null,
        current_round: 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', draftState.draft.id)

    if (draftError) {
      console.error('Error resetting draft:', draftError)
      throw new Error('Failed to reset draft')
    }
  }

  static async deleteDraft(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get the draft to verify it exists and get the internal ID
    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    const internalId = draftState.draft.id

    // Delete in order due to foreign key constraints
    // 1. Delete picks
    await (supabase.from('picks') as any).delete().eq('draft_id', internalId)

    // 2. Delete bid history
    await (supabase.from('bid_history') as any).delete().eq('draft_id', internalId)

    // 3. Delete auctions
    await (supabase.from('auctions') as any).delete().eq('draft_id', internalId)

    // 4. Delete wishlists
    await (supabase.from('wishlists') as any).delete().eq('draft_id', internalId)

    // 5. Delete participants
    await (supabase.from('participants') as any).delete().eq('draft_id', internalId)

    // 6. Delete teams
    await (supabase.from('teams') as any).delete().eq('draft_id', internalId)

    // 7. Delete draft results if any
    await (supabase.from('draft_results') as any).delete().eq('draft_id', internalId)

    // 8. Finally, delete the draft itself
    const { error: draftError } = await (supabase
      .from('drafts') as any)
      .delete()
      .eq('id', internalId)

    if (draftError) {
      console.error('Error deleting draft:', draftError)
      throw new Error('Failed to delete draft')
    }
  }

  static async advanceTurn(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    const totalTeams = draftState.teams.length
    const maxRounds = draftState.draft.settings?.maxPokemonPerTeam || 10
    const currentTurn = draftState.draft.current_turn || 1
    const nextTurn = currentTurn + 1
    const nextRound = Math.floor((nextTurn - 1) / totalTeams) + 1

    const isComplete = nextTurn > totalTeams * maxRounds

    const updateData = isComplete
      ? {
          status: 'completed' as const,
          updated_at: new Date().toISOString()
        }
      : {
          current_turn: nextTurn,
          current_round: nextRound,
          updated_at: new Date().toISOString()
        }

    const { error } = await (supabase
      .from('drafts') as any)
      .update(updateData)
      .eq('id', draftId)

    if (error) {
      console.error('Error advancing turn:', error)
      throw new Error('Failed to advance turn')
    }
  }

  static async updateParticipantLastSeen(draftId: string, userId: string): Promise<void> {
    if (!supabase) return
    
    await (supabase
      .from('participants') as any)
      .update({
        last_seen: new Date().toISOString()
      })
      .eq('draft_id', draftId)
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
      console.error('Error validating Pokemon in format:', error)
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

    const { data: draft, error } = await supabase
      .from('drafts')
      .select('settings')
      .eq('id', draftId)
      .single()

    if (error || !draft) {
      console.error('Error fetching draft format:', error)
      return null
    }

    return (draft as any).settings?.formatId || DEFAULT_FORMAT
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
      const participation = UserSessionService.getDraftParticipation(draftId)
      if (!participation) {
        return { success: false, error: 'No participation record found for this draft' }
      }

      // Check if draft still exists and is active
      const draftState = await this.getDraftState(draftId)
      if (!draftState) {
        UserSessionService.updateDraftParticipation(draftId, { status: 'abandoned' })
        return { success: false, error: 'Draft room no longer exists' }
      }

      // Update last activity
      UserSessionService.updateDraftParticipation(draftId, { status: 'active' })

      // Construct the URL with the stored session data
      const params = new URLSearchParams({
        userName: participation.displayName,
        teamName: participation.teamName || '',
        isHost: participation.isHost.toString()
      })

      const url = `/draft/${draftId}?${params.toString()}`

      return { success: true, url }
    } catch (error) {
      console.error('Error resuming draft:', error)
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
      .from('auctions') as any)
      .insert({
        draft_id: draftId,
        pokemon_id: pokemonId,
        pokemon_name: pokemonName,
        nominated_by: teamId,
        current_bid: startingBid,
        current_bidder: null,
        auction_end: auctionEnd.toISOString(),
        status: 'active'
      })

    if (error) {
      console.error('Error creating auction:', error)
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

    // Get auction details
    const { data: auction, error: auctionError } = await supabase
      .from('auctions')
      .select('*')
      .eq('id', auctionId)
      .eq('draft_id', draftId)
      .single()

    if (auctionError || !auction) {
      throw new Error('Auction not found')
    }

    if ((auction as any).status !== 'active') {
      throw new Error('Auction is not active')
    }

    // Check if auction has expired
    if (new Date() > new Date((auction as any).auction_end)) {
      throw new Error('Auction has expired')
    }

    // Validate bid amount
    if (bidAmount <= (auction as any).current_bid) {
      throw new Error(`Bid must be higher than current bid of $${(auction as any).current_bid}`)
    }

    // Get user's team and validate budget
    const userTeamId = await this.getUserTeam(draftId, userId)
    if (!userTeamId) {
      throw new Error('You are not part of this draft')
    }

    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('budget_remaining')
      .eq('id', userTeamId)
      .single()

    if (teamError || !team) {
      throw new Error('Team not found')
    }

    if (bidAmount > (team as any).budget_remaining) {
      throw new Error(`Bid exceeds your remaining budget of $${(team as any).budget_remaining}`)
    }

    // Update auction with new bid
    const { error: updateError } = await (supabase as any)
      .from('auctions')
      .update({
        current_bid: bidAmount,
        current_bidder: userTeamId,
        updated_at: new Date().toISOString()
      })
      .eq('id', auctionId)

    if (updateError) {
      console.error('Error placing bid:', updateError)
      throw new Error('Failed to place bid')
    }
  }

  /**
   * Resolve an expired auction
   */
  static async resolveAuction(draftId: string, auctionId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get auction details
    const { data: auction, error: auctionError } = await supabase
      .from('auctions')
      .select('*')
      .eq('id', auctionId)
      .eq('draft_id', draftId)
      .single()

    if (auctionError || !auction) {
      throw new Error('Auction not found')
    }

    if ((auction as any).status !== 'active') {
      throw new Error('Auction is not active')
    }

    // Check if there was a winning bidder
    if ((auction as any).current_bidder) {
      // Get draft state for pick order calculation
      const draftState = await this.getDraftState(draftId)
      if (!draftState) {
        throw new Error('Draft not found')
      }

      const pickOrder = draftState.picks.length + 1
      const currentRound = Math.floor(pickOrder / draftState.teams.length) + 1

      // Create the pick
      const { error: pickError } = await (supabase as any)
        .from('picks')
        .insert({
          draft_id: draftId,
          team_id: (auction as any).current_bidder,
          pokemon_id: (auction as any).pokemon_id,
          pokemon_name: (auction as any).pokemon_name,
          cost: (auction as any).current_bid,
          pick_order: pickOrder,
          round: currentRound
        })

      if (pickError) {
        console.error('Error creating pick from auction:', pickError)
        throw new Error('Failed to create pick from auction')
      }

      // Update team budget
      const { error: teamError } = await (supabase as any)
        .from('teams')
        .update({
          budget_remaining: (supabase as any).sql`budget_remaining - ${(auction as any).current_bid}`
        })
        .eq('id', (auction as any).current_bidder)

      if (teamError) {
        console.error('Error updating team budget after auction:', teamError)
      }
    }

    // Mark auction as completed
    const { error: updateError } = await (supabase as any)
      .from('auctions')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', auctionId)

    if (updateError) {
      console.error('Error completing auction:', updateError)
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

    const { data: auction, error: auctionError } = await supabase
      .from('auctions')
      .select('auction_end')
      .eq('id', auctionId)
      .eq('draft_id', draftId)
      .single()

    if (auctionError || !auction) {
      throw new Error('Auction not found')
    }

    const newEndTime = new Date(new Date((auction as any).auction_end).getTime() + additionalSeconds * 1000)

    const { error } = await (supabase as any)
      .from('auctions')
      .update({
        auction_end: newEndTime.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', auctionId)

    if (error) {
      console.error('Error extending auction time:', error)
      throw new Error('Failed to extend auction time')
    }
  }

  /**
   * Get current active auction for a draft
   */
  static async getCurrentAuction(draftId: string): Promise<Auction | null> {
    if (!supabase) return null

    const { data: auction, error } = await supabase
      .from('auctions')
      .select('*')
      .eq('draft_id', draftId)
      .eq('status', 'active')
      .single()

    if (error) {
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
    const { draft, teams, picks } = draftState

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

    const maxPicks = draftState.draft.settings?.pokemonPerTeam || 10
    const totalPossiblePicks = draftState.teams.length * maxPicks
    const currentPicks = draftState.picks.length

    // Check if draft is complete
    if (currentPicks >= totalPossiblePicks) {
      const { error } = await (supabase as any)
        .from('drafts')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', draftId)

      if (error) {
        console.error('Error completing auction draft:', error)
      }
    }

    // Update current turn/round for auction drafts
    const currentTurn = currentPicks + 1
    const currentRound = Math.floor(currentPicks / draftState.teams.length) + 1

    const { error: turnError } = await (supabase as any)
      .from('drafts')
      .update({
        current_turn: currentTurn,
        current_round: currentRound,
        updated_at: new Date().toISOString()
      })
      .eq('id', draftId)

    if (turnError) {
      console.error('Error updating auction draft turn:', turnError)
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
      .from('picks') as any)
      .delete()
      .eq('id', lastPick.id)

    if (deleteError) {
      console.error('Error deleting pick:', deleteError)
      throw new Error('Failed to undo pick')
    }

    // Restore team budget
    const { error: budgetError } = await (supabase
      .from('teams') as any)
      .update({
        budget_remaining: (supabase as any).sql`budget_remaining + ${lastPick.cost}`
      })
      .eq('id', lastPick.team_id)

    if (budgetError) {
      console.error('Error restoring budget:', budgetError)
    }

    // Revert draft turn
    const newTurn = Math.max(1, (draftState.draft.current_turn || 1) - 1)
    const totalTeams = draftState.teams.length
    const newRound = Math.floor((newTurn - 1) / totalTeams) + 1

    await (supabase
      .from('drafts') as any)
      .update({
        current_turn: newTurn,
        current_round: newRound,
        status: 'active' // Revert from completed if needed
      })
      .eq('id', draftId)
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
  static async getDraftHistory(limit: number = 20, offset: number = 0): Promise<any[]> {
    if (!supabase) throw new Error('Supabase not available')

    const { data, error } = await supabase
      .from('draft_history')
      .select('*')
      .order('completed_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching draft history:', error)
      throw new Error('Failed to fetch draft history')
    }

    return data || []
  }

  /**
   * Get detailed results for a specific completed draft
   */
  static async getDraftResults(draftId: string): Promise<any | null> {
    if (!supabase) throw new Error('Supabase not available')

    const { data: result, error } = await supabase
      .from('draft_results')
      .select(`
        *,
        teams:draft_result_teams(*)
      `)
      .eq('draft_id', draftId)
      .single()

    if (error) {
      console.error('Error fetching draft results:', error)
      return null
    }

    return result
  }

  /**
   * Manually save draft results (if auto-save trigger didn't work)
   */
  static async saveDraftResults(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get the draft
    const { data: draft, error: draftError } = await supabase
      .from('drafts')
      .select('*')
      .eq('id', draftId)
      .single()

    if (draftError || !draft) {
      throw new Error('Draft not found')
    }

    // Manually trigger the save by updating the draft status
    // This will trigger the save_draft_results_trigger
    const { error: updateError } = await (supabase as any)
      .from('drafts')
      .update({
        updated_at: new Date().toISOString()
      })
      .eq('id', draftId)

    if (updateError) {
      throw new Error(`Failed to trigger save: ${updateError.message}`)
    }
  }

  /**
   * Delete draft results (for cleanup)
   */
  static async deleteDraftResults(draftResultId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    const { error } = await supabase
      .from('draft_results')
      .delete()
      .eq('id', draftResultId)

    if (error) {
      console.error('Error deleting draft results:', error)
      throw new Error('Failed to delete draft results')
    }
  }


  /**
   * Auto-skip a turn when time expires (AFK handling)
   */
  static async autoSkipTurn(draftId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not available')

    // Get current draft state
    const draftState = await this.getDraftState(draftId)
    if (!draftState) {
      throw new Error('Draft not found')
    }

    if (draftState.draft.status !== 'active') {
      throw new Error('Draft is not active')
    }

    // Simply advance to the next turn without making a pick
    // This effectively skips the current team's turn
    await this.advanceTurn(draftId)

    console.log(`Auto-skipped turn ${draftState.draft.current_turn} for draft ${draftId}`)
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
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching public drafts:', error)
      throw new Error('Failed to fetch public drafts')
    }

    return (data || []).map((draft: any) => ({
      roomCode: draft.room_code,
      name: draft.name,
      status: draft.status,
      maxTeams: draft.max_teams,
      currentTeams: draft.teams?.[0]?.count || 0,
      format: draft.format,
      createdAt: draft.created_at,
      description: draft.description,
      tags: draft.tags,
      spectatorCount: draft.spectator_count || 0
    }))
  }

}