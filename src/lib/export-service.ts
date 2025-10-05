import { Pokemon } from '@/types'

export interface TeamExport {
  teamName: string
  pokemon: Pokemon[]
  totalCost: number
  budgetRemaining: number
  formatId?: string
  draftName?: string
  exportDate: string
}

export class ExportService {
  /**
   * Export team as JSON file
   */
  static exportAsJSON(data: TeamExport): void {
    const jsonString = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    this.downloadFile(blob, `${this.sanitizeFilename(data.teamName)}_team.json`)
  }

  /**
   * Export team as CSV file
   */
  static exportAsCSV(data: TeamExport): void {
    const headers = ['Name', 'Pokedex #', 'Types', 'Cost', 'HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed', 'BST']
    const rows = data.pokemon.map(p => [
      p.name,
      p.id,
      p.types.map(t => t.name).join('/'),
      p.cost.toString(),
      p.stats.hp.toString(),
      p.stats.attack.toString(),
      p.stats.defense.toString(),
      p.stats.specialAttack.toString(),
      p.stats.specialDefense.toString(),
      p.stats.speed.toString(),
      p.stats.total.toString()
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    this.downloadFile(blob, `${this.sanitizeFilename(data.teamName)}_team.csv`)
  }

  /**
   * Export team as Pokemon Showdown format
   */
  static exportAsShowdown(data: TeamExport): void {
    const showdownFormat = data.pokemon.map(p => {
      const types = p.types.map(t => t.name).join(' / ')
      const abilities = p.abilities.join(' / ')

      return `${p.name}
Ability: ${abilities}
Types: ${types}
Stats: ${p.stats.hp} HP / ${p.stats.attack} Atk / ${p.stats.defense} Def / ${p.stats.specialAttack} SpA / ${p.stats.specialDefense} SpD / ${p.stats.speed} Spe
BST: ${p.stats.total}
Cost: ${p.cost} points`
    }).join('\n\n')

    const header = `=== ${data.teamName} ===
Format: ${data.formatId || 'Custom'}
Total Cost: ${data.totalCost} / Budget Remaining: ${data.budgetRemaining}
Exported: ${new Date(data.exportDate).toLocaleString()}

`

    const fullContent = header + showdownFormat

    const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8;' })
    this.downloadFile(blob, `${this.sanitizeFilename(data.teamName)}_showdown.txt`)
  }

  /**
   * Export team as Markdown format
   */
  static exportAsMarkdown(data: TeamExport): void {
    const header = `# ${data.teamName}

${data.draftName ? `**Draft:** ${data.draftName}\n` : ''}**Format:** ${data.formatId || 'Custom'}
**Total Cost:** ${data.totalCost} points
**Budget Remaining:** ${data.budgetRemaining} points
**Exported:** ${new Date(data.exportDate).toLocaleString()}

---

## Team Roster (${data.pokemon.length} Pokémon)

`

    const pokemonList = data.pokemon.map((p, idx) => {
      return `### ${idx + 1}. ${p.name} (#${p.id})

**Types:** ${p.types.map(t => t.name).join(', ')}
**Abilities:** ${p.abilities.join(', ')}
**Cost:** ${p.cost} points

**Stats:**
- HP: ${p.stats.hp}
- Attack: ${p.stats.attack}
- Defense: ${p.stats.defense}
- Special Attack: ${p.stats.specialAttack}
- Special Defense: ${p.stats.specialDefense}
- Speed: ${p.stats.speed}
- **Total:** ${p.stats.total}

${p.moves && p.moves.length > 0 ? `**Notable Moves:** ${p.moves.slice(0, 4).map(m => m.name).join(', ')}\n` : ''}
---
`
    }).join('\n')

    const summary = `
## Team Summary

**Total Base Stat Total:** ${data.pokemon.reduce((sum, p) => sum + p.stats.total, 0)}
**Average BST:** ${Math.round(data.pokemon.reduce((sum, p) => sum + p.stats.total, 0) / data.pokemon.length)}
**Average Cost:** ${Math.round(data.totalCost / data.pokemon.length * 10) / 10}

**Type Distribution:**
${this.getTypeDistribution(data.pokemon)}
`

    const fullContent = header + pokemonList + summary

    const blob = new Blob([fullContent], { type: 'text/markdown;charset=utf-8;' })
    this.downloadFile(blob, `${this.sanitizeFilename(data.teamName)}_team.md`)
  }

  /**
   * Export team as HTML format (printable)
   */
  static exportAsHTML(data: TeamExport): void {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.teamName} - Pokémon Draft Team</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0 0 10px 0;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
      opacity: 0.9;
    }
    .pokemon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    .pokemon-card {
      background: white;
      border-radius: 10px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .pokemon-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .pokemon-name {
      font-size: 1.5em;
      font-weight: bold;
      margin: 0;
    }
    .cost-badge {
      background: #667eea;
      color: white;
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
    }
    .types {
      display: flex;
      gap: 5px;
      margin-bottom: 15px;
    }
    .type-badge {
      padding: 5px 12px;
      border-radius: 5px;
      color: white;
      font-size: 0.9em;
      font-weight: bold;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 15px;
    }
    .stat {
      text-align: center;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 5px;
    }
    .stat-label {
      font-size: 0.8em;
      color: #666;
      margin-bottom: 5px;
    }
    .stat-value {
      font-size: 1.3em;
      font-weight: bold;
      color: #333;
    }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    @media print {
      body {
        background: white;
      }
      .pokemon-card {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${data.teamName}</h1>
    <div class="meta">
      ${data.draftName ? `<div><strong>Draft:</strong> ${data.draftName}</div>` : ''}
      <div><strong>Format:</strong> ${data.formatId || 'Custom'}</div>
      <div><strong>Total Cost:</strong> ${data.totalCost} points</div>
      <div><strong>Budget Remaining:</strong> ${data.budgetRemaining} points</div>
      <div><strong>Exported:</strong> ${new Date(data.exportDate).toLocaleString()}</div>
    </div>
  </div>

  <div class="pokemon-grid">
    ${data.pokemon.map(p => `
      <div class="pokemon-card">
        <div class="pokemon-header">
          <h2 class="pokemon-name">${p.name}</h2>
          <span class="cost-badge">${p.cost} pts</span>
        </div>
        <div class="types">
          ${p.types.map(t => `
            <span class="type-badge" style="background-color: ${t.color}">${t.name}</span>
          `).join('')}
        </div>
        <div>
          <strong>Abilities:</strong> ${p.abilities.join(', ')}
        </div>
        <div class="stats-grid">
          <div class="stat">
            <div class="stat-label">HP</div>
            <div class="stat-value">${p.stats.hp}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Attack</div>
            <div class="stat-value">${p.stats.attack}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Defense</div>
            <div class="stat-value">${p.stats.defense}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Sp. Atk</div>
            <div class="stat-value">${p.stats.specialAttack}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Sp. Def</div>
            <div class="stat-value">${p.stats.specialDefense}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Speed</div>
            <div class="stat-value">${p.stats.speed}</div>
          </div>
        </div>
        <div class="stat" style="margin-top: 10px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
          <div class="stat-label" style="color: rgba(255,255,255,0.8)">Base Stat Total</div>
          <div class="stat-value" style="color: white;">${p.stats.total}</div>
        </div>
      </div>
    `).join('')}
  </div>

  <div class="summary">
    <h2>Team Summary</h2>
    <ul>
      <li><strong>Total Pokémon:</strong> ${data.pokemon.length}</li>
      <li><strong>Total Base Stat Total:</strong> ${data.pokemon.reduce((sum, p) => sum + p.stats.total, 0)}</li>
      <li><strong>Average BST:</strong> ${Math.round(data.pokemon.reduce((sum, p) => sum + p.stats.total, 0) / data.pokemon.length)}</li>
      <li><strong>Average Cost:</strong> ${Math.round(data.totalCost / data.pokemon.length * 10) / 10} points</li>
    </ul>
  </div>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
    this.downloadFile(blob, `${this.sanitizeFilename(data.teamName)}_team.html`)
  }

  /**
   * Copy team to clipboard as text
   */
  static async copyToClipboard(data: TeamExport): Promise<void> {
    const text = `${data.teamName}
Format: ${data.formatId || 'Custom'}
Cost: ${data.totalCost} points

${data.pokemon.map((p, idx) => `${idx + 1}. ${p.name} (#${p.id}) - ${p.cost} pts - ${p.types.map(t => t.name).join('/')}`).join('\n')}`

    await navigator.clipboard.writeText(text)
  }

  /**
   * Helper: Download file
   */
  private static downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * Helper: Sanitize filename
   */
  private static sanitizeFilename(name: string): string {
    return name
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/_+/g, '_')
      .toLowerCase()
  }

  /**
   * Helper: Get type distribution
   */
  private static getTypeDistribution(pokemon: Pokemon[]): string {
    const typeCounts: Record<string, number> = {}

    pokemon.forEach(p => {
      p.types.forEach(t => {
        typeCounts[t.name] = (typeCounts[t.name] || 0) + 1
      })
    })

    return Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `- ${type}: ${count}`)
      .join('\n')
  }
}
