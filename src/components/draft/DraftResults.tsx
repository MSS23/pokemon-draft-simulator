'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Trophy,
  Target,
  Users,
  Clock,
  BarChart3,
  Download,
  Share2,
  Camera,
  Play,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, formatPokemonName } from '@/utils/pokemon'
import { TEAM_COLORS, buildTeamColorMap } from '@/utils/team-colors'
import { PokeballIcon } from '@/components/ui/pokeball-icon'
import TournamentSchedule from '@/components/tournament/TournamentSchedule'
import { ShareableRecapCard } from './ShareableRecapCard'
import { DraftReplay } from './DraftReplay'
import { DraftRecapAnimation } from './DraftRecapAnimation'
import { PokePasteExport } from '@/components/pokemon/PokePasteExport'

interface Team {
  id: string
  name: string
  userName: string
  draftOrder: number
  picks: string[]
  budgetRemaining?: number
}

interface Pick {
  id: string
  team_id: string
  pokemon_id: string
  pokemon_name: string
  cost: number
  pick_order: number
  round: number
  created_at: string
}

interface DraftResultsProps {
  draftName: string
  teams: Team[]
  picks: Pick[]
  draftSettings: {
    maxTeams: number
    pokemonPerTeam: number
    draftType: 'tiered' | 'points' | 'auction'
    timeLimit: number
    budgetPerTeam?: number
  }
  startTime: string
  endTime: string
  onShare?: () => void
  onExport?: () => void
}

function PokemonSprite({ pokemonId, pokemonName, size = 'md' }: {
  pokemonId: string
  pokemonName: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-20 h-20'
  }

  return (
    <div className={cn('flex-shrink-0 flex items-center justify-center', sizeClasses[size])}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getPokemonAnimatedUrl(pokemonId, pokemonName)}
        alt={pokemonName}
        className={cn('pixelated', sizeClasses[size])}
        loading="lazy"
        onError={(e) => {
          const target = e.target as HTMLImageElement
          if (!target.dataset.fallback) {
            target.dataset.fallback = '1'
            target.src = getPokemonAnimatedBackupUrl(pokemonId)
          }
        }}
      />
    </div>
  )
}

