'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Shield, Swords, TrendingUp, TrendingDown } from 'lucide-react'
import { Pokemon } from '@/types'

interface TeamCoverageAnalysisProps {
  team: Pokemon[]
  className?: string
}

// Type effectiveness chart
const TYPE_CHART: Record<string, { weakTo: string[]; resistantTo: string[]; immuneTo: string[] }> = {
  normal: { weakTo: ['fighting'], resistantTo: [], immuneTo: ['ghost'] },
  fire: { weakTo: ['water', 'ground', 'rock'], resistantTo: ['fire', 'grass', 'ice', 'bug', 'steel', 'fairy'], immuneTo: [] },
  water: { weakTo: ['electric', 'grass'], resistantTo: ['fire', 'water', 'ice', 'steel'], immuneTo: [] },
  electric: { weakTo: ['ground'], resistantTo: ['electric', 'flying', 'steel'], immuneTo: [] },
  grass: { weakTo: ['fire', 'ice', 'poison', 'flying', 'bug'], resistantTo: ['water', 'electric', 'grass', 'ground'], immuneTo: [] },
  ice: { weakTo: ['fire', 'fighting', 'rock', 'steel'], resistantTo: ['ice'], immuneTo: [] },
  fighting: { weakTo: ['flying', 'psychic', 'fairy'], resistantTo: ['bug', 'rock', 'dark'], immuneTo: [] },
  poison: { weakTo: ['ground', 'psychic'], resistantTo: ['grass', 'fighting', 'poison', 'bug', 'fairy'], immuneTo: [] },
  ground: { weakTo: ['water', 'grass', 'ice'], resistantTo: ['poison', 'rock'], immuneTo: ['electric'] },
  flying: { weakTo: ['electric', 'ice', 'rock'], resistantTo: ['grass', 'fighting', 'bug'], immuneTo: ['ground'] },
  psychic: { weakTo: ['bug', 'ghost', 'dark'], resistantTo: ['fighting', 'psychic'], immuneTo: [] },
  bug: { weakTo: ['fire', 'flying', 'rock'], resistantTo: ['grass', 'fighting', 'ground'], immuneTo: [] },
  rock: { weakTo: ['water', 'grass', 'fighting', 'ground', 'steel'], resistantTo: ['normal', 'fire', 'poison', 'flying'], immuneTo: [] },
  ghost: { weakTo: ['ghost', 'dark'], resistantTo: ['poison', 'bug'], immuneTo: ['normal', 'fighting'] },
  dragon: { weakTo: ['ice', 'dragon', 'fairy'], resistantTo: ['fire', 'water', 'electric', 'grass'], immuneTo: [] },
  dark: { weakTo: ['fighting', 'bug', 'fairy'], resistantTo: ['ghost', 'dark'], immuneTo: ['psychic'] },
  steel: { weakTo: ['fire', 'fighting', 'ground'], resistantTo: ['normal', 'grass', 'ice', 'flying', 'psychic', 'bug', 'rock', 'dragon', 'steel', 'fairy'], immuneTo: ['poison'] },
  fairy: { weakTo: ['poison', 'steel'], resistantTo: ['fighting', 'bug', 'dark'], immuneTo: ['dragon'] }
}

const ALL_TYPES = Object.keys(TYPE_CHART)

