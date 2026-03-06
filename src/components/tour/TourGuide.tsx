'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, ChevronLeft, ChevronRight, Search, Sparkles } from 'lucide-react'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, formatPokemonName } from '@/utils/pokemon'

// ─── Popular Pokemon for the picker ─────────────────────────────────────────

const POPULAR_POKEMON = [
  { id: 25, name: 'pikachu' },
  { id: 6, name: 'charizard' },
  { id: 1, name: 'bulbasaur' },
  { id: 7, name: 'squirtle' },
  { id: 133, name: 'eevee' },
  { id: 94, name: 'gengar' },
  { id: 448, name: 'lucario' },
  { id: 445, name: 'garchomp' },
  { id: 700, name: 'sylveon' },
  { id: 197, name: 'umbreon' },
  { id: 282, name: 'gardevoir' },
  { id: 778, name: 'mimikyu' },
  { id: 149, name: 'dragonite' },
  { id: 658, name: 'greninja' },
  { id: 39, name: 'jigglypuff' },
  { id: 143, name: 'snorlax' },
  { id: 248, name: 'tyranitar' },
  { id: 59, name: 'arcanine' },
  { id: 468, name: 'togekiss' },
  { id: 257, name: 'blaziken' },
  { id: 376, name: 'metagross' },
  { id: 196, name: 'espeon' },
  { id: 359, name: 'absol' },
  { id: 52, name: 'meowth' },
  { id: 54, name: 'psyduck' },
  { id: 373, name: 'salamence' },
  { id: 959, name: 'tinkaton' },
  { id: 183, name: 'marill' },
  { id: 35, name: 'clefairy' },
  { id: 131, name: 'lapras' },
]

// ─── Tour step definitions ───────────────────────────────────────────────────

export interface TourStep {
  message: (pokemonName: string) => string
  targetId: string | null
}

export const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    message: (name) =>
      `Hi! I'm ${name}, and I'll be your guide today! Welcome to Pokemon Draft League — let me show you around the dashboard!`,
    targetId: null,
  },
  {
    message: () =>
      `These are your stats at a glance: total drafts, active drafts, leagues you've joined, and your overall win-loss record.`,
    targetId: 'tour-stats',
  },
  {
    message: () =>
      `When you're in a league, your weekly matchups show up here. Click any matchup to scout your opponent's team!`,
    targetId: 'tour-matches',
  },
  {
    message: () =>
      `Your leagues are listed here with standings, win-loss records, and rankings. Leagues are created after a draft finishes!`,
    targetId: 'tour-leagues',
  },
  {
    message: () =>
      `This is your Drafts section. You can track active drafts, see progress, and jump back into any room with one click.`,
    targetId: 'tour-drafts',
  },
  {
    message: () =>
      `Hit "New Draft" to create a draft room. Choose snake or auction format, set a budget, and invite friends with a 6-letter room code!`,
    targetId: 'tour-new-draft',
  },
  {
    message: () =>
      `Use the sidebar to navigate: join a draft, watch live rooms, view your history, or tweak your settings.`,
    targetId: null,
  },
  {
    message: (name) =>
      `That's everything! Go build an unstoppable team, trainer. I'll be cheering you on! — ${name}`,
    targetId: null,
  },
]

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_FAV = 'tour:favoritePokemon'
const LS_DONE = 'tour:completed'

