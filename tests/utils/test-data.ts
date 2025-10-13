import type { Draft, Team, Participant, Pick, Pokemon } from '@/types'

/**
 * Test fixture data for unit tests
 */

export const mockDraft: Draft = {
  id: 'draft-1',
  name: 'Test Draft',
  hostId: 'user-1',
  format: 'snake',
  ruleset: 'vgc-reg-h',
  maxTeams: 4,
  budgetPerTeam: 100,
  status: 'active',
  currentTurn: 1,
  currentRound: 1,
  settings: {
    timePerPick: 60,
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
  },
  {
    id: 'team-2',
    draftId: 'draft-1',
    name: 'Team Beta',
    ownerId: 'user-2',
    draftOrder: 2,
    budgetRemaining: 100,
    picks: [],
  },
  {
    id: 'team-3',
    draftId: 'draft-1',
    name: 'Team Gamma',
    ownerId: 'user-3',
    draftOrder: 3,
    budgetRemaining: 100,
    picks: [],
  },
  {
    id: 'team-4',
    draftId: 'draft-1',
    name: 'Team Delta',
    ownerId: 'user-4',
    draftOrder: 4,
    budgetRemaining: 100,
    picks: [],
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
    isAdmin: false,
    lastSeen: '2025-01-01T00:00:00Z',
  },
  {
    id: 'participant-2',
    draftId: 'draft-1',
    userId: 'user-2',
    displayName: 'Player Two',
    teamId: 'team-2',
    isHost: false,
    isAdmin: false,
    lastSeen: '2025-01-01T00:00:00Z',
  },
  {
    id: 'participant-3',
    draftId: 'draft-1',
    userId: 'user-3',
    displayName: 'Player Three',
    teamId: 'team-3',
    isHost: false,
    isAdmin: false,
    lastSeen: '2025-01-01T00:00:00Z',
  },
  {
    id: 'participant-4',
    draftId: 'draft-1',
    userId: 'user-4',
    displayName: 'Player Four',
    teamId: 'team-4',
    isHost: false,
    isAdmin: false,
    lastSeen: '2025-01-01T00:00:00Z',
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
    types: [
      { name: 'grass', color: '#78C850' },
      { name: 'poison', color: '#A040A0' }
    ],
    stats: {
      hp: 45,
      attack: 49,
      defense: 49,
      specialAttack: 65,
      specialDefense: 65,
      speed: 45,
      total: 318,
    },
    abilities: ['overgrow', 'chlorophyll'],
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
    cost: 10,
    isLegal: true,
  },
  {
    id: '4',
    name: 'Charmander',
    types: [
      { name: 'fire', color: '#F08030' }
    ],
    stats: {
      hp: 39,
      attack: 52,
      defense: 43,
      specialAttack: 60,
      specialDefense: 50,
      speed: 65,
      total: 309,
    },
    abilities: ['blaze', 'solar-power'],
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png',
    cost: 10,
    isLegal: true,
  },
  {
    id: '7',
    name: 'Squirtle',
    types: [
      { name: 'water', color: '#6890F0' }
    ],
    stats: {
      hp: 44,
      attack: 48,
      defense: 65,
      specialAttack: 50,
      specialDefense: 64,
      speed: 43,
      total: 314,
    },
    abilities: ['torrent', 'rain-dish'],
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png',
    cost: 10,
    isLegal: true,
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
