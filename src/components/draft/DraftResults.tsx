'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Trophy,
  Target,
  TrendingUp,
  BarChart3,
  PieChart,
  Users,
  Clock,
  Star,
  Award,
  Download,
  Share2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import TournamentSchedule from '@/components/tournament/TournamentSchedule'

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
    draftType: 'snake' | 'auction'
    timeLimit: number
    budgetPerTeam?: number
  }
  startTime: string
  endTime: string
  onShare?: () => void
  onExport?: () => void
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
  const [activeTab, setActiveTab] = useState('standings')
  const analytics = useMemo(() => {
    const totalPicks = picks.length
    const averagePickTime = totalPicks > 0 ?
      (new Date(endTime).getTime() - new Date(startTime).getTime()) / totalPicks / 1000 : 0

    // Team statistics
    const teamStats = teams.map(team => {
      const teamPicks = picks.filter(p => p.team_id === team.id)
      const totalCost = teamPicks.reduce((sum, pick) => sum + pick.cost, 0)
      const averageCost = teamPicks.length > 0 ? totalCost / teamPicks.length : 0

      return {
        ...team,
        totalCost,
        averageCost,
        pickCount: teamPicks.length,
        picks: teamPicks.sort((a, b) => a.pick_order - b.pick_order)
      }
    })

    // Draft order analysis
    const picksByRound = picks.reduce((acc, pick) => {
      if (!acc[pick.round]) acc[pick.round] = []
      acc[pick.round].push(pick)
      return acc
    }, {} as Record<number, Pick[]>)

    // Cost analysis
    const costDistribution = {
      budget: [0, 5],
      economy: [6, 10],
      mid: [11, 15],
      premium: [16, 20],
      luxury: [21, 25],
      legendary: [26, 100]
    }

    const costStats = Object.entries(costDistribution).map(([tier, [min, max]]) => {
      const tierPicks = picks.filter(p => p.cost >= min && (max === 100 ? true : p.cost <= max))
      return {
        tier,
        count: tierPicks.length,
        percentage: (tierPicks.length / totalPicks) * 100
      }
    })

    return {
      totalPicks,
      averagePickTime: Math.round(averagePickTime),
      teamStats,
      picksByRound,
      costStats,
      draftDuration: Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000 / 60)
    }
  }, [teams, picks, startTime, endTime])

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const getTierColor = (tier: string) => {
    const colors = {
      budget: 'bg-gray-500',
      economy: 'bg-green-500',
      mid: 'bg-blue-500',
      premium: 'bg-purple-500',
      luxury: 'bg-orange-500',
      legendary: 'bg-yellow-500'
    }
    return colors[tier as keyof typeof colors] || 'bg-gray-500'
  }

  const getRankSuffix = (rank: number) => {
    const suffixes = ['st', 'nd', 'rd']
    const remainder = rank % 100
    if (remainder >= 11 && remainder <= 13) return 'th'
    return suffixes[rank % 10 - 1] || 'th'
  }

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
          </div>
        </CardHeader>
      </Card>

      <div className="w-full">
        <div className="grid w-full grid-cols-2 sm:grid-cols-5 mb-6 gap-1">
          {[
            { id: 'standings', label: 'Final Standings' },
            { id: 'tournament', label: 'Tournament' },
            { id: 'analytics', label: 'Analytics' },
            { id: 'timeline', label: 'Draft Timeline' },
            { id: 'insights', label: 'Insights' }
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

        {/* Final Standings */}
        {activeTab === 'standings' && (
          <div className="space-y-4">
          {analytics.teamStats
            .sort((a, b) => b.totalCost - a.totalCost) // Sort by total cost (higher = better in most cases)
            .map((team, index) => (
              <Card key={team.id} className={cn(
                "transition-all duration-200",
                index === 0 && "border-2 border-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20"
              )}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {index === 0 && <Trophy className="h-6 w-6 text-yellow-600" />}
                        {index === 1 && <Award className="h-6 w-6 text-gray-500" />}
                        {index === 2 && <Star className="h-6 w-6 text-orange-600" />}
                        <span className="text-2xl font-bold text-slate-600 dark:text-slate-400">
                          {index + 1}{getRankSuffix(index + 1)}
                        </span>
                      </div>
                      <div>
                        <CardTitle className="text-xl">{team.name}</CardTitle>
                        <CardDescription>{team.userName}</CardDescription>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {team.totalCost} pts
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {team.averageCost.toFixed(1)} avg
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {team.picks.map((pick, pickIndex) => (
                      <Badge
                        key={pick.id}
                        variant="secondary"
                        className="text-xs"
                      >
                        #{pickIndex + 1}: {pick.pokemon_name} ({pick.cost}pts)
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
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

        {/* Analytics */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cost Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Cost Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {analytics.costStats.map((stat) => (
                  <div key={stat.tier} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="capitalize font-medium">{stat.tier}</span>
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {stat.count} picks ({stat.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <Progress value={stat.percentage} className="h-2">
                      <div
                        className={cn("h-full rounded-full", getTierColor(stat.tier))}
                        style={{ width: `${stat.percentage}%` }}
                      />
                    </Progress>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Draft Speed */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Draft Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{formatTime(analytics.averagePickTime)}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Avg Pick Time</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{analytics.draftDuration}m</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Total Duration</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">{analytics.totalPicks}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Total Picks</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-orange-600">{Object.keys(analytics.picksByRound).length}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Rounds</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
          </div>
        )}

        {/* Draft Timeline */}
        {activeTab === 'timeline' && (
          <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pick by Pick Timeline</CardTitle>
              <CardDescription>Chronological order of all draft picks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {picks
                  .sort((a, b) => a.pick_order - b.pick_order)
                  .map((pick) => {
                    const team = teams.find(t => t.id === pick.team_id)
                    return (
                      <div key={pick.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <Badge variant="outline" className="min-w-[60px] justify-center">
                          #{pick.pick_order}
                        </Badge>
                        <div className="flex-1">
                          <div className="font-medium">{pick.pokemon_name}</div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">
                            {team?.name} • Round {pick.round}
                          </div>
                        </div>
                        <Badge className={cn(
                          "text-xs",
                          pick.cost >= 20 ? "bg-purple-500" :
                          pick.cost >= 15 ? "bg-blue-500" :
                          pick.cost >= 10 ? "bg-green-500" : "bg-gray-500"
                        )}>
                          {pick.cost} pts
                        </Badge>
                      </div>
                    )
                  })
                }
              </div>
            </CardContent>
          </Card>
          </div>
        )}

        {/* Insights */}
        {activeTab === 'insights' && (
          <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Draft Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="font-semibold text-blue-800 dark:text-blue-200">Most Expensive Pick</div>
                    <div className="text-sm text-blue-600 dark:text-blue-300">
                      {picks.reduce((max, pick) => pick.cost > max.cost ? pick : max, picks[0])?.pokemon_name}
                      ({picks.reduce((max, pick) => pick.cost > max.cost ? pick : max, picks[0])?.cost} pts)
                    </div>
                  </div>

                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="font-semibold text-green-800 dark:text-green-200">Best Value Team</div>
                    <div className="text-sm text-green-600 dark:text-green-300">
                      {analytics.teamStats.reduce((max, team) => team.averageCost > max.averageCost ? team : max).name}
                      ({analytics.teamStats.reduce((max, team) => team.averageCost > max.averageCost ? team : max).averageCost.toFixed(1)} avg pts)
                    </div>
                  </div>

                  <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <div className="font-semibold text-purple-800 dark:text-purple-200">Fastest Round</div>
                    <div className="text-sm text-purple-600 dark:text-purple-300">
                      Round {Object.keys(analytics.picksByRound)[0]} • {analytics.picksByRound[1]?.length || 0} picks
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Team Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.teamStats.map((team, index) => (
                    <div key={team.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                      <span className="font-medium">{team.name}</span>
                      <div className="text-right text-sm">
                        <div className="font-bold">{team.totalCost} pts</div>
                        <div className="text-slate-600 dark:text-slate-400">{team.pickCount} picks</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          </div>
        )}
      </div>
    </div>
  )
}