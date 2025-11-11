'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Eye, Users, Clock, Tag, Search, RefreshCw, UserPlus } from 'lucide-react'
import { DraftService } from '@/lib/draft-service'
import { useNotify } from '@/components/providers/NotificationProvider'
import { useAuth } from '@/contexts/AuthContext'

interface PublicDraft {
  roomCode: string
  name: string
  status: string
  maxTeams: number
  currentTeams: number
  format: string
  createdAt: string
  description: string | null
  tags: string[] | null
  spectatorCount: number
}

export default function WatchDraftsPage() {
  const router = useRouter()
  const notify = useNotify()
  const { user } = useAuth()
  const [drafts, setDrafts] = useState<PublicDraft[]>([])
  const [filteredDrafts, setFilteredDrafts] = useState<PublicDraft[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'setup' | 'active' | 'completed'>('all')

  const loadPublicDrafts = async () => {
    try {
      setIsLoading(true)
      const data = await DraftService.getPublicDrafts({
        status: statusFilter === 'all' ? undefined : statusFilter as any,
        limit: 50
      })
      setDrafts(data)
      setFilteredDrafts(data)
    } catch (error) {
      console.error('Error loading public drafts:', error)
      notify.error('Failed to Load', 'Could not load public drafts')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPublicDrafts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  useEffect(() => {
    if (!searchQuery) {
      setFilteredDrafts(drafts)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = drafts.filter(draft =>
      draft.name.toLowerCase().includes(query) ||
      draft.roomCode.toLowerCase().includes(query) ||
      draft.description?.toLowerCase().includes(query) ||
      draft.tags?.some(tag => tag.toLowerCase().includes(query))
    )
    setFilteredDrafts(filtered)
  }, [searchQuery, drafts])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'setup':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Waiting</Badge>
      case 'active':
        return <Badge className="bg-green-600 text-white">Live</Badge>
      case 'completed':
        return <Badge variant="secondary">Completed</Badge>
      case 'paused':
        return <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Paused</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const handleWatchDraft = (roomCode: string) => {
    router.push(`/spectate/${roomCode}`)
  }

  const handleJoinDraft = (roomCode: string, e: React.MouseEvent) => {
    e.stopPropagation()
    router.push(`/join-draft?code=${roomCode}`)
  }

  const canJoinDraft = (draft: PublicDraft) => {
    // Only authenticated users can join drafts
    if (!user) return false
    // Can only join if there are available team slots and draft is in setup
    return draft.currentTeams < draft.maxTeams && draft.status === 'setup'
  }

  const canSpectateDraft = (draft: PublicDraft) => {
    // Authenticated users can spectate full drafts or ongoing drafts
    if (!user) return false
    // Can spectate if draft is full or already active
    return draft.currentTeams >= draft.maxTeams || draft.status === 'active' || draft.status === 'drafting'
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  return (
    <div className="min-h-screen bg-background transition-colors duration-500">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-400 dark:via-blue-300 dark:to-cyan-400 bg-clip-text text-transparent mb-4">
            Watch Public Drafts
          </h1>
          <p className="text-lg text-slate-700 dark:text-slate-300">
            Spectate live Pokémon drafts from around the community
          </p>
        </div>

        {/* Filters and Search */}
        <div className="max-w-4xl mx-auto mb-6">
          <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by name, room code, or tags..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Status Filter */}
                <div className="flex gap-2">
                  {(['all', 'setup', 'active', 'completed'] as const).map((status) => (
                    <Button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      variant={statusFilter === status ? 'default' : 'outline'}
                      size="sm"
                    >
                      {status === 'all' ? 'All' : status === 'setup' ? 'Waiting' : status === 'active' ? 'Live' : 'Completed'}
                    </Button>
                  ))}
                </div>

                {/* Refresh */}
                <Button
                  onClick={loadPublicDrafts}
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Drafts List */}
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
              <CardContent className="py-12 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-slate-400" />
                <p className="text-slate-600 dark:text-slate-400">Loading public drafts...</p>
              </CardContent>
            </Card>
          ) : filteredDrafts.length === 0 ? (
            <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
              <CardContent className="py-12 text-center">
                <Eye className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  No Public Drafts Found
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  {searchQuery ? 'Try a different search term' : 'No public drafts available right now'}
                </p>
                {searchQuery && (
                  <Button onClick={() => setSearchQuery('')} variant="outline">
                    Clear Search
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredDrafts.map((draft) => (
                <Card
                  key={draft.roomCode}
                  className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => handleWatchDraft(draft.roomCode)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="text-xl">{draft.name}</CardTitle>
                          {getStatusBadge(draft.status)}
                          {draft.status === 'active' && (
                            <Badge variant="destructive" className="animate-pulse">
                              ● LIVE
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="flex items-center gap-4 text-sm flex-wrap">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {draft.currentTeams}/{draft.maxTeams} teams
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {draft.spectatorCount} watching
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(draft.createdAt)}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {draft.format}
                          </Badge>
                        </CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant="secondary" className="font-mono">
                          {draft.roomCode}
                        </Badge>
                        <div className="flex gap-2">
                          {canJoinDraft(draft) && (
                            <Button
                              size="sm"
                              onClick={(e) => handleJoinDraft(draft.roomCode, e)}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <UserPlus className="h-3 w-3 mr-1" />
                              Join
                            </Button>
                          )}
                          {canSpectateDraft(draft) && (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleWatchDraft(draft.roomCode)
                              }}
                              variant="outline"
                              className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Spectate
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  {(draft.description || draft.tags) && (
                    <CardContent className="pt-0">
                      {draft.description && (
                        <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                          {draft.description}
                        </p>
                      )}
                      {draft.tags && draft.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {draft.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Help Text */}
        <div className="max-w-4xl mx-auto mt-8 space-y-4">
          <Card className="bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="text-sm text-blue-900 dark:text-blue-100">
                  <p className="font-medium mb-1">Spectator Mode</p>
                  <p className="text-blue-700 dark:text-blue-300">
                    Click any draft to watch it live. You'll see all picks, team rosters, and draft progress in real-time without participating.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {user ? (
            <Card className="bg-green-50/50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <UserPlus className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                  <div className="text-sm text-green-900 dark:text-green-100">
                    <p className="font-medium mb-1">Join as Participant or Spectate</p>
                    <p className="text-green-700 dark:text-green-300">
                      As an authenticated user, you can join drafts with available team slots using the "Join" button.
                      For full or active drafts, use the "Spectate" button to watch as a spectator.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-amber-50/50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="text-sm text-amber-900 dark:text-amber-100">
                    <p className="font-medium mb-1">Sign In to Join Drafts</p>
                    <p className="text-amber-700 dark:text-amber-300">
                      Guests can spectate any public draft. To join as a participant, please sign in or create an account.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
