'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DraftService } from '@/lib/draft-service'
import { Calendar, Users, Trophy, Clock, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface DraftHistoryItem {
  id: string
  draft_id: string
  draft_name: string
  format: string
  format_id: string
  total_teams: number
  total_picks: number
  winner_team_name?: string
  winner_team_owner?: string
  completed_at: string
  duration_minutes?: number
  metadata: {
    maxPokemonPerTeam: number
    budgetPerTeam: number
  }
}

export default function DraftHistory() {
  const [history, setHistory] = useState<DraftHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const itemsPerPage = 10

  useEffect(() => {
    loadHistory()
  }, [currentPage])

  const loadHistory = async () => {
    try {
      setIsLoading(true)
      const data = await DraftService.getDraftHistory(itemsPerPage, currentPage * itemsPerPage)
      setHistory(data)
      setHasMore(data.length === itemsPerPage)
    } catch (error) {
      console.error('Failed to load draft history:', error)
      toast.error('Failed to load draft history')
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 1) {
      return 'Today'
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  const formatDuration = (minutes?: number) => {
    if (!minutes) return 'N/A'
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  if (isLoading && history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Draft History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Draft History
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0 || isLoading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600">
              Page {currentPage + 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={!hasMore || isLoading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No completed drafts yet</p>
            <p className="text-sm mt-2">Your draft history will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((draft) => (
              <DraftHistoryCard key={draft.id} draft={draft} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DraftHistoryCard({ draft }: { draft: DraftHistoryItem }) {
  const [showDetails, setShowDetails] = useState(false)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 1) {
      return 'Today'
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  const formatDuration = (minutes?: number) => {
    if (!minutes) return 'N/A'
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  return (
    <div
      className={cn(
        "border rounded-lg p-4 transition-all duration-200",
        "hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600",
        "cursor-pointer bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-750"
      )}
      onClick={() => setShowDetails(!showDetails)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-lg">{draft.draft_name}</h3>
            <Badge variant="outline" className="text-xs">
              {draft.format}
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(draft.completed_at)}</span>
            </div>

            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <Users className="h-4 w-4" />
              <span>{draft.total_teams} teams</span>
            </div>

            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <Clock className="h-4 w-4" />
              <span>{formatDuration(draft.duration_minutes)}</span>
            </div>

            {draft.winner_team_name && (
              <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                <Trophy className="h-4 w-4" />
                <span className="truncate">{draft.winner_team_name}</span>
              </div>
            )}
          </div>

          {showDetails && (
            <div className="mt-4 pt-4 border-t space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Format:</span>{' '}
                  <span className="font-medium">{draft.format_id}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Total Picks:</span>{' '}
                  <span className="font-medium">{draft.total_picks}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Pokémon/Team:</span>{' '}
                  <span className="font-medium">{draft.metadata?.maxPokemonPerTeam || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Budget:</span>{' '}
                  <span className="font-medium">{draft.metadata?.budgetPerTeam || 'N/A'} pts</span>
                </div>
              </div>

              {draft.winner_team_owner && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                    <Trophy className="h-5 w-5" />
                    <div>
                      <div className="font-semibold">Winner</div>
                      <div className="text-sm">
                        {draft.winner_team_name} - {draft.winner_team_owner}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <Link href={`/draft/${draft.draft_id}/results`}>
                <Button variant="outline" size="sm" className="w-full mt-2">
                  <Eye className="h-4 w-4 mr-2" />
                  View Full Results
                </Button>
              </Link>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            setShowDetails(!showDetails)
          }}
          className="ml-2"
        >
          {showDetails ? (
            <ChevronLeft className="h-4 w-4 rotate-90" />
          ) : (
            <ChevronRight className="h-4 w-4 rotate-90" />
          )}
        </Button>
      </div>
    </div>
  )
}
