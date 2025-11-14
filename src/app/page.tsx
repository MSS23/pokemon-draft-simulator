'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { usePokemonListByFormat } from '@/hooks/usePokemon'
import { Pokemon } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DraftService } from '@/lib/draft-service'
import { UserSessionService, type DraftParticipation } from '@/lib/user-session'
import { useRouter } from 'next/navigation'
import { Clock, Play, Trophy, Users, Trash2, Eye, Zap } from 'lucide-react'
import { POKEMON_FORMATS, getFormatById, DEFAULT_FORMAT } from '@/lib/formats'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { SidebarLayout } from '@/components/layout/SidebarLayout'

// Lazy load heavy components for better initial load performance
const PokemonGrid = dynamic(() => import('@/components/pokemon/PokemonGrid'), {
  loading: () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>,
  ssr: false
})

const PokemonDetailsModal = dynamic(() => import('@/components/pokemon/PokemonDetailsModal'), {
  ssr: false
})

const DraftConfirmationModal = dynamic(() => import('@/components/draft/DraftConfirmationModal'), {
  ssr: false
})

const DraftSummaryPanel = dynamic(() => import('@/components/draft/DraftSummaryPanel'), {
  ssr: false
})

export default function Home() {
  const router = useRouter()
  const { user } = useAuth()
  const [detailsPokemon, setDetailsPokemon] = useState<Pokemon | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [confirmationPokemon, setConfirmationPokemon] = useState<Pokemon | null>(null)
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)
  const [draftedPokemon, setDraftedPokemon] = useState<Pokemon[]>([])
  const [myDrafts, setMyDrafts] = useState<DraftParticipation[]>([])
  const [selectedFormatId, setSelectedFormatId] = useState<string>(DEFAULT_FORMAT)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  // Draft settings
  const totalBudget = 100
  const maxTeamSize = 6
  const usedBudget = draftedPokemon.reduce((sum, p) => sum + p.cost, 0)
  const remainingBudget = totalBudget - usedBudget

  // Get selected format
  const [selectedFormat, setSelectedFormat] = useState(() => {
    const format = getFormatById(DEFAULT_FORMAT)
    return format!
  })

  // Use format-specific Pokemon list
  const { data: pokemon, isLoading, error } = usePokemonListByFormat(selectedFormatId, undefined, true)

  // Update selected format when format ID changes
  useEffect(() => {
    const format = getFormatById(selectedFormatId) || getFormatById(DEFAULT_FORMAT)!
    setSelectedFormat(format)
  }, [selectedFormatId])

  const handleViewDetails = (pokemon: Pokemon) => {
    setDetailsPokemon(pokemon)
    setIsDetailsOpen(true)
  }

  const handleInitiateDraft = (pokemon: Pokemon) => {
    setConfirmationPokemon(pokemon)
    setIsConfirmationOpen(true)
    setIsDetailsOpen(false)
  }

  const handleConfirmDraft = (pokemon: Pokemon) => {
    setDraftedPokemon(prev => [...prev, pokemon])
    setIsConfirmationOpen(false)
    setConfirmationPokemon(null)
  }

  const handleUndoLast = () => {
    setDraftedPokemon(prev => prev.slice(0, -1))
  }

  const handleResetDraft = () => {
    if (confirm('Are you sure you want to reset your entire draft? This cannot be undone.')) {
      setDraftedPokemon([])
    }
  }

  const handleResumeDraft = async (draftId: string) => {
    try {
      const result = await DraftService.resumeDraft(draftId)
      if (result.success && result.url) {
        router.push(result.url)
      } else {
        toast.error(result.error || 'Failed to resume draft')
      }
    } catch (error) {
      console.error('Error resuming draft:', error)
      toast.error('Failed to resume draft')
    }
  }

  const handleDeleteDraft = async (draftId: string, event: React.MouseEvent) => {
    event.stopPropagation()

    // Prevent deletion if not authenticated
    if (!user) {
      toast.error('Please log in to delete drafts')
      return
    }

    const confirmed = window.confirm('Delete this draft permanently? This will remove the draft for all participants and cannot be undone.')
    if (!confirmed) return

    try {
      // Optimistically remove from UI first
      setMyDrafts(prev => prev.filter(d => d.draftId !== draftId))

      // Delete from database (pass userId for soft delete and broadcast)
      const userId = user.id
      await DraftService.deleteDraft(draftId, userId)

      // Remove from local storage
      UserSessionService.removeDraftParticipation(draftId)

      toast.success('Draft deleted. All participants have been notified.')

    } catch (error) {
      console.error('Error deleting draft:', error)

      // Revert UI on error by reloading from database (if authenticated)
      if (user?.id && supabase) {
        try {
          const { data: userTeams } = await supabase
            .from('teams')
            .select(`
              id,
              name,
              owner_id,
              draft_id,
              draft:drafts!inner(
                id,
                room_code,
                status,
                created_at,
                deleted_at,
                host_id
              )
            `)
            .eq('owner_id', user.id)
            .is('draft.deleted_at', null)

          if (userTeams) {
            const dbDrafts: DraftParticipation[] = userTeams.map((team: any) => ({
              draftId: team.draft.room_code || team.draft.id,
              userId: user.id,
              teamId: team.id,
              teamName: team.name,
              displayName: user.email?.split('@')[0] || 'User',
              isHost: team.draft.host_id === user.id,
              status: team.draft.status,
              lastActivity: team.draft.created_at,
              joinedAt: team.draft.created_at
            }))
            setMyDrafts(dbDrafts)
          }
        } catch (reloadError) {
          console.error('Error reloading drafts:', reloadError)
          // Final fallback to localStorage
          setMyDrafts(UserSessionService.getVisibleDraftParticipations())
        }
      } else {
        // For non-authenticated users, reload from localStorage
        setMyDrafts(UserSessionService.getVisibleDraftParticipations())
      }

      toast.error('Failed to delete draft. You may not have permission to delete this draft.')
    }
  }

  // Load user's drafts on component mount (excluding abandoned ones)
  useEffect(() => {
    const loadDrafts = async () => {
      // Auto-cleanup abandoned drafts from local storage
      UserSessionService.cleanupAbandonedDrafts()

      // Get drafts from localStorage first
      const localDrafts = UserSessionService.getVisibleDraftParticipations()

      // If user is authenticated and Supabase is available, validate against database
      if (user?.id && supabase) {
        try {
          // Query database for user's teams (joined with drafts, filtering out soft-deleted)
          const { data: userTeams, error } = await supabase
            .from('teams')
            .select(`
              id,
              name,
              owner_id,
              draft_id,
              draft:drafts!inner(
                id,
                room_code,
                status,
                created_at,
                deleted_at,
                host_id
              )
            `)
            .eq('owner_id', user.id)
            .is('draft.deleted_at', null) // Filter out soft-deleted drafts

          if (error) {
            console.error('Error loading drafts from database:', error)
            // Fall back to localStorage on error
            setMyDrafts(localDrafts)
            return
          }

          // Transform database results to DraftParticipation format
          const validDraftIds = new Set<string>()
          const dbDrafts: DraftParticipation[] = (userTeams || []).map((team: any) => {
            const draftId = team.draft.room_code || team.draft.id
            validDraftIds.add(draftId)

            return {
              draftId,
              userId: user.id,
              teamId: team.id,
              teamName: team.name,
              displayName: user.email?.split('@')[0] || 'User',
              isHost: team.draft.host_id === user.id,
              status: team.draft.status,
              lastActivity: team.draft.created_at,
              joinedAt: team.draft.created_at
            }
          })

          // Remove any drafts from localStorage that are deleted in the database
          localDrafts.forEach(draft => {
            if (!validDraftIds.has(draft.draftId)) {
              UserSessionService.removeDraftParticipation(draft.draftId)
            }
          })

          // Update state with database-validated drafts
          setMyDrafts(dbDrafts)
        } catch (error) {
          console.error('Error validating drafts:', error)
          // Fall back to localStorage on error
          setMyDrafts(localDrafts)
        }
      } else {
        // For non-authenticated users, use localStorage only
        setMyDrafts(localDrafts)
      }
    }

    loadDrafts()
  }, [user])

  return (
    <SidebarLayout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">Connection Error</h3>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Could not load Pokemon data. Please check your internet connection.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => window.location.reload()} className="border-red-300 text-red-700">
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-400 dark:via-blue-300 dark:to-cyan-400 bg-clip-text text-transparent mb-4">
            Pokémon Draft League
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto mb-2">
            Build your dream team in real-time competitive Pokémon drafts
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-500 max-w-2xl mx-auto">
            Create custom draft rooms, choose from official formats, and compete with friends in snake or auction drafts
          </p>
        </div>


        {/* Quick Actions - Enhanced Cards */}
        <div className="mb-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Create Draft Card */}
          <div
            onClick={() => {
              if (!user) {
                setAuthModalOpen(true)
                return
              }
              window.location.href = '/create-draft'
            }}
            className="group relative bg-card rounded-xl p-6 border-2 border-primary/20 hover:border-primary/50 transition-all cursor-pointer hover:shadow-xl hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Users className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Create Draft</h3>
              <p className="text-sm text-muted-foreground">Set up a new draft room and invite your friends</p>
            </div>
          </div>

          {/* Join Draft Card */}
          <div
            onClick={() => {
              const code = prompt('Enter 6-character room code:')
              if (code) {
                window.location.href = `/join-draft?code=${code.toUpperCase()}`
              }
            }}
            className="group relative bg-card rounded-xl p-6 border-2 border-accent/20 hover:border-accent/50 transition-all cursor-pointer hover:shadow-xl hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-full bg-accent flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Play className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Join Draft</h3>
              <p className="text-sm text-muted-foreground">Enter a room code to join an existing draft</p>
            </div>
          </div>

          {/* Watch Drafts Card */}
          <div
            onClick={() => router.push('/watch-drafts')}
            className="group relative bg-card rounded-xl p-6 border-2 border-blue-300/20 dark:border-blue-700/20 hover:border-blue-400/50 dark:hover:border-blue-600/50 transition-all cursor-pointer hover:shadow-xl hover:-translate-y-1"
          >
            <div className="flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Eye className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Watch Live</h3>
              <p className="text-sm text-muted-foreground">Spectate public drafts from the community</p>
            </div>
          </div>
        </div>

        {/* My Drafts Section */}
        {myDrafts.length > 0 ? (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Trophy className="h-6 w-6" />
              My Drafts
              <Badge variant="secondary" className="ml-2">{myDrafts.length}</Badge>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myDrafts.slice(0, 6).map((draft) => (
                <div
                  key={draft.draftId}
                  className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                        {draft.teamName}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Room: {draft.draftId.toUpperCase()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {draft.isHost && (
                        <Badge variant="outline" className="text-xs">
                          Host
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-xs font-medium ${
                          draft.status === 'active'
                            ? 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700'
                            : draft.status === 'completed'
                            ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700'
                            : 'bg-slate-50 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600'
                        }`}
                      >
                        {draft.status === 'active' && '🟢 '}
                        {draft.status === 'completed' && '✓ '}
                        {draft.status.charAt(0).toUpperCase() + draft.status.slice(1)}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400 mb-3">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{draft.displayName}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(draft.lastActivity).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {draft.status === 'active' && (
                      <Button
                        size="sm"
                        onClick={() => handleResumeDraft(draft.draftId)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Resume
                      </Button>
                    )}
                    {draft.status === 'completed' && (
                      <Button
                        size="sm"
                        onClick={() => router.push(`/draft/${draft.draftId}/results`)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Trophy className="h-3 w-3 mr-1" />
                        View Results
                      </Button>
                    )}
                    {draft.status !== 'completed' && draft.status !== 'active' && (
                      <Button
                        size="sm"
                        onClick={() => handleResumeDraft(draft.draftId)}
                        className="flex-1"
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Open
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const url = `/draft/${draft.draftId}`
                        navigator.clipboard.writeText(`${window.location.origin}${url}`)
                        toast.success('Draft link copied to clipboard!')
                      }}
                      className={draft.status === 'completed' ? '' : 'flex-1'}
                    >
                      Share
                    </Button>
                    {draft.isHost && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleDeleteDraft(draft.draftId, e)}
                        className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                        title="Delete draft permanently (Host only)"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {myDrafts.length > 6 && (
              <div className="mt-4 text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Showing 6 of {myDrafts.length} draft rooms
                </p>
              </div>
            )}
          </div>
        ) : user && (
          <div className="mb-8 max-w-2xl mx-auto">
            <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-xl p-8 text-center border border-slate-200 dark:border-slate-700">
              <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                <Trophy className="h-8 w-8 text-slate-400 dark:text-slate-500" />
              </div>
              <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">
                No drafts yet
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Get started by creating your first draft room or joining an existing one
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => window.location.href = '/create-draft'}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Create Draft
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const code = prompt('Enter room code:')
                    if (code) {
                      window.location.href = `/join-draft?code=${code.toUpperCase()}`
                    }
                  }}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Join Draft
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Features Section */}
        <div className="mb-12 max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8 text-slate-800 dark:text-slate-200">
            Why Choose Our Platform?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
              <div className="h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-lg mb-2 text-slate-800 dark:text-slate-200">Real-Time Drafting</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Instant synchronization across all participants with WebSocket technology
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Trophy className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2 text-slate-800 dark:text-slate-200">Official Formats</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                VGC, Smogon, and custom formats with automatic cost calculation
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
              <div className="h-12 w-12 rounded-lg bg-cyan-100 dark:bg-cyan-900 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
              </div>
              <h3 className="font-semibold text-lg mb-2 text-slate-800 dark:text-slate-200">Multiplayer Ready</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Support for 2-8 teams with spectator mode and live commentary
              </p>
            </div>
          </div>
        </div>

        {/* Format Selector & Pokemon Grid */}
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          {/* Format Selector */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Format:
              </h3>
            </div>
            <div className="flex-1 max-w-md">
              <Select value={selectedFormatId} onValueChange={setSelectedFormatId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a format" />
                </SelectTrigger>
                <SelectContent>
                  {POKEMON_FORMATS.map((format) => (
                    <SelectItem key={format.id} value={format.id}>
                      {format.name} - {format.category.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {selectedFormat.gameType === 'doubles' ? 'VGC Doubles' : 'Smogon Singles'}
              </Badge>
              <Badge variant="outline">
                Gen {selectedFormat.generation}
              </Badge>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative">
                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500"></div>
                </div>
              </div>
              <p className="mt-4 text-lg font-medium text-slate-700 dark:text-slate-300">Loading Pokémon...</p>
              <p className="text-sm text-slate-500 dark:text-slate-500">This may take a moment</p>
            </div>
          ) : (
            <PokemonGrid
              pokemon={pokemon || []}
              onViewDetails={handleViewDetails}
              draftedPokemonIds={draftedPokemon.map(p => p.id)}
              isLoading={isLoading}
              cardSize="md"
              showFilters={true}
              showCost={true}
              showStats={true}
            />
          )}
        </div>

        {/* Details Modal */}
        <PokemonDetailsModal
          pokemon={detailsPokemon}
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          onSelect={handleInitiateDraft}
          isDrafted={detailsPokemon ? draftedPokemon.some(p => p.id === detailsPokemon.id) : false}
        />

        {/* Draft Confirmation Modal */}
        <DraftConfirmationModal
          pokemon={confirmationPokemon}
          isOpen={isConfirmationOpen}
          onClose={() => setIsConfirmationOpen(false)}
          onConfirm={handleConfirmDraft}
          currentBudget={remainingBudget}
          draftedCount={draftedPokemon.length}
          maxDrafts={maxTeamSize}
        />

        {/* Draft Summary Panel */}
        <DraftSummaryPanel
          draftedPokemon={draftedPokemon}
          totalBudget={totalBudget}
          maxTeamSize={maxTeamSize}
          onUndoLast={handleUndoLast}
          onResetDraft={handleResetDraft}
        />

      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </SidebarLayout>
  )
}