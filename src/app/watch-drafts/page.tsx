'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Eye, Users, Clock, Tag, Search, RefreshCw } from 'lucide-react'
import { DraftService } from '@/lib/draft-service'
import { useNotify } from '@/components/providers/NotificationProvider'

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-500">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="relative text-center mb-8">
          <div className="absolute top-0 right-0">
            <ThemeToggle />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent mb-4">
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
                        <CardDescription className="flex items-center gap-4 text-sm">
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
        <div className="max-w-4xl mx-auto mt-8">
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
        </div>
      </div>
    </div>
  )
}
