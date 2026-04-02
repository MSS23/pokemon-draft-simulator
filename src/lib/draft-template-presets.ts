/**
 * Draft Template Presets
 * Pre-configured draft settings that users can select on the create page
 * for a one-click draft setup experience.
 */

export interface DraftTemplatePreset {
  id: string
  name: string
  description: string
  icon: string
  recommended?: boolean
  settings: {
    maxTeams: string
    draftType: 'tiered' | 'points' | 'auction'
    timeLimit: string
    pokemonPerTeam: string
    budgetPerTeam?: string
    formatId?: string
    scoringSystem?: 'budget' | 'tiered'
    createLeague?: boolean
    leagueWeeks?: string
  }
}

export const DRAFT_TEMPLATE_PRESETS: DraftTemplatePreset[] = [
  {
    id: 'quick-draft',
    name: 'Quick Draft',
    description: '4 players, 6 Pokemon each, fast 30-second timer. Perfect for a quick session.',
    icon: '\u26A1',
    recommended: true,
    settings: {
      maxTeams: '4',
      draftType: 'points',
      timeLimit: '30',
      pokemonPerTeam: '6',
      budgetPerTeam: '100',
      formatId: 'vgc-reg-h',
      scoringSystem: 'budget',
    },
  },
  {
    id: 'league-season',
    name: 'League Season',
    description: '8 players, 11 Pokemon each, 90-second timer. Full season with weekly matches.',
    icon: '\uD83C\uDFC6',
    settings: {
      maxTeams: '8',
      draftType: 'tiered',
      timeLimit: '90',
      pokemonPerTeam: '11',
      formatId: 'vgc-reg-h',
      scoringSystem: 'tiered',
      createLeague: true,
      leagueWeeks: '10',
    },
  },
  {
    id: 'showmatch',
    name: 'Showmatch',
    description: '2 players head-to-head, 6 Pokemon each. Great for content creators.',
    icon: '\uD83C\uDFAC',
    settings: {
      maxTeams: '2',
      draftType: 'points',
      timeLimit: '60',
      pokemonPerTeam: '6',
      budgetPerTeam: '100',
      formatId: 'vgc-reg-h',
      scoringSystem: 'budget',
    },
  },
  {
    id: 'auction-league',
    name: 'Auction League',
    description: '6 players, auction format. Bid on Pokemon with your budget.',
    icon: '\uD83D\uDCB0',
    settings: {
      maxTeams: '6',
      draftType: 'auction',
      timeLimit: '30',
      pokemonPerTeam: '8',
      budgetPerTeam: '150',
      formatId: 'vgc-reg-h',
      scoringSystem: 'budget',
    },
  },
]
