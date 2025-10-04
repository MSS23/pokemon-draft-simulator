'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { usePokemonList } from '@/hooks/usePokemon'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ArrowLeft, Home } from 'lucide-react'
import { DraftService, type DraftState as DBDraftState } from '@/lib/draft-service'
import DraftResults from '@/components/draft/DraftResults'
import { useNotify } from '@/components/providers/NotificationProvider'
import { LoadingScreen } from '@/components/ui/loading-states'

export default function DraftResultsPage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = (params.id as string)?.toUpperCase()

  const [draftState, setDraftState] = useState<DBDraftState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const { data: pokemon } = usePokemonList()
  // pokemon is fetched but used in child component DraftResults
  const notify = useNotify()

  useEffect(() => {
    const loadDraftState = async () => {
      if (!roomCode) return

      try {
        setIsLoading(true)
        const dbState = await DraftService.getDraftState(roomCode.toLowerCase())

        if (!dbState) {
          setError('Draft room not found')
          return
        }

        if (dbState.draft.status !== 'completed') {
          setError('Draft is not yet completed')
          return
        }

        setDraftState(dbState)
      } catch (err) {
        console.error('Error loading draft state:', err)
        setError('Failed to load draft results')
      } finally {
        setIsLoading(false)
      }
    }

    loadDraftState()
  }, [roomCode])

  if (isLoading) {
    return (
      <LoadingScreen
        title="Loading Draft Results..."
        description="Fetching draft data and calculating statistics."
      />
    )
  }

  if (error || !draftState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => router.push(`/draft/${roomCode}`)} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Draft
            </Button>
            <Button onClick={() => router.push('/')} variant="outline" className="w-full">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Transform data for the results component
  const teams = draftState.teams.map(team => {
    const participant = draftState.participants.find(p => p.team_id === team.id)
    const teamPicks = draftState.picks
      .filter(pick => pick.team_id === team.id)
      .sort((a, b) => a.pick_order - b.pick_order)
      .map(pick => pick.pokemon_id)

    return {
      id: team.id,
      name: team.name,
      userName: participant?.display_name || 'Unknown',
      draftOrder: team.draft_order,
      picks: teamPicks,
      budgetRemaining: team.budget_remaining
    }
  })

  const picks = draftState.picks.map(pick => ({
    id: pick.id,
    team_id: pick.team_id,
    pokemon_id: pick.pokemon_id,
    pokemon_name: pick.pokemon_name,
    cost: pick.cost,
    pick_order: pick.pick_order,
    round: pick.round,
    created_at: pick.created_at
  }))

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="relative text-center mb-6">
          <div className="absolute top-0 left-0">
            <Button
              variant="outline"
              onClick={() => router.push(`/draft/${roomCode}`)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Draft
            </Button>
          </div>
          <div className="absolute top-0 right-0">
            <ThemeToggle />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent mb-2">
            Draft Results: {roomCode}
          </h1>
          <Badge variant="secondary" className="text-green-700 bg-green-100 border-green-300">
            Draft Completed
          </Badge>
        </div>

        <DraftResults
          draftName={draftState.draft.name}
          teams={teams}
          picks={picks}
          draftSettings={{
            maxTeams: draftState.draft.max_teams,
            pokemonPerTeam: draftState.draft.settings?.pokemonPerTeam || 6,
            draftType: draftState.draft.format,
            timeLimit: draftState.draft.settings?.timeLimit || 60,
            budgetPerTeam: draftState.draft.budget_per_team
          }}
          startTime={draftState.draft.created_at}
          endTime={draftState.draft.updated_at}
          onShare={() => {
            const shareUrl = `${window.location.origin}/draft/${roomCode}/results`
            navigator.clipboard.writeText(shareUrl)
            notify.success('Share Link Copied!', 'Draft results link copied to clipboard')
          }}
          onExport={() => {
            const dataStr = JSON.stringify({
              draft: draftState.draft,
              teams: teams,
              picks: picks,
              exportedAt: new Date().toISOString()
            }, null, 2)
            const dataBlob = new Blob([dataStr], { type: 'application/json' })
            const url = URL.createObjectURL(dataBlob)
            const link = document.createElement('a')
            link.href = url
            link.download = `${roomCode}-draft-results.json`
            link.click()
            URL.revokeObjectURL(url)
            notify.success('Export Complete!', 'Draft data exported to JSON file')
          }}
        />
      </div>
    </div>
  )
}