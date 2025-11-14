'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Trophy, Calendar, Users, CheckCircle, Circle } from 'lucide-react'

interface Team {
  id: string
  name: string
  userName: string
}

interface Match {
  id: string
  round: number
  team1: Team
  team2: Team
  winner?: string | null
  score1?: number
  score2?: number
}

interface TournamentScheduleProps {
  teams: Team[]
  onMatchComplete?: (matchId: string, winnerId: string, score1: number, score2: number) => void
}

export default function TournamentSchedule({ teams, onMatchComplete }: TournamentScheduleProps) {
  const [matches, setMatches] = useState<Match[]>(() => generateRoundRobinSchedule(teams))
  const [standings, setStandings] = useState(() => initializeStandings(teams))

  // Generate round-robin schedule
  function generateRoundRobinSchedule(teams: Team[]): Match[] {
    const schedule: Match[] = []
    const n = teams.length

    // Round-robin algorithm
    for (let round = 0; round < n - 1; round++) {
      for (let match = 0; match < n / 2; match++) {
        const home = (round + match) % (n - 1)
        const away = (n - 1 - match + round) % (n - 1)

        // Last team stays in place
        const team1Index = match === 0 ? n - 1 : home
        const team2Index = away

        if (teams[team1Index] && teams[team2Index]) {
          schedule.push({
            id: `r${round + 1}m${match + 1}`,
            round: round + 1,
            team1: teams[team1Index],
            team2: teams[team2Index]
          })
        }
      }
    }

    return schedule
  }

  function initializeStandings(teams: Team[]) {
    return teams.map(team => ({
      teamId: team.id,
      teamName: team.name,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0
    }))
  }

  function recordMatchResult(matchId: string, winnerId: string, score1: number, score2: number) {
    // Update match
    setMatches(prev => prev.map(match =>
      match.id === matchId
        ? { ...match, winner: winnerId, score1, score2 }
        : match
    ))

    // Update standings
    const match = matches.find(m => m.id === matchId)
    if (match) {
      setStandings(prev => prev.map(standing => {
        if (standing.teamId === match.team1.id) {
          return {
            ...standing,
            wins: standing.wins + (winnerId === match.team1.id ? 1 : 0),
            losses: standing.losses + (winnerId === match.team2.id ? 1 : 0),
            pointsFor: standing.pointsFor + score1,
            pointsAgainst: standing.pointsAgainst + score2
          }
        }
        if (standing.teamId === match.team2.id) {
          return {
            ...standing,
            wins: standing.wins + (winnerId === match.team2.id ? 1 : 0),
            losses: standing.losses + (winnerId === match.team1.id ? 1 : 0),
            pointsFor: standing.pointsFor + score2,
            pointsAgainst: standing.pointsAgainst + score1
          }
        }
        return standing
      }))
    }

    onMatchComplete?.(matchId, winnerId, score1, score2)
  }

  const sortedStandings = [...standings].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    const aDiff = a.pointsFor - a.pointsAgainst
    const bDiff = b.pointsFor - b.pointsAgainst
    return bDiff - aDiff
  })

  const totalMatches = matches.length
  const completedMatches = matches.filter(m => m.winner).length
  const rounds = Math.max(...matches.map(m => m.round))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-600" />
                Tournament Schedule
              </CardTitle>
              <CardDescription>
                Round-robin format • {completedMatches}/{totalMatches} matches completed
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {rounds} Rounds
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="schedule" suppressHydrationWarning>
            <Calendar className="h-4 w-4 mr-2" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="standings" suppressHydrationWarning>
            <Users className="h-4 w-4 mr-2" />
            Standings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4">
          {Array.from({ length: rounds }, (_, roundIndex) => {
            const roundMatches = matches.filter(m => m.round === roundIndex + 1)
            return (
              <Card key={roundIndex + 1}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Round {roundIndex + 1}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {roundMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      onComplete={(winnerId, score1, score2) =>
                        recordMatchResult(match.id, winnerId, score1, score2)
                      }
                    />
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>

        <TabsContent value="standings">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current Standings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sortedStandings.map((standing, index) => (
                  <div
                    key={standing.teamId}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                        index === 1 ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' :
                        index === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                        'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{standing.teamName}</div>
                        <div className="text-xs text-slate-500">
                          {standing.wins}W - {standing.losses}L
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold">
                        {standing.pointsFor - standing.pointsAgainst > 0 ? '+' : ''}
                        {standing.pointsFor - standing.pointsAgainst}
                      </div>
                      <div className="text-xs text-slate-500">
                        {standing.pointsFor} PF • {standing.pointsAgainst} PA
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MatchCard({
  match,
  onComplete
}: {
  match: Match
  onComplete: (winnerId: string, score1: number, score2: number) => void
}) {
  const [score1, setScore1] = useState(match.score1 || 0)
  const [score2, setScore2] = useState(match.score2 || 0)
  const [isEditing, setIsEditing] = useState(false)

  const handleComplete = (winnerId: string) => {
    onComplete(winnerId, score1, score2)
    setIsEditing(false)
  }

  if (match.winner) {
    return (
      <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
        <div className="flex items-center gap-2 flex-1">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <div className="flex items-center gap-2 flex-1">
            <span className={`text-sm font-medium ${match.winner === match.team1.id ? 'text-green-600' : 'text-slate-500'}`}>
              {match.team1.name}
            </span>
            <span className="text-xs text-slate-400">vs</span>
            <span className={`text-sm font-medium ${match.winner === match.team2.id ? 'text-green-600' : 'text-slate-500'}`}>
              {match.team2.name}
            </span>
          </div>
        </div>
        <div className="text-sm font-semibold">
          {match.score1} - {match.score2}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded">
      <div className="flex items-center gap-2 flex-1">
        <Circle className="h-4 w-4 text-slate-400" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{match.team1.name}</span>
          <span className="text-xs text-slate-400">vs</span>
          <span className="text-sm font-medium">{match.team2.name}</span>
        </div>
      </div>
      {isEditing ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={score1}
            onChange={(e) => setScore1(parseInt(e.target.value) || 0)}
            className="w-12 px-2 py-1 text-center text-sm border rounded"
          />
          <span className="text-xs">-</span>
          <input
            type="number"
            min="0"
            value={score2}
            onChange={(e) => setScore2(parseInt(e.target.value) || 0)}
            className="w-12 px-2 py-1 text-center text-sm border rounded"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleComplete(score1 > score2 ? match.team1.id : match.team2.id)}
          >
            Save
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
          Record Result
        </Button>
      )}
    </div>
  )
}
