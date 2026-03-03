'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { usePokemonListByFormat } from '@/hooks/usePokemon'
import { Pokemon } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DraftService } from '@/lib/draft-service'
import { UserSessionService, type DraftParticipation } from '@/lib/user-session'
import { useRouter } from 'next/navigation'
import { Clock, Play, Trophy, Users, Trash2, Eye, Zap, ArrowRight, Plus } from 'lucide-react'
import { POKEMON_FORMATS, getFormatById, DEFAULT_FORMAT } from '@/lib/formats'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { createLogger } from '@/lib/logger'

const log = createLogger('Home')

interface TeamWithDraft {
  id: string
  name: string
  owner_id: string | null
  draft_id: string
  draft: {
    id: string
    room_code: string
    status: string
    created_at: string
    deleted_at: string | null
    host_id: string
  }
}

function mapTeamsToDrafts(teams: TeamWithDraft[], userId: string, email?: string): DraftParticipation[] {
  return teams.map((team) => ({
    draftId: team.draft.room_code || team.draft.id,
    userId,
    teamId: team.id,
    teamName: team.name,
    displayName: email?.split('@')[0] || 'User',
    isHost: team.draft.host_id === userId,
    status: team.draft.status as DraftParticipation['status'],
    lastActivity: team.draft.created_at,
    joinedAt: team.draft.created_at,
  }))
}