export default function DraftResults({
  draftName,
  teams,
  picks,
  draftSettings,
  startTime,
  endTime,
  onShare,
  onExport
}: DraftResultsProps) {
  const [activeTab, setActiveTab] = useState('recap')
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [showRecapAnimation, setShowRecapAnimation] = useState(false)

  const teamColorMap = useMemo(() => {
    const teamIds = teams
      .sort((a, b) => a.draftOrder - b.draftOrder)
      .map(t => t.id)
    return buildTeamColorMap(teamIds)
  }, [teams])

  const analytics = useMemo(() => {
    const totalPicks = picks.length
    const draftDuration = Math.round(
      (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000 / 60
    )

    const teamStats = teams.map(team => {
      const teamPicks = picks.filter(p => p.team_id === team.id)
      const totalCost = teamPicks.reduce((sum, pick) => sum + pick.cost, 0)
      return {
        ...team,
        totalCost,
        pickCount: teamPicks.length,
        picks: teamPicks.sort((a, b) => a.pick_order - b.pick_order)
      }
    })

    const picksByRound = picks.reduce((acc, pick) => {
      if (!acc[pick.round]) acc[pick.round] = []
      acc[pick.round].push(pick)
      return acc
    }, {} as Record<number, Pick[]>)

    return { totalPicks, draftDuration, teamStats, picksByRound }
  }, [teams, picks, startTime, endTime])

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Trophy className="h-8 w-8 text-yellow-600" />
            <CardTitle className="text-3xl bg-gradient-to-r from-yellow-600 via-orange-500 to-red-500 bg-clip-text text-transparent">
              Draft Complete!
            </CardTitle>
          </div>
          <CardDescription className="text-lg font-medium text-slate-700 dark:text-slate-300">
            {draftName}
          </CardDescription>

          <div className="flex flex-wrap justify-center gap-4 mt-4">
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {teams.length} Teams
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Target className="h-4 w-4" />
              {analytics.totalPicks} Picks
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {analytics.draftDuration}m Duration
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1 capitalize">
              <BarChart3 className="h-4 w-4" />
              {draftSettings.draftType} Draft
            </Badge>
          </div>

          <div className="flex justify-center gap-2 mt-4">
            {onShare && (
              <Button variant="outline" onClick={onShare}>
                <Share2 className="h-4 w-4 mr-2" />
                Share Results
              </Button>
            )}
            {onExport && (
              <Button variant="outline" onClick={onExport}>
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowRecapAnimation(true)}>
              <Play className="h-4 w-4 mr-2" />
              Play Recap
            </Button>
            <Button variant="outline" onClick={() => setActiveTab('sharecard')}>
              <Camera className="h-4 w-4 mr-2" />
              Share Card
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="w-full">
        <div className="grid w-full grid-cols-5 mb-6 gap-1">
          {[
            { id: 'recap', label: 'Draft Recap' },
            { id: 'replay', label: 'Replay' },
            { id: 'rosters', label: 'Team Rosters' },
            { id: 'tournament', label: 'Tournament' },
            { id: 'sharecard', label: 'Share Card' },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "outline"}
              className="text-xs sm:text-sm"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Draft Recap - Round by Round Timeline */}
        {activeTab === 'recap' && (
          <div className="space-y-6">
            {Object.entries(analytics.picksByRound)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([roundNum, roundPicks]) => (
                <div key={roundNum}>
                  {/* Round Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-px flex-1 bg-border" />
                    <Badge variant="secondary" className="text-sm font-semibold px-4 py-1">
                      Round {roundNum}
                    </Badge>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  {/* Picks in this round */}
                  <div className="space-y-2">
                    {roundPicks
                      .sort((a, b) => a.pick_order - b.pick_order)
                      .map((pick) => {
                        const team = teams.find(t => t.id === pick.team_id)
                        const colors = teamColorMap.get(pick.team_id) || TEAM_COLORS[0]

                        return (
                          <div
                            key={pick.id}
                            className={cn(
                              'flex items-center gap-3 p-3 rounded-lg border-l-[3px] transition-colors',
                              colors.border,
                              colors.bg
                            )}
                          >
                            {/* Pick number */}
                            <Badge variant="outline" className="min-w-[48px] justify-center text-xs">
                              #{pick.pick_order}
                            </Badge>

                            {/* Animated sprite */}
                            <PokemonSprite
                              pokemonId={pick.pokemon_id}
                              pokemonName={pick.pokemon_name}
                              size="md"
                            />

                            {/* Pokemon info */}
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm">
                                {formatPokemonName(pick.pokemon_name)}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={cn('text-xs font-medium', colors.text)}>
                                  {team?.name}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {team?.userName}
                                </span>
                              </div>
                            </div>

                            {/* Cost */}
                            <Badge className={cn(
                              'text-xs',
                              pick.cost >= 20 ? 'bg-purple-500 hover:bg-purple-600' :
                              pick.cost >= 15 ? 'bg-blue-500 hover:bg-blue-600' :
                              pick.cost >= 10 ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-500 hover:bg-gray-600'
                            )}>
                              {pick.cost} pts
                            </Badge>
                          </div>
                        )
                      })
                    }
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* Draft Replay */}
        {activeTab === 'replay' && (
          <DraftReplay
            picks={picks.map(p => {
              const team = teams.find(t => t.id === p.team_id)
              return {
                id: p.id,
                team_id: p.team_id,
                team_name: team?.name || 'Unknown',
                user_name: team?.userName || 'Unknown',
                pokemon_id: p.pokemon_id,
                pokemon_name: p.pokemon_name,
                cost: p.cost,
                pick_order: p.pick_order,
                round: p.round
              }
            })}
            teams={teams}
            draftName={draftName}
          />
        )}

        {/* Team Rosters */}
        {activeTab === 'rosters' && (
          <div className="space-y-4">
            {analytics.teamStats
              .sort((a, b) => a.draftOrder - b.draftOrder)
              .map((team) => {
                const colors = teamColorMap.get(team.id) || TEAM_COLORS[0]
                const isExpanded = expandedTeam === team.id

                return (
                  <Card
                    key={team.id}
                    className={cn('border-l-4 transition-all duration-200', colors.border)}
                  >
                    <CardHeader
                      className="pb-3 cursor-pointer"
                      onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <PokeballIcon size="sm" color={colors.hex} />
                          <div>
                            <CardTitle className="text-lg">{team.name}</CardTitle>
                            <CardDescription>{team.userName}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="font-bold text-lg">{team.totalCost} pts</div>
                            <div className="text-xs text-muted-foreground">
                              {team.pickCount} picks
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    {/* Always show compact roster */}
                    <CardContent className="pt-0">
                      {!isExpanded ? (
                        <div className="flex flex-wrap gap-2">
                          {team.picks.map((pick) => (
                            <div
                              key={pick.id}
                              className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1"
                            >
                              <PokemonSprite
                                pokemonId={pick.pokemon_id}
                                pokemonName={pick.pokemon_name}
                                size="sm"
                              />
                              <span className="text-xs font-medium">
                                {formatPokemonName(pick.pokemon_name)}
                              </span>
                              <Badge variant="secondary" size="sm" className="h-4 px-1">
                                {pick.cost}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {team.picks.map((pick, idx) => (
                            <div
                              key={pick.id}
                              className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg"
                            >
                              <span className="text-xs text-muted-foreground w-6 text-center">
                                #{idx + 1}
                              </span>
                              <PokemonSprite
                                pokemonId={pick.pokemon_id}
                                pokemonName={pick.pokemon_name}
                                size="md"
                              />
                              <div className="flex-1">
                                <div className="font-medium text-sm">
                                  {formatPokemonName(pick.pokemon_name)}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  Pick #{pick.pick_order} · Round {pick.round}
                                </div>
                              </div>
                              <Badge className={cn(
                                'text-xs',
                                pick.cost >= 20 ? 'bg-purple-500 hover:bg-purple-600' :
                                pick.cost >= 15 ? 'bg-blue-500 hover:bg-blue-600' :
                                pick.cost >= 10 ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-500 hover:bg-gray-600'
                              )}>
                                {pick.cost} pts
                              </Badge>
                            </div>
                          ))}
                          <div className="pt-2 border-t flex justify-between text-sm text-muted-foreground">
                            <span>Total Investment</span>
                            <span className="font-semibold text-foreground">{team.totalCost} pts</span>
                          </div>
                          {team.budgetRemaining !== undefined && (
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>Budget Remaining</span>
                              <span className="font-semibold text-foreground">{team.budgetRemaining} pts</span>
                            </div>
                          )}
                          <div className="pt-2">
                            <PokePasteExport
                              teamName={team.name}
                              pokemon={team.picks.map(p => ({
                                name: p.pokemon_name,
                                pokemonId: p.pokemon_id,
                              }))}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })
            }
          </div>
        )}

        {/* Tournament */}
        {activeTab === 'tournament' && (
          <TournamentSchedule
            teams={teams.map(team => ({
              id: team.id,
              name: team.name,
              userName: team.userName
            }))}
          />
        )}

        {/* Share Card */}
        {activeTab === 'sharecard' && (
          <div className="space-y-6">
            <p className="text-center text-sm text-muted-foreground">
              Screenshot this card and share it on social media!
            </p>
            {analytics.teamStats.map((team) => (
              <ShareableRecapCard
                key={team.id}
                teamName={team.name}
                userName={team.userName}
                draftName={draftName}
                pokemon={team.picks.map(p => ({
                  id: p.pokemon_id,
                  name: p.pokemon_name,
                  cost: p.cost
                }))}
                totalCost={team.totalCost}
                budgetRemaining={team.budgetRemaining}
              />
            ))}
          </div>
        )}
      </div>

      {showRecapAnimation && (
        <DraftRecapAnimation
          picks={picks.map(p => {
            const team = teams.find(t => t.id === p.team_id)
            return {
              id: p.id,
              team_id: p.team_id,
              team_name: team?.name || 'Unknown',
              user_name: team?.userName || 'Unknown',
              pokemon_id: p.pokemon_id,
              pokemon_name: p.pokemon_name,
              cost: p.cost,
              pick_order: p.pick_order,
              round: p.round
            }
          })}
          teams={teams}
          draftName={draftName}
          onClose={() => setShowRecapAnimation(false)}
        />
      )}
    </div>
  )
}