function getSavedPokemon(): { id: number; name: string } | null {
  try {
    const raw = localStorage.getItem(LS_FAV)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function savePokemon(p: { id: number; name: string }) {
  try {
    localStorage.setItem(LS_FAV, JSON.stringify(p))
  } catch {}
}

function markTourDone() {
  try {
    localStorage.setItem(LS_DONE, '1')
  } catch {}
}

// ─── Highlight helper ────────────────────────────────────────────────────────

function highlightElement(id: string | null) {
  // Remove any existing highlights
  document.querySelectorAll('.tour-highlight-active').forEach((el) => {
    el.classList.remove('tour-highlight-active')
  })
  if (!id) return
  const el = document.getElementById(id)
  if (el) {
    el.classList.add('tour-highlight-active')
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// ─── Sprite image helper ──────────────────────────────────────────────────────

function PokemonSprite({
  pokemon,
  size = 64,
  className = '',
}: {
  pokemon: { id: number; name: string }
  size?: number
  className?: string
}) {
  const src = getPokemonAnimatedUrl(String(pokemon.id), pokemon.name)
  const backup = getPokemonAnimatedBackupUrl(String(pokemon.id))
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={formatPokemonName(pokemon.name)}
      width={size}
      height={size}
      className={`pixelated ${className}`}
      style={{ imageRendering: 'pixelated' }}
      onError={(e) => {
        const t = e.target as HTMLImageElement
        if (!t.dataset.fallback) {
          t.dataset.fallback = '1'
          t.src = backup
        }
      }}
    />
  )
}

// ─── Pokemon Picker ──────────────────────────────────────────────────────────

function PokemonPicker({
  onSelect,
  onSkip,
}: {
  onSelect: (p: { id: number; name: string }) => void
  onSkip: () => void
}) {
  const [query, setQuery] = useState('')
  const filtered = query.trim()
    ? POPULAR_POKEMON.filter((p) => p.name.includes(query.toLowerCase().trim()))
    : POPULAR_POKEMON

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-card border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Choose Your Guide</h2>
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Pick your favourite Pokemon &mdash; they&apos;ll walk you through the app!
          </p>
        </div>

        {/* Search */}
        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search Pokemon..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="px-4 pb-4 max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">
              No Pokemon found. Try a different name!
            </p>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-1">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="flex flex-col items-center p-2 rounded-xl hover:bg-muted transition-colors group"
                  title={formatPokemonName(p.name)}
                >
                  <PokemonSprite pokemon={p} size={48} className="group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] text-muted-foreground mt-1 leading-none capitalize truncate w-full text-center">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex justify-end">
          <button
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip tour
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mascot bubble ───────────────────────────────────────────────────────────

function MascotBubble({
  pokemon,
  message,
  step,
  totalSteps,
  onNext,
  onPrev,
  onClose,
}: {
  pokemon: { id: number; name: string }
  message: string
  step: number
  totalSteps: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}) {
  const isLast = step === totalSteps - 1

  return (
    <div className="fixed bottom-6 right-4 z-[200] flex flex-col items-end gap-2 max-w-xs sm:max-w-sm pointer-events-none">
      {/* Speech bubble */}
      <div className="pointer-events-auto bg-card border rounded-2xl shadow-xl p-4 w-full relative">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close tour"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step indicator */}
        <div className="flex gap-1 mb-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === step ? 'bg-primary flex-[2]' : 'bg-muted flex-1'
              }`}
            />
          ))}
        </div>

        {/* Message */}
        <p className="text-sm leading-relaxed pr-4">{message}</p>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrev}
            disabled={step === 0}
            className="h-7 px-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          {isLast ? (
            <Button size="sm" onClick={onClose} className="h-7">
              Finish!
            </Button>
          ) : (
            <Button size="sm" onClick={onNext} className="h-7">
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Pokemon sprite with bounce */}
      <div className="pointer-events-none animate-bounce-slow self-end mr-2">
        <PokemonSprite pokemon={pokemon} size={80} />
      </div>
    </div>
  )
}

// ─── Main TourGuide component ─────────────────────────────────────────────────

interface TourGuideProps {
  steps: TourStep[]
  isOpen: boolean
  onClose: () => void
}

export function TourGuide({ steps, isOpen, onClose }: TourGuideProps) {
  const [phase, setPhase] = useState<'picker' | 'touring'>('picker')
  const [pokemon, setPokemon] = useState<{ id: number; name: string } | null>(null)
  const [step, setStep] = useState(0)
  const prevIsOpen = useRef(false)

  // When tour opens, check if we already have a saved pokemon
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      const saved = getSavedPokemon()
      if (saved) {
        setPokemon(saved)
        setPhase('touring')
        setStep(0)
      } else {
        setPhase('picker')
        setStep(0)
      }
    }
    prevIsOpen.current = isOpen
  }, [isOpen])

  // Apply highlight when step changes
  useEffect(() => {
    if (isOpen && phase === 'touring') {
      highlightElement(steps[step]?.targetId ?? null)
    }
    return () => {
      highlightElement(null)
    }
  }, [isOpen, phase, step, steps])

  const handleSelect = useCallback((p: { id: number; name: string }) => {
    savePokemon(p)
    setPokemon(p)
    setPhase('touring')
    setStep(0)
  }, [])

  const handleClose = useCallback(() => {
    highlightElement(null)
    markTourDone()
    onClose()
  }, [onClose])

  const handleNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, steps.length - 1))
  }, [steps.length])

  const handlePrev = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0))
  }, [])

  if (!isOpen) return null

  if (phase === 'picker') {
    return <PokemonPicker onSelect={handleSelect} onSkip={handleClose} />
  }

  if (!pokemon) return null

  const currentStep = steps[step]
  const message = currentStep.message(formatPokemonName(pokemon.name))

  return (
    <MascotBubble
      pokemon={pokemon}
      message={message}
      step={step}
      totalSteps={steps.length}
      onNext={handleNext}
      onPrev={handlePrev}
      onClose={handleClose}
    />
  )
}
