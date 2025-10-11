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
import { Clock, Play, Trophy, Users, Trash2 } from 'lucide-react'
import { POKEMON_FORMATS, getFormatById, DEFAULT_FORMAT } from '@/lib/formats'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from '@/components/auth/AuthModal'

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
        alert(result.error || 'Failed to resume draft')
      }
    } catch (error) {
      console.error('Error resuming draft:', error)
      alert('Failed to resume draft')
    }
  }

  const handleDeleteDraft = async (draftId: string, event: React.MouseEvent) => {
    event.stopPropagation()

    const confirmed = window.confirm('Delete this draft permanently? This will remove the draft for all participants and cannot be undone.')
    if (!confirmed) return

    try {
      // Optimistically remove from UI first
      setMyDrafts(prev => prev.filter(d => d.draftId !== draftId))

      // Delete from database
      await DraftService.deleteDraft(draftId)

      // Remove from local storage
      UserSessionService.removeDraftParticipation(draftId)

    } catch (error) {
      console.error('Error deleting draft:', error)

      // Revert UI on error by reloading from storage
      setMyDrafts(UserSessionService.getDraftParticipations())

      alert('Failed to delete draft. You may not have permission to delete this draft.')
    }
  }

  // Load user's drafts on component mount
  useEffect(() => {
    const drafts = UserSessionService.getDraftParticipations()
    setMyDrafts(drafts)
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <h1 className="text-2xl font-bold text-gray-900">Loading Pokémon...</h1>
          <p className="text-gray-600">
            Fetching the latest Pokémon data from PokéAPI...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Could not load live data</h1>
          <p className="text-gray-600 mb-4">
            There was an issue connecting to the Pokémon API. The app will continue with demo data.
          </p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-500">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent mb-3">
            Pokémon Draft League
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Real-time competitive Pokémon drafting with friends
          </p>
        </div>


        {/* Quick Actions */}
        <div className="mb-8 flex gap-4 justify-center flex-wrap">
          <Button
            onClick={() => {
              if (!user) {
                setAuthModalOpen(true)
                return
              }
              window.location.href = '/create-draft'
            }}
            size="lg"
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8"
          >
            <Users className="h-5 w-5 mr-2" />
            Create Draft Room
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              const code = prompt('Enter room code:')
              if (code) {
                window.location.href = `/join-draft?code=${code.toUpperCase()}`
              }
            }}
            className="px-8"
          >
            <Play className="h-5 w-5 mr-2" />
            Join Draft Room
          </Button>
        </div>

        {/* My Drafts Section */}
        {myDrafts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Trophy className="h-6 w-6" />
              My Drafts
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
                        className={`text-xs ${
                          draft.status === 'active'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : draft.status === 'completed'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                        }`}
                      >
                        {draft.status}
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const url = `/draft/${draft.draftId}`
                        navigator.clipboard.writeText(`${window.location.origin}${url}`)
                        alert('Draft link copied to clipboard!')
                      }}
                      className="flex-1"
                    >
                      Share
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => handleDeleteDraft(draft.draftId, e)}
                      className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                      title="Delete draft permanently"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
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
        )}

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
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{format.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {format.category.toUpperCase()}
                        </Badge>
                      </div>
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
        mode="signin"
      />
    </div>
  )
}