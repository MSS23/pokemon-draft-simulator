import type { Draft, Team, Participant, Pick, Pokemon } from '@/types'

/**
 * Test fixture data for unit tests
 */

export const mockDraft: Draft = {
  id: 'draft-1',
  roomCode: 'TEST01',
  name: 'Test Draft',
  hostId: 'user-1',
  format: 'snake',
  maxTeams: 4,
  budgetPerTeam: 100,
  status: 'active',
  currentTurn: 1,
  currentRound: 1,
  settings: {
    timeLimit: 60,
    pokemonPerTeam: 6,
    formatId: 'vgc-reg-h',
    maxPokemonPerTeam: 6,
  },
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
}

export const mockTeams: Team[] = [
  {
    id: 'team-1',
    draftId: 'draft-1',
    name: 'Team Alpha',
    ownerId: 'user-1',
    draftOrder: 1,
    budgetRemaining: 100,
    picks: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'team-2',
    draftId: 'draft-1',
    name: 'Team Beta',
    ownerId: 'user-2',
    draftOrder: 2,
    budgetRemaining: 100,
    picks: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'team-3',
    draftId: 'draft-1',
    name: 'Team Gamma',
    ownerId: 'user-3',
    draftOrder: 3,
    budgetRemaining: 100,
    picks: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'team-4',
    draftId: 'draft-1',
    name: 'Team Delta',
    ownerId: 'user-4',
    draftOrder: 4,
    budgetRemaining: 100,
    picks: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
]

export const mockParticipants: Participant[] = [
  {
    id: 'participant-1',
    draftId: 'draft-1',
    userId: 'user-1',
    displayName: 'Player One',
    teamId: 'team-1',
    isHost: true,
    lastSeen: '2025-01-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'participant-2',
    draftId: 'draft-1',
    userId: 'user-2',
    displayName: 'Player Two',
    teamId: 'team-2',
    isHost: false,
    lastSeen: '2025-01-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'participant-3',
    draftId: 'draft-1',
    userId: 'user-3',
    displayName: 'Player Three',
    teamId: 'team-3',
    isHost: false,
    lastSeen: '2025-01-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'participant-4',
    draftId: 'draft-1',
    userId: 'user-4',
    displayName: 'Player Four',
    teamId: 'team-4',
    isHost: false,
    lastSeen: '2025-01-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
  },
]

export const mockPicks: Pick[] = [
  {
    id: 'pick-1',
    draftId: 'draft-1',
    teamId: 'team-1',
    pokemonId: '1',
    pokemonName: 'Bulbasaur',
    cost: 10,
    pickOrder: 1,
    round: 1,
    createdAt: '2025-01-01T00:01:00Z',
  },
]

export const mockPokemon: Pokemon[] = [
  {
    id: '1',
    name: 'Bulbasaur',
    types: ['grass', 'poison'],
    stats: {
      hp: 45,
      attack: 49,
      defense: 49,
      specialAttack: 65,
      specialDefense: 65,
      speed: 45,
    },
    baseStatTotal: 318,
    abilities: ['overgrow', 'chlorophyll'],
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
    artwork: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png',
  },
  {
    id: '4',
    name: 'Charmander',
    types: ['fire'],
    stats: {
      hp: 39,
      attack: 52,
      defense: 43,
      specialAttack: 60,
      specialDefense: 50,
      speed: 65,
    },
    baseStatTotal: 309,
    abilities: ['blaze', 'solar-power'],
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png',
    artwork: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/4.png',
  },
  {
    id: '7',
    name: 'Squirtle',
    types: ['water'],
    stats: {
      hp: 44,
      attack: 48,
      defense: 65,
      specialAttack: 50,
      specialDefense: 64,
      speed: 43,
    },
    baseStatTotal: 314,
    abilities: ['torrent', 'rain-dish'],
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png',
    artwork: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/7.png',
  },
]

export const mockUserProfile = {
  id: 'profile-1',
  user_id: 'user-1',
  display_name: 'Player One',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}

export const mockAuthUser = {
  id: 'user-1',
  email: 'player1@example.com',
  user_metadata: {
    display_name: 'Player One',
  },
  created_at: '2025-01-01T00:00:00Z',
}
