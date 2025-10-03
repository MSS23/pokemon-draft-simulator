'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  BarChart3,
  Users,
  Trophy,
  Clock,
  TrendingUp,
  Star
} from 'lucide-react'

interface DraftAnalyticsSummaryProps {
  totalDrafts: number
  totalTeams: number
  totalPicks: number
  averageDraftTime: number // in minutes
  popularDraftType: 'snake' | 'auction'
  recentActivity: {
    completedToday: number
    activeNow: number
  }
  topPokemon: {
    name: string
    pickCount: number
    averageCost: number
  }[]
}

export default function DraftAnalyticsSummary({
  totalDrafts,
  totalTeams,
  totalPicks,
  averageDraftTime,
  popularDraftType,
  recentActivity,
  topPokemon
}: DraftAnalyticsSummaryProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Overview Stats */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Drafts</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalDrafts}</div>
          <p className="text-xs text-muted-foreground">
            {totalTeams} teams participated
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Picks</CardTitle>
          <Trophy className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalPicks.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            Pokémon drafted across all games
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Draft Time</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{averageDraftTime}m</div>
          <p className="text-xs text-muted-foreground">
            Average completion time
          </p>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Completed Today</span>
              <Badge variant="secondary">{recentActivity.completedToday}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">Active Now</span>
              <Badge variant={recentActivity.activeNow > 0 ? "default" : "secondary"}>
                {recentActivity.activeNow}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Draft Format Preference */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Popular Format</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold capitalize">{popularDraftType}</div>
          <p className="text-xs text-muted-foreground">
            Most played draft format
          </p>
          <Progress value={popularDraftType === 'snake' ? 75 : 25} className="mt-2" />
        </CardContent>
      </Card>

      {/* Top Pokémon */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Most Drafted</CardTitle>
          <Star className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {topPokemon.slice(0, 3).map((pokemon, index) => (
              <div key={pokemon.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">#{index + 1}</span>
                  <span className="font-medium">{pokemon.name}</span>
                </div>
                <div className="text-right">
                  <div className="font-bold">{pokemon.pickCount}</div>
                  <div className="text-xs text-muted-foreground">
                    {pokemon.averageCost.toFixed(1)} avg
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}