const PokemonGrid = dynamic(() => import('@/components/pokemon/PokemonGrid'), {
  loading: () => <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent"></div></div>,
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
  const [authRedirectTo, setAuthRedirectTo] = useState<string | undefined>(undefined)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ draftId: string; event: React.MouseEvent } | null>(null)

  const totalBudget = 100
  const maxTeamSize = 6
  const usedBudget = draftedPokemon.reduce((sum, p) => sum + p.cost, 0)
  const remainingBudget = totalBudget - usedBudget

  const [selectedFormat, setSelectedFormat] = useState(() => {
    const format = getFormatById(DEFAULT_FORMAT)
    return format!
  })

  const { data: pokemon, isLoading, error } = usePokemonListByFormat(selectedFormatId, undefined, true)

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
    setResetConfirmOpen(true)
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
      log.error('Error resuming draft:', error)
      toast.error('Failed to resume draft')
    }
  }

  const handleDeleteDraft = (draftId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!user) {
      toast.error('Please log in to delete drafts')
      return
    }
    setDeleteConfirm({ draftId, event })
  }

  const executeDeleteDraft = async (draftId: string) => {
    if (!user) {
      toast.error('Please log in to delete drafts')
      return
    }

    try {
      setMyDrafts(prev => prev.filter(d => d.draftId !== draftId))
      const userId = user.id
      await DraftService.deleteDraft(draftId, userId)
      UserSessionService.removeDraftParticipation(draftId)
      toast.success('Draft deleted.')
    } catch (error) {
      log.error('Error deleting draft:', error)

      if (user?.id && supabase) {
        try {
          const { data: userTeams } = await supabase
            .from('teams')
            .select(`
              id, name, owner_id, draft_id,
              draft:drafts!inner(id, room_code, status, created_at, deleted_at, host_id)
            `)
            .eq('owner_id', user.id)
            .is('draft.deleted_at', null)

          if (userTeams) {
            setMyDrafts(mapTeamsToDrafts(userTeams as unknown as TeamWithDraft[], user.id, user.email ?? undefined))
          }
        } catch (reloadError) {
          log.error('Error reloading drafts:', reloadError)
          setMyDrafts(UserSessionService.getVisibleDraftParticipations())
        }
      } else {
        setMyDrafts(UserSessionService.getVisibleDraftParticipations())
      }
      toast.error('Failed to delete draft.')
    }
  }

  useEffect(() => {
    const loadDrafts = async () => {
      UserSessionService.cleanupAbandonedDrafts()
      const localDrafts = UserSessionService.getVisibleDraftParticipations()

      if (user?.id && supabase) {
        try {
          const { data: userTeams, error } = await supabase
            .from('teams')
            .select(`
              id, name, owner_id, draft_id,
              draft:drafts!inner(id, room_code, status, created_at, deleted_at, host_id)
            `)
            .eq('owner_id', user.id)
            .is('draft.deleted_at', null)

          if (error) {
            log.error('Error loading drafts from database:', error)
            setMyDrafts(localDrafts)
            return
          }

          const dbDrafts = mapTeamsToDrafts((userTeams || []) as unknown as TeamWithDraft[], user.id, user.email ?? undefined)
          const validDraftIds = new Set(dbDrafts.map(d => d.draftId))

          localDrafts.forEach(draft => {
            if (!validDraftIds.has(draft.draftId)) {
              UserSessionService.removeDraftParticipation(draft.draftId)
            }
          })
          setMyDrafts(dbDrafts)
        } catch (error) {
          log.error('Error validating drafts:', error)
          setMyDrafts(localDrafts)
        }
      } else {
        setMyDrafts(localDrafts)
      }
    }

    loadDrafts()
  }, [user])

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        {/* Error Banner */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-destructive">Connection Error</p>
              <p className="text-xs text-muted-foreground mt-0.5">Could not load Pokemon data.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => router.refresh()}>Retry</Button>
          </div>
        )}

        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-r from-primary via-blue-500 to-cyan-500 bg-clip-text text-transparent">
            Pokemon Draft League
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Build your dream team in real-time competitive drafts. Snake or auction format.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          <Card
            className="group cursor-pointer hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            onClick={() => {
              if (!user) {
                setAuthRedirectTo('/create-draft')
                setAuthModalOpen(true)
                return
              }
              router.push('/create-draft')
            }}
          >
            <CardContent className="p-5 text-center space-y-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary/20 transition-colors">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Create Draft</h3>
              <p className="text-xs text-muted-foreground">Set up a new draft room</p>
            </CardContent>
          </Card>

          <Card
            className="group cursor-pointer hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            onClick={() => router.push('/join-draft')}
          >
            <CardContent className="p-5 text-center space-y-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary/20 transition-colors">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Join Draft</h3>
              <p className="text-xs text-muted-foreground">Enter a room code</p>
            </CardContent>
          </Card>

          <Card
            className="group cursor-pointer hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            onClick={() => router.push('/watch-drafts')}
          >
            <CardContent className="p-5 text-center space-y-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary/20 transition-colors">
                <Eye className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Watch Live</h3>
              <p className="text-xs text-muted-foreground">Spectate public drafts</p>
            </CardContent>
          </Card>
        </div>

        {/* My Drafts */}
        {myDrafts.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                My Drafts
                <Badge variant="secondary" className="text-xs">{myDrafts.length}</Badge>
              </h2>
              {user && (
                <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')} className="text-xs gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {myDrafts.slice(0, 6).map((draft) => (
                <Card key={draft.draftId} className="hover:border-primary/30 transition-colors">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{draft.teamName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{draft.draftId.toUpperCase()}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {draft.isHost && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">Host</Badge>
                        )}
                        <Badge
                          variant={draft.status === 'active' ? 'default' : 'secondary'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {draft.status === 'active' ? 'Active' : draft.status === 'completed' ? 'Done' : draft.status.charAt(0).toUpperCase() + draft.status.slice(1)}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(draft.lastActivity).toLocaleDateString()}</span>
                    </div>

                    <div className="flex gap-2">
                      {draft.status === 'active' && (
                        <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => handleResumeDraft(draft.draftId)}>
                          <Play className="h-3 w-3 mr-1" />
                          Resume
                        </Button>
                      )}
                      {draft.status === 'completed' && (
                        <Button size="sm" variant="secondary" className="flex-1 h-8 text-xs" onClick={() => router.push(`/draft/${draft.draftId}/results`)}>
                          <Trophy className="h-3 w-3 mr-1" />
                          Results
                        </Button>
                      )}
                      {draft.status !== 'completed' && draft.status !== 'active' && (
                        <Button size="sm" variant="secondary" className="flex-1 h-8 text-xs" onClick={() => handleResumeDraft(draft.draftId)}>
                          Open
                        </Button>
                      )}
                      {draft.isHost && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDeleteDraft(draft.draftId, e)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-lg border bg-card space-y-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-4.5 w-4.5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Real-Time Drafting</h3>
            <p className="text-xs text-muted-foreground">Instant sync across all participants with WebSocket technology.</p>
          </div>
          <div className="p-5 rounded-lg border bg-card space-y-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Trophy className="h-4.5 w-4.5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Official Formats</h3>
            <p className="text-xs text-muted-foreground">VGC, Smogon, and custom formats with automatic cost calculation.</p>
          </div>
          <div className="p-5 rounded-lg border bg-card space-y-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-4.5 w-4.5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Multiplayer Ready</h3>
            <p className="text-xs text-muted-foreground">2-8 teams with spectator mode and live activity feed.</p>
          </div>
        </div>

        {/* Pokemon Browser */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Browse Pokemon</h2>
            <div className="flex items-center gap-2 ml-auto">
              <Select value={selectedFormatId} onValueChange={setSelectedFormatId}>
                <SelectTrigger className="w-[200px] h-9 text-sm">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  {POKEMON_FORMATS.map((format) => (
                    <SelectItem key={format.id} value={format.id}>
                      {format.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline" className="text-xs whitespace-nowrap">
                Gen {selectedFormat.generation}
              </Badge>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent"></div>
                <p className="mt-3 text-sm text-muted-foreground">Loading Pokemon...</p>
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
        </div>

        {/* Modals */}
        <PokemonDetailsModal
          pokemon={detailsPokemon}
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          onSelect={handleInitiateDraft}
          isDrafted={detailsPokemon ? draftedPokemon.some(p => p.id === detailsPokemon.id) : false}
        />

        <DraftConfirmationModal
          pokemon={confirmationPokemon}
          isOpen={isConfirmationOpen}
          onClose={() => setIsConfirmationOpen(false)}
          onConfirm={handleConfirmDraft}
          currentBudget={remainingBudget}
          draftedCount={draftedPokemon.length}
          maxDrafts={maxTeamSize}
        />

        <DraftSummaryPanel
          draftedPokemon={draftedPokemon}
          totalBudget={totalBudget}
          maxTeamSize={maxTeamSize}
          onUndoLast={handleUndoLast}
          onResetDraft={handleResetDraft}
        />
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        redirectTo={authRedirectTo}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset Draft"
        description="Are you sure you want to reset your entire draft? This cannot be undone."
        confirmLabel="Reset Draft"
        variant="destructive"
        onConfirm={() => {
          setDraftedPokemon([])
          setResetConfirmOpen(false)
        }}
      />

      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}
        title="Delete Draft"
        description="Delete this draft permanently? This will remove the draft for all participants and cannot be undone."
        confirmLabel="Delete Draft"
        variant="destructive"
        onConfirm={() => {
          if (deleteConfirm) {
            executeDeleteDraft(deleteConfirm.draftId)
            setDeleteConfirm(null)
          }
        }}
      />
    </SidebarLayout>
  )
}
