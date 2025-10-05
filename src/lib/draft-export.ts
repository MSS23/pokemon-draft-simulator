import { Draft, Team, Pick, Participant, Pokemon } from '@/types'
import { calculateTeamStats, rateTeam } from './team-analytics'

export interface ExportDraftData {
  draft: Draft
  teams: Team[]
  picks: Pick[]
  participants: Participant[]
  pokemon: Pokemon[]
}

/**
 * Exports draft data as JSON
 */
export function exportDraftAsJSON(data: ExportDraftData): string {
  const exportData = {
    meta: {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      draftId: data.draft.id,
      draftName: data.draft.name
    },
    draft: {
      id: data.draft.id,
      name: data.draft.name,
      format: data.draft.format,
      status: data.draft.status,
      createdAt: data.draft.createdAt,
      completedAt: data.draft.status === 'completed' ? new Date().toISOString() : null,
      settings: data.draft.settings
    },
    teams: data.teams.map(team => {
      const teamPicks = data.picks.filter(p => p.teamId === team.id)
      const pokemonDetails = teamPicks.map(pick =>
        data.pokemon.find(p => p.id === pick.pokemonId)
      )

      return {
        id: team.id,
        name: team.name,
        draftOrder: team.draftOrder,
        budgetRemaining: team.budgetRemaining,
        picks: teamPicks.map(pick => ({
          pokemonId: pick.pokemonId,
          pokemonName: pick.pokemonName,
          cost: pick.cost,
          round: pick.round,
          pickOrder: pick.pickOrder,
          details: pokemonDetails.find(p => p?.id === pick.pokemonId)
        }))
      }
    }),
    participants: data.participants.map(p => ({
      displayName: p.displayName,
      teamId: p.teamId,
      isHost: p.isHost,
      isAdmin: p.isAdmin
    }))
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * Downloads draft data as JSON file
 */
export function downloadDraftJSON(data: ExportDraftData) {
  const jsonString = exportDraftAsJSON(data)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${data.draft.name.replace(/\s+/g, '-').toLowerCase()}-${data.draft.id}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Exports draft as CSV (picks only)
 */
export function exportDraftAsCSV(data: ExportDraftData): string {
  const headers = ['Round', 'Pick', 'Team', 'Pokemon', 'Cost', 'Types', 'BST', 'Abilities']

  const rows = data.picks
    .sort((a, b) => a.pickOrder - b.pickOrder)
    .map(pick => {
      const pokemon = data.pokemon.find(p => p.id === pick.pokemonId)
      const team = data.teams.find(t => t.id === pick.teamId)

      return [
        pick.round,
        pick.pickOrder,
        team?.name || 'Unknown',
        pick.pokemonName,
        pick.cost,
        pokemon?.types.map(t => t.name).join('/') || '',
        pokemon?.stats.total || '',
        pokemon?.abilities.join(', ') || ''
      ]
    })

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n')

  return csvContent
}

/**
 * Downloads draft as CSV file
 */
export function downloadDraftCSV(data: ExportDraftData) {
  const csvString = exportDraftAsCSV(data)
  const blob = new Blob([csvString], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${data.draft.name.replace(/\s+/g, '-').toLowerCase()}-picks.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Generates a text summary of the draft
 */
export function generateDraftSummary(data: ExportDraftData): string {
  const { draft, teams, picks, participants, pokemon } = data

  let summary = `
╔════════════════════════════════════════════════════════════╗
║           POKEMON DRAFT SUMMARY                            ║
╚════════════════════════════════════════════════════════════╝

Draft Name: ${draft.name}
Format: ${draft.format.toUpperCase()}
Status: ${draft.status.toUpperCase()}
Date: ${new Date(draft.createdAt).toLocaleDateString()}
Participants: ${participants.length}

`

  teams.forEach((team, index) => {
    const teamPicks = picks.filter(p => p.teamId === team.id)
    const stats = calculateTeamStats(team, picks, pokemon)
    const rating = rateTeam(stats)

    summary += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEAM ${index + 1}: ${team.name.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Draft Order: #${team.draftOrder}
Budget Used: ${stats.budgetUsed} / ${stats.budgetUsed + team.budgetRemaining}
Team Rating: ${rating.overall}/100 ★

Pokemon (${teamPicks.length}):
${teamPicks.map((pick, i) => {
  const p = pokemon.find(poke => poke.id === pick.pokemonId)
  return `  ${i + 1}. ${pick.pokemonName.padEnd(20)} | Cost: ${pick.cost.toString().padStart(3)} | BST: ${p?.stats.total || '???'} | ${p?.types.map(t => t.name).join('/') || ''}`
}).join('\n')}

Team Statistics:
  Average BST: ${stats.avgBST}
  Total BST: ${stats.totalBST}
  Type Diversity: ${stats.uniqueTypes.length} types
  Legendary/Mythical: ${stats.legendaryCount + stats.mythicalCount}

Stat Breakdown:
  HP:        ${stats.avgHP.toString().padStart(3)}  |  Rating: ${rating.breakdown.offense}/100
  Attack:    ${stats.avgAttack.toString().padStart(3)}  |
  Defense:   ${stats.avgDefense.toString().padStart(3)}  |  Rating: ${rating.breakdown.defense}/100
  Sp. Atk:   ${stats.avgSpecialAttack.toString().padStart(3)}  |
  Sp. Def:   ${stats.avgSpecialDefense.toString().padStart(3)}  |
  Speed:     ${stats.avgSpeed.toString().padStart(3)}  |  Rating: ${rating.breakdown.speed}/100

Type Coverage: ${stats.uniqueTypes.join(', ')}

`
  })

  summary += `
╔════════════════════════════════════════════════════════════╗
║                 END OF DRAFT SUMMARY                       ║
╚════════════════════════════════════════════════════════════╝
`

  return summary
}

/**
 * Downloads draft summary as text file
 */
export function downloadDraftSummary(data: ExportDraftData) {
  const summary = generateDraftSummary(data)
  const blob = new Blob([summary], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${data.draft.name.replace(/\s+/g, '-').toLowerCase()}-summary.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Copies draft summary to clipboard
 */
export async function copyDraftSummaryToClipboard(data: ExportDraftData): Promise<boolean> {
  try {
    const summary = generateDraftSummary(data)
    await navigator.clipboard.writeText(summary)
    return true
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    return false
  }
}

/**
 * Exports team comparison data
 */
export function exportTeamComparison(data: ExportDraftData): string {
  const { teams, picks, pokemon } = data

  let comparison = `
TEAM COMPARISON REPORT
Generated: ${new Date().toLocaleString()}

`

  teams.forEach((team, index) => {
    const stats = calculateTeamStats(team, picks, pokemon)
    const rating = rateTeam(stats)

    comparison += `
Team ${index + 1}: ${team.name}
  Overall Rating: ${rating.overall}/100
  Offense:  ${rating.breakdown.offense}/100
  Defense:  ${rating.breakdown.defense}/100
  Speed:    ${rating.breakdown.speed}/100
  Diversity: ${rating.breakdown.diversity}/100
  Value:    ${rating.breakdown.value}/100
  Total BST: ${stats.totalBST}
  Avg BST: ${stats.avgBST}
  Budget Used: ${stats.budgetUsed}
  Type Count: ${stats.uniqueTypes.length}

`
  })

  return comparison
}
