'use client'

import { useState, useEffect } from 'react'
import { usePokemonListByFormat } from '@/hooks/usePokemon'
import PokemonGrid from '@/components/pokemon/PokemonGrid'
import PokemonDetailsModal from '@/components/pokemon/PokemonDetailsModal'
import DraftConfirmationModal from '@/components/draft/DraftConfirmationModal'
import DraftSummaryPanel from '@/components/draft/DraftSummaryPanel'
import { Pokemon } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DraftService } from '@/lib/draft-service'
import { UserSessionService, type DraftParticipation } from '@/lib/user-session'
import { useRouter } from 'next/navigation'
import { Clock, Play, Trophy, Users, Sparkles, Crown, TrendingUp, Settings } from 'lucide-react'
import { POKEMON_FORMATS, getFormatById, DEFAULT_FORMAT } from '@/lib/formats'

export default function Home() {
  const router = useRouter()
  const [detailsPokemon, setDetailsPokemon] = useState<Pokemon | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [confirmationPokemon, setConfirmationPokemon] = useState<Pokemon | null>(null)
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)
  const [draftedPokemon, setDraftedPokemon] = useState<Pokemon[]>([])
  const [myDrafts, setMyDrafts] = useState<DraftParticipation[]>([])
  const [selectedFormatId, setSelectedFormatId] = useState<string>(DEFAULT_FORMAT)

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
  const { data: pokemon, isLoading, error } = usePokemonListByFormat(selectedFormatId, true)

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 pokemon-bg transition-colors duration-500">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="relative text-center mb-8">
          {/* Theme Toggle */}
          <div className="absolute top-0 right-0">
            <ThemeToggle />
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent mb-4">
            Pokémon Draft League
          </h1>
          <p className="text-xl text-slate-700 dark:text-slate-300 mb-6 max-w-2xl mx-auto transition-colors duration-300">
            Master your strategy in real-time competitive Pokémon drafting with {selectedFormat.name} format
          </p>

          {pokemon && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
              <div className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg p-4 text-center shadow-lg">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Available</span>
                </div>
                <div className="text-2xl font-bold">
                  {pokemon.filter(p => !draftedPokemon.find(d => d.id === p.id)).length}
                </div>
                <div className="text-xs opacity-90">Pokémon to draft</div>
              </div>

              <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-4 text-center shadow-lg">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Crown className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Drafted</span>
                </div>
                <div className="text-2xl font-bold">
                  {draftedPokemon.length}/{maxTeamSize}
                </div>
                <div className="text-xs opacity-90">Team slots used</div>
              </div>

              <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg p-4 text-center shadow-lg">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Budget</span>
                </div>
                <div className="text-2xl font-bold">
                  {remainingBudget}
                </div>
                <div className="text-xs opacity-90">Points remaining</div>
              </div>
            </div>
          )}
        </div>


        {/* Multiplayer Section */}
        <div className="mb-6 p-6 bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-cyan-500/10 dark:from-purple-500/20 dark:via-blue-500/20 dark:to-cyan-500/20 rounded-lg border border-purple-200 dark:border-purple-700">
          <h2 className="text-xl font-bold mb-3 text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Multiplayer Draft
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Create or join a real-time multiplayer draft with your friends. Experience competitive Pokémon drafting with turn-based selection and live updates.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={() => window.location.href = '/create-draft'}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
            >
              Create Draft Room
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const code = prompt('Enter room code:')
                if (code) {
                  window.location.href = `/join-draft?code=${code.toUpperCase()}`
                }
              }}
              className="border-purple-300 dark:border-purple-600 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
            >
              Join Draft Room
            </Button>
          </div>
        </div>

        {/* My Drafts Section */}
        {myDrafts.length > 0 && (
          <div className="mb-6 p-6 bg-gradient-to-r from-green-500/10 via-blue-500/10 to-purple-500/10 dark:from-green-500/20 dark:via-blue-500/20 dark:to-purple-500/20 rounded-lg border border-green-200 dark:border-green-700">
            <h2 className="text-xl font-bold mb-3 text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Trophy className="h-6 w-6" />
              My Draft Rooms
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Resume your active drafts or view completed games. Your draft history is saved locally.
            </p>
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
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-xl shadow-xl border border-white/50 dark:border-slate-700/50 p-6">
          {/* Format Selector */}
          <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">
                  Draft Format
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
                        <div className="flex flex-col items-start">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{format.name}</span>
                            <Badge 
                              variant={format.meta.isOfficial ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {format.category.toUpperCase()}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{format.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300">
                <Badge variant="outline">
                  {selectedFormat.gameType === 'doubles' ? 'VGC Doubles' : 'Smogon Singles'}
                </Badge>
                <Badge variant="outline">
                  Gen {selectedFormat.generation}
                </Badge>
              </div>
            </div>
            <div className="mt-3 text-sm text-purple-800 dark:text-purple-200">
              <p>{selectedFormat.description}</p>
              {selectedFormat.meta.isOfficial && (
                <p className="mt-1 text-xs text-purple-600 dark:text-purple-400">
                  ✓ Official {selectedFormat.meta.season || 'Tournament'} Format
                </p>
              )}
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

        {/* Instructions */}
        <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
          <h3 className="text-lg font-semibold mb-3 text-blue-900 dark:text-blue-100 flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            How to Draft Pokémon
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-blue-800 dark:text-blue-200">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600 dark:text-blue-400">1.</span>
                <span>Click any Pokémon card to view detailed stats and moves</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600 dark:text-blue-400">2.</span>
                <span>Review the Pokémon&apos;s abilities, moves, and draft cost</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600 dark:text-blue-400">3.</span>
                <span>Click &quot;🔥 Draft [Pokemon]&quot; to add to your team</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600 dark:text-blue-400">4.</span>
                <span>Confirm your choice in the draft confirmation modal</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600 dark:text-blue-400">5.</span>
                <span>Track your progress in the floating draft panel</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-blue-600 dark:text-blue-400">6.</span>
                <span>Use filters to find Pokémon by type, cost, or stats</span>
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="mt-6 p-6 bg-green-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-green-900">
            Next: Set Up Supabase
          </h3>
          <p className="text-green-800 mb-3">
            To enable real-time drafting features, you&apos;ll need to configure Supabase:
          </p>
          <ol className="space-y-1 text-green-800 list-decimal list-inside">
            <li>Create a Supabase project at supabase.com</li>
            <li>Update your .env.local file with your project credentials</li>
            <li>Run the database schema from the README</li>
            <li>Start creating and joining draft rooms!</li>
          </ol>
        </div>
      </div>
    </div>
  )
}