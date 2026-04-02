'use client'

import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  type PokemonTypeName,
  TYPE_CHART,
  getTypeEffectiveness,
} from '@/utils/type-effectiveness'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TypeCoverageOverlayProps {
  /** Each inner array holds the type names of one team Pokemon, e.g. [['fire','flying'], ['water']] */
  teamPokemonTypes: string[][]
  /** Compact sidebar mode vs. expanded modal mode */
  mode?: 'compact' | 'expanded'
  className?: string
}

interface TypeCoverageCell {
  type: PokemonTypeName
  offensiveCoverage: number   // how many team Pokemon can hit this type super-effectively
  defensiveWeakness: number   // how many team Pokemon are weak to this type
  status: 'covered' | 'neutral' | 'uncovered'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_TYPES: PokemonTypeName[] = Object.keys(TYPE_CHART) as PokemonTypeName[]

const TYPE_DISPLAY_COLORS: Record<PokemonTypeName, string> = {
  normal: 'bg-stone-400 dark:bg-stone-500',
  fire: 'bg-orange-500',
  water: 'bg-blue-500',
  electric: 'bg-yellow-400',
  grass: 'bg-green-500',
  ice: 'bg-cyan-300 dark:bg-cyan-400',
  fighting: 'bg-red-700',
  poison: 'bg-purple-500',
  ground: 'bg-amber-600',
  flying: 'bg-indigo-300 dark:bg-indigo-400',
  psychic: 'bg-pink-500',
  bug: 'bg-lime-500',
  rock: 'bg-yellow-700',
  ghost: 'bg-purple-700',
  dragon: 'bg-violet-600',
  dark: 'bg-gray-700 dark:bg-gray-600',
  steel: 'bg-gray-400 dark:bg-gray-500',
  fairy: 'bg-pink-300 dark:bg-pink-400',
}

// ─── Coverage Calculation ─────────────────────────────────────────────────────

function computeCoverage(teamPokemonTypes: string[][]): TypeCoverageCell[] {
  return ALL_TYPES.map(targetType => {
    let offensiveCoverage = 0
    let defensiveWeakness = 0

    for (const pokemonTypes of teamPokemonTypes) {
      const normalized = pokemonTypes.map(t => t.toLowerCase() as PokemonTypeName)

      // Offensive: can this Pokemon hit targetType super-effectively?
      const canHitSE = normalized.some(
        ownType => getTypeEffectiveness(ownType, [targetType]) >= 2
      )
      if (canHitSE) offensiveCoverage++

      // Defensive: is this Pokemon weak to targetType?
      const effectiveness = getTypeEffectiveness(targetType, normalized)
      if (effectiveness >= 2) defensiveWeakness++
    }

    let status: TypeCoverageCell['status']
    if (offensiveCoverage >= 1) {
      status = 'covered'
    } else if (teamPokemonTypes.length === 0) {
      status = 'neutral'
    } else {
      status = 'uncovered'
    }

    return {
      type: targetType,
      offensiveCoverage,
      defensiveWeakness,
      status,
    }
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export const TypeCoverageOverlay = memo<TypeCoverageOverlayProps>(
  function TypeCoverageOverlay({ teamPokemonTypes, mode = 'compact', className }) {
    const coverage = useMemo(
      () => computeCoverage(teamPokemonTypes),
      [teamPokemonTypes]
    )

    const uncoveredCount = coverage.filter(c => c.status === 'uncovered').length
    const coveredCount = coverage.filter(c => c.status === 'covered').length

    if (mode === 'compact') {
      return (
        <div className={cn('space-y-2', className)}>
          {/* Summary line */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Type Coverage</span>
            <span>
              <span className="text-emerald-400">{coveredCount}</span>
              {' / '}
              {ALL_TYPES.length}
              {uncoveredCount > 0 && (
                <span className="text-red-400 ml-1">({uncoveredCount} gaps)</span>
              )}
            </span>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-6 gap-1">
            {coverage.map(cell => (
              <TypeCell key={cell.type} cell={cell} compact />
            ))}
          </div>
        </div>
      )
    }

    // Expanded mode
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Team Type Coverage</h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              Covered ({coveredCount})
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              Uncovered ({uncoveredCount})
            </span>
          </div>
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
          {coverage.map(cell => (
            <TypeCell key={cell.type} cell={cell} compact={false} />
          ))}
        </div>

        {/* Weakness summary */}
        {teamPokemonTypes.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Shared Weaknesses:</p>
            <div className="flex flex-wrap gap-1">
              {coverage
                .filter(c => c.defensiveWeakness >= 2)
                .sort((a, b) => b.defensiveWeakness - a.defensiveWeakness)
                .map(c => (
                  <span
                    key={c.type}
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                      'bg-red-500/10 text-red-400 border border-red-500/20'
                    )}
                  >
                    {capitalize(c.type)}
                    <span className="text-red-300/60">x{c.defensiveWeakness}</span>
                  </span>
                ))}
              {coverage.filter(c => c.defensiveWeakness >= 2).length === 0 && (
                <span className="text-emerald-400">No shared weaknesses</span>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }
)

// ─── Sub-components ───────────────────────────────────────────────────────────

const TypeCell = memo<{ cell: TypeCoverageCell; compact: boolean }>(
  function TypeCell({ cell, compact }) {
    const borderColor =
      cell.status === 'covered'
        ? 'ring-1 ring-emerald-500/50'
        : cell.status === 'uncovered'
          ? 'ring-1 ring-red-500/50'
          : 'ring-1 ring-gray-500/20'

    const bgOverlay =
      cell.status === 'covered'
        ? 'after:absolute after:inset-0 after:bg-emerald-500/10 after:rounded'
        : cell.status === 'uncovered'
          ? 'after:absolute after:inset-0 after:bg-red-500/10 after:rounded'
          : ''

    return (
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded',
          compact ? 'py-1' : 'py-1.5',
          borderColor,
          bgOverlay
        )}
        title={`${capitalize(cell.type)}: ${cell.offensiveCoverage} Pokemon can hit SE, ${cell.defensiveWeakness} weak`}
      >
        <span
          className={cn(
            'relative z-10 inline-block rounded-sm text-white text-[9px] font-bold uppercase leading-none tracking-wide px-1 py-0.5',
            TYPE_DISPLAY_COLORS[cell.type]
          )}
        >
          {compact ? cell.type.slice(0, 3) : cell.type.slice(0, 4)}
        </span>
        {!compact && (
          <span className="relative z-10 text-[9px] text-muted-foreground mt-0.5 tabular-nums">
            {cell.offensiveCoverage > 0 ? `${cell.offensiveCoverage}x` : '—'}
          </span>
        )}
      </div>
    )
  }
)

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
