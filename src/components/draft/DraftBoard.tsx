'use client'

/**
 * DraftBoard — visual round-by-round grid of every pick.
 *
 * Rows = teams in draft order (top → bottom).
 * Cols = rounds (left → right). Empty slots show pick number; filled
 * slots show the Pokémon sprite + name.
 *
 * Designed to feel like an NBA-broadcast big board: scannable in a
 * glance, color-coded by team, with the "live" cell highlighted.
 */

import { useMemo } from 'react'
import Image from 'next/image'
import { Pokemon } from '@/types'
import { getTeamColor } from '@/lib/team-colors'
import { getPokemonSpriteUrl } from '@/utils/pokemon'
import { cn } from '@/lib/utils'

interface TeamShape {
  id: string
  name: string
  draftOrder: number
  picks: string[]
}

interface DraftBoardProps {
  teams: TeamShape[]
  pokemon: Pokemon[]
  currentTurn: number
  maxRounds: number
  userTeamId?: string | null
  draftStatus: 'waiting' | 'drafting' | 'completed' | 'paused'
  className?: string
}

function snakeOrder(totalTeams: number, maxRounds: number): number[] {
  const order: number[] = []
  for (let r = 0; r < maxRounds; r++) {
    if (r % 2 === 0) for (let i = 1; i <= totalTeams; i++) order.push(i)
    else for (let i = totalTeams; i >= 1; i--) order.push(i)
  }
  return order
}

export function DraftBoard({
  teams,
  pokemon,
  currentTurn,
  maxRounds,
  userTeamId,
  draftStatus,
  className,
}: DraftBoardProps) {
  const totalTeams = teams.length
  const sorted = useMemo(
    () => [...teams].sort((a, b) => a.draftOrder - b.draftOrder),
    [teams]
  )

  const order = useMemo(
    () => snakeOrder(totalTeams, Math.max(maxRounds, 1)),
    [totalTeams, maxRounds]
  )

  const pokeMap = useMemo(() => {
    const m = new Map<string, Pokemon>()
    pokemon.forEach(p => m.set(p.id, p))
    return m
  }, [pokemon])

  // Build a 2D map: [teamDraftOrder][round] = { pickNumber, pokemonId? }
  const grid = useMemo(() => {
    const g: Array<
      Array<{ pickNumber: number; pokemonId?: string; isCurrent: boolean }>
    > = Array.from({ length: totalTeams }, () =>
      Array.from({ length: maxRounds }, () => ({ pickNumber: 0, isCurrent: false }))
    )
    for (let t = 0; t < order.length; t++) {
      const turn = t + 1
      const teamDraftOrder = order[t]
      const round = Math.floor(t / Math.max(totalTeams, 1))
      const teamRow = teamDraftOrder - 1
      if (teamRow < 0 || teamRow >= totalTeams) continue
      if (round >= maxRounds) continue
      const team = sorted[teamRow]
      const pid = team?.picks?.[round]
      g[teamRow][round] = {
        pickNumber: turn,
        pokemonId: pid,
        isCurrent: draftStatus === 'drafting' && turn === currentTurn,
      }
    }
    return g
  }, [order, totalTeams, maxRounds, sorted, currentTurn, draftStatus])

  if (totalTeams === 0) return null

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground/80">
          Draft Board
        </h3>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {maxRounds} {maxRounds === 1 ? 'Round' : 'Rounds'} · {totalTeams} Teams
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card/60 shadow-inner">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted/60">
              <th className="sticky left-0 z-10 bg-muted/80 backdrop-blur-sm px-2.5 py-2 text-left text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold border-r border-border">
                Team
              </th>
              {Array.from({ length: maxRounds }).map((_, r) => (
                <th
                  key={r}
                  className="px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold whitespace-nowrap border-l border-border first:border-l-0"
                >
                  R{r + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, idx) => {
              const c = getTeamColor(team)
              const isUser = team.id === userTeamId
              return (
                <tr key={team.id} className="border-t border-border">
                  <th
                    scope="row"
                    className={cn(
                      'sticky left-0 z-10 px-2.5 py-2 text-left whitespace-nowrap border-r border-border',
                      'backdrop-blur-sm'
                    )}
                    style={{
                      background: `linear-gradient(90deg, rgb(${c.rgb} / 0.18) 0%, rgb(${c.rgb} / 0.05) 100%)`,
                      boxShadow: `inset 4px 0 0 0 ${c.base}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-black"
                        style={{ background: c.base, color: c.fg }}
                      >
                        {team.draftOrder}
                      </span>
                      <span
                        className={cn(
                          'font-semibold truncate max-w-[140px]',
                          isUser && 'underline underline-offset-4 decoration-dotted'
                        )}
                      >
                        {team.name}
                      </span>
                    </div>
                  </th>
                  {grid[idx].map((cell, r) => {
                    const p = cell.pokemonId ? pokeMap.get(cell.pokemonId) : undefined
                    return (
                      <td
                        key={r}
                        className={cn(
                          'border-l border-border first:border-l-0 align-middle',
                          'transition-colors',
                          cell.isCurrent
                            ? 'bg-primary/10 ring-2 ring-primary/60'
                            : cell.pokemonId
                            ? ''
                            : 'bg-muted/20'
                        )}
                        style={
                          cell.pokemonId
                            ? { background: `rgb(${c.rgb} / 0.08)` }
                            : undefined
                        }
                      >
                        {cell.pokemonId ? (
                          <div className="flex items-center gap-1.5 px-1.5 py-1 min-w-[112px]">
                            <Image
                              src={getPokemonSpriteUrl(cell.pokemonId)}
                              alt={p?.name ?? cell.pokemonId}
                              width={32}
                              height={32}
                              unoptimized
                              className="h-7 w-7 object-contain shrink-0"
                            />
                            <div className="min-w-0 leading-tight">
                              <div className="font-mono text-[9px] text-muted-foreground">
                                #{cell.pickNumber}
                              </div>
                              <div className="font-semibold truncate text-[11px] capitalize">
                                {p?.name ?? cell.pokemonId}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center min-h-[42px] min-w-[68px] px-1.5">
                            <div
                              className={cn(
                                'font-mono text-[10px]',
                                cell.isCurrent
                                  ? 'text-primary font-bold animate-pulse'
                                  : 'text-muted-foreground/60'
                              )}
                            >
                              {cell.isCurrent ? 'NOW' : `#${cell.pickNumber}`}
                            </div>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default DraftBoard