export default function TeamCoverageAnalysis({ team, className }: TeamCoverageAnalysisProps) {
  const analysis = useMemo(() => {
    if (!team || team.length === 0) {
      return {
        offensiveCoverage: {},
        defensiveWeaknesses: {},
        defensiveResistances: {},
        typeDistribution: {},
        coverageScore: 0,
        weaknessScore: 0
      }
    }

    // Offensive coverage - which types can we hit super effectively?
    const offensiveCoverage: Record<string, number> = {}
    team.forEach(pokemon => {
      pokemon.types.forEach(type => {
        // Check what this type is super effective against
        ALL_TYPES.forEach(defType => {
          const typeData = TYPE_CHART[defType]
          if (typeData?.weakTo.includes(type.name)) {
            offensiveCoverage[defType] = (offensiveCoverage[defType] || 0) + 1
          }
        })
      })
    })

    // Defensive analysis - count weaknesses and resistances
    const defensiveWeaknesses: Record<string, number> = {}
    const defensiveResistances: Record<string, number> = {}

    team.forEach(pokemon => {
      const typeNames = pokemon.types.map(t => t.name)

      // For dual types, calculate combined effectiveness
      ALL_TYPES.forEach(attackType => {
        let effectiveness = 1

        typeNames.forEach(defType => {
          const typeData = TYPE_CHART[defType]
          if (typeData?.weakTo.includes(attackType)) effectiveness *= 2
          if (typeData?.resistantTo.includes(attackType)) effectiveness *= 0.5
          if (typeData?.immuneTo.includes(attackType)) effectiveness *= 0
        })

        if (effectiveness > 1) {
          defensiveWeaknesses[attackType] = (defensiveWeaknesses[attackType] || 0) + 1
        } else if (effectiveness < 1) {
          defensiveResistances[attackType] = (defensiveResistances[attackType] || 0) + 1
        }
      })
    })

    // Type distribution
    const typeDistribution: Record<string, number> = {}
    team.forEach(pokemon => {
      pokemon.types.forEach(type => {
        typeDistribution[type.name] = (typeDistribution[type.name] || 0) + 1
      })
    })

    // Coverage score (how many types we can hit super effectively)
    const coverageScore = Math.round((Object.keys(offensiveCoverage).length / ALL_TYPES.length) * 100)

    // Weakness score (lower is better - fewer common weaknesses)
    const avgWeaknessCount = Object.values(defensiveWeaknesses).reduce((a, b) => a + b, 0) / team.length
    const weaknessScore = Math.max(0, 100 - Math.round(avgWeaknessCount * 20))

    return {
      offensiveCoverage,
      defensiveWeaknesses,
      defensiveResistances,
      typeDistribution,
      coverageScore,
      weaknessScore
    }
  }, [team])

  if (!team || team.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Team Coverage Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Draft Pokémon to see coverage analysis
          </p>
        </CardContent>
      </Card>
    )
  }

  // Get top 5 weaknesses and resistances
  const topWeaknesses = Object.entries(analysis.defensiveWeaknesses)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  const topResistances = Object.entries(analysis.defensiveResistances)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)

  const uncoveredTypes = ALL_TYPES.filter(type => !analysis.offensiveCoverage[type])

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Team Coverage Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Scores */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1">
                <Swords className="h-4 w-4" />
                Offensive Coverage
              </span>
              <span className="font-semibold">{analysis.coverageScore}%</span>
            </div>
            <Progress value={analysis.coverageScore} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1">
                <Shield className="h-4 w-4" />
                Defensive Balance
              </span>
              <span className="font-semibold">{analysis.weaknessScore}%</span>
            </div>
            <Progress value={analysis.weaknessScore} className="h-2" />
          </div>
        </div>

        {/* Weaknesses */}
        {topWeaknesses.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span>Common Weaknesses</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {topWeaknesses.map(([type, count]) => (
                <Badge key={type} variant="destructive" className="capitalize">
                  {type} ({count})
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Resistances */}
        {topResistances.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span>Common Resistances</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {topResistances.map(([type, count]) => (
                <Badge key={type} variant="secondary" className="capitalize bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  {type} ({count})
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Uncovered Types */}
        {uncoveredTypes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Swords className="h-4 w-4 text-orange-500" />
              <span>Missing Coverage ({uncoveredTypes.length} types)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {uncoveredTypes.slice(0, 8).map((type) => (
                <Badge key={type} variant="outline" className="capitalize text-xs">
                  {type}
                </Badge>
              ))}
              {uncoveredTypes.length > 8 && (
                <Badge variant="outline" className="text-xs">
                  +{uncoveredTypes.length - 8} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {uncoveredTypes.length > 0 && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-900 dark:text-blue-100">
              <strong>Tip:</strong> Consider adding Pokémon with {uncoveredTypes.slice(0, 3).join(', ')}-type moves to improve coverage
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
