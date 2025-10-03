'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Crown, User, Clock, Trophy } from 'lucide-react'

interface TeamStatusProps {
  teams: Array<{
    id: string
    name: string
    userName: string
    draftOrder: number
    picks: string[]
  }>
  currentTeamId: string | null
  userTeamId: string | null
  maxPokemonPerTeam?: number
  timeRemaining?: number
  draftStatus: 'waiting' | 'drafting' | 'completed' | 'paused'
}

export default function TeamStatus({
  teams,
  currentTeamId,
  userTeamId,
  maxPokemonPerTeam = 6,
  timeRemaining = 0,
  draftStatus
}: TeamStatusProps) {
  const sortedTeams = [...teams].sort((a, b) => a.draftOrder - b.draftOrder)
  const currentTeam = teams.find(team => team.id === currentTeamId)

  const getTeamStatusIcon = (team: typeof teams[0]) => {
    if (team.picks.length >= maxPokemonPerTeam) {
      return <Trophy className="h-4 w-4 text-green-600" />
    }
    if (team.id === currentTeamId && draftStatus === 'drafting') {
      return <Crown className="h-4 w-4 text-yellow-500" />
    }
    return <User className="h-3 w-3 text-gray-400" />
  }

  const getTeamStatusColor = (team: typeof teams[0]) => {
    if (team.id === userTeamId) return 'border-blue-500 bg-blue-50 dark:bg-blue-950'
    if (team.id === currentTeamId && draftStatus === 'drafting') return 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950'
    if (team.picks.length >= maxPokemonPerTeam) return 'border-green-400 bg-green-50 dark:bg-green-950'
    return 'border-gray-200 dark:border-gray-700'
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="h-5 w-5" />
          Team Status
          {draftStatus === 'drafting' && (
            <Badge variant="default" className="text-xs">
              In Progress
            </Badge>
          )}
          {draftStatus === 'completed' && (
            <Badge variant="secondary" className="text-xs">
              Completed
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Turn Info */}
        {draftStatus === 'drafting' && currentTeam && (
          <div className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-lg border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-500" />
                <div>
                  <div className="font-semibold text-sm">
                    {currentTeam.id === userTeamId ? "Your Turn!" : `${currentTeam.name}'s Turn`}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Pick #{currentTeam.picks.length + 1} of {maxPokemonPerTeam}
                  </div>
                </div>
              </div>
              {timeRemaining > 0 && (
                <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  <Clock className="h-4 w-4" />
                  <span className="font-mono text-sm">{timeRemaining}s</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Teams Grid */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">Draft Order</h4>
          <div className="grid gap-2">
            {sortedTeams.map((team) => (
              <div
                key={team.id}
                className={`p-3 rounded-lg border-2 transition-all duration-200 ${getTeamStatusColor(team)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getTeamStatusIcon(team)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{team.name}</span>
                        <Badge variant="outline" className="text-xs px-1 py-0">
                          #{team.draftOrder}
                        </Badge>
                        {team.id === userTeamId && (
                          <Badge variant="secondary" className="text-xs px-1 py-0">
                            You
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                        {team.userName}
                      </div>
                    </div>
                  </div>

                  <div className="text-right ml-2">
                    <div className="text-sm font-medium">
                      {team.picks.length}/{maxPokemonPerTeam}
                    </div>
                    <div className="w-16">
                      <Progress
                        value={(team.picks.length / maxPokemonPerTeam) * 100}
                        className="h-1.5"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Overall Draft Progress */}
        <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Overall Progress
            </span>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {teams.reduce((sum, team) => sum + team.picks.length, 0)} / {teams.length * maxPokemonPerTeam} picks
            </span>
          </div>
          <Progress
            value={(teams.reduce((sum, team) => sum + team.picks.length, 0) / (teams.length * maxPokemonPerTeam)) * 100}
            className="h-2"
          />
        </div>
      </CardContent>
    </Card>
  )
}