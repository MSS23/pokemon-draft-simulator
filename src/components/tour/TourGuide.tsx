'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Search, Sparkles, Loader2 } from 'lucide-react'
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
      `Hey, I'm ${name}! I'll be your guide today. Let me show you around Pokemon Draft League — it only takes a minute!`,
    targetId: null,
  },
  {
    message: () =>
      `Here's your stats hub. Total drafts, active rooms, leagues you've joined, and your overall win-loss record, all at a glance.`,
    targetId: 'tour-stats',
  },
  {
    message: () =>
      `Your weekly matchups live here. Click any card to scout your opponent's full team before the battle!`,
    targetId: 'tour-matches',
  },
  {
    message: () =>
      `These are your leagues. Standings, W/L records, and rankings — all updated live after every match result.`,
    targetId: 'tour-leagues',
  },
  {
    message: () =>
      `Your draft command center. Track active rooms, see pick progress, and jump back into any draft with one click.`,
    targetId: 'tour-drafts',
  },
  {
    message: () =>
      `Hit "New Draft" to create a room. Pick snake or auction format, set a budget, and share the 6-letter code with friends!`,
    targetId: 'tour-new-draft',
  },
  {
    message: () =>
      `Use the sidebar to get around: join a room by code, spectate live drafts, check your history, or update settings.`,
    targetId: null,
  },
  {
    message: (name) =>
      `You're all set, trainer! Time to build an unstoppable team. I'll be cheering you on every pick. — ${name}`,
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

// ─── PokeAPI search ───────────────────────────────────────────────────────────

async function fetchPokemonByName(name: string): Promise<{ id: number; name: string } | null> {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${name.toLowerCase().trim()}`)
    if (!res.ok) return null
    const data = await res.json()
    return { id: data.id as number, name: data.name as string }
  } catch {
    return null
  }
}

// ─── Typewriter hook ──────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 16) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const skip = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setDisplayed(text)
    setDone(true)
  }, [text])

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let index = 0

    intervalRef.current = setInterval(() => {
      index++
      setDisplayed(text.slice(0, index))
      if (index >= text.length) {
        setDone(true)
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }, speed)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [text, speed])

  return { displayed, done, skip }
}

// ─── Pokemon Confirm screen ───────────────────────────────────────────────────

function PokemonConfirm({
  pokemon,
  onConfirm,
  onBack,
}: {
  pokemon: { id: number; name: string }
  onConfirm: () => void
  onBack: () => void
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-card border-2 border-primary/20 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden tour-slide-up">
        <div className="bg-gradient-to-br from-primary/15 to-primary/5 pt-10 pb-6 flex flex-col items-center">
          <div className="tour-pop">
            <PokemonSprite pokemon={pokemon} size={120} />
          </div>
          <h2 className="text-2xl font-bold mt-3 capitalize">{formatPokemonName(pokemon.name)}</h2>
          <p className="text-sm text-muted-foreground mt-1">is ready to guide you!</p>
        </div>
        <div className="p-6 flex flex-col gap-3">
          <p className="text-center text-sm text-muted-foreground">
            {formatPokemonName(pokemon.name)} will walk you through all the features of Pokemon Draft League.
          </p>
          <Button onClick={onConfirm} size="lg" className="w-full gap-2">
            <Sparkles className="h-4 w-4" />
            Start the Tour!
          </Button>
          <Button variant="ghost" onClick={onBack} size="sm" className="w-full text-muted-foreground">
            Choose a different Pokemon
          </Button>
        </div>
      </div>
    </div>
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
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<{ id: number; name: string } | null | 'not-found'>(null)
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trimmed = query.trim().toLowerCase()
  const localMatches = trimmed
    ? POPULAR_POKEMON.filter((p) => p.name.includes(trimmed))
    : POPULAR_POKEMON

  // When local matches are empty and user has typed 3+ chars, search PokeAPI
  useEffect(() => {
    if (selected) return
    if (!trimmed || trimmed.length < 3 || localMatches.length > 0) {
      setSearchResult(null)
      return
    }
    setSearching(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const result = await fetchPokemonByName(trimmed)
      setSearchResult(result ?? 'not-found')
      setSearching(false)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmed, localMatches.length, selected])

  // Show confirm screen after selection
  if (selected) {
    return (
      <PokemonConfirm
        pokemon={selected}
        onConfirm={() => onSelect(selected)}
        onBack={() => setSelected(null)}
      />
    )
  }

  const showApiResult = localMatches.length === 0 && trimmed.length >= 3
  const apiPokemon = showApiResult && searchResult && searchResult !== 'not-found' ? [searchResult] : []
  const displayList = showApiResult ? apiPokemon : localMatches

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative bg-card border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden tour-slide-up">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary/15 to-transparent px-6 pt-6 pb-4 text-center">
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
            {searching ? (
              <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            ) : (
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            )}
            <Input
              placeholder="Search any Pokemon..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          {showApiResult && !searching && (
            <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
              {searchResult === 'not-found'
                ? 'No Pokemon found — try the exact name (e.g. "garchomp")'
                : 'Showing result from PokéAPI'}
            </p>
          )}
        </div>

        {/* Grid */}
        <div className="px-4 pb-4 max-h-72 overflow-y-auto">
          {searching && localMatches.length === 0 ? (
            <div className="flex items-center justify-center py-10 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : displayList.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">
              {trimmed.length >= 3
                ? 'No Pokemon found — try the exact English name'
                : 'No Pokemon found. Try a different name!'}
            </p>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-1">
              {displayList.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="flex flex-col items-center p-2 rounded-xl hover:bg-primary/10 active:scale-95 transition-all duration-150 group"
                  title={formatPokemonName(p.name)}
                >
                  <PokemonSprite pokemon={p} size={48} className="group-hover:scale-110 transition-transform duration-150" />
                  <span className="text-[10px] text-muted-foreground mt-1 leading-none capitalize truncate w-full text-center">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex justify-center border-t border-border/40 pt-3">
          <button
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Surprise me
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
  const isFirst = step === 0
  const isLast = step === totalSteps - 1
  const { displayed, done, skip } = useTypewriter(message)

  // Click bubble: skip typewriter if running, otherwise advance
  const handleAdvance = useCallback(() => {
    if (!done) {
      skip()
    } else if (isLast) {
      onClose()
    } else {
      onNext()
    }
  }, [done, skip, isLast, onClose, onNext])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        handleAdvance()
      }
      if (e.key === 'ArrowRight' && done && !isLast) onNext()
      if (e.key === 'ArrowLeft' && done && step > 0) onPrev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleAdvance, done, isLast, onNext, onPrev, onClose, step])

  const stepLabel = isFirst ? 'Welcome!' : isLast ? 'Last stop!' : `Step ${step + 1} of ${totalSteps}`

  return (
    <div className="fixed bottom-6 right-4 z-[200] flex flex-col items-end pointer-events-none">
      {/* Speech bubble */}
      <div
        className="pointer-events-auto bg-card border-2 border-primary/25 rounded-2xl shadow-2xl p-4 w-[300px] sm:w-[320px] relative cursor-pointer select-none tour-slide-up"
        onClick={handleAdvance}
        role="dialog"
        aria-label={`Tour step ${step + 1} of ${totalSteps}`}
      >
        {/* Close button */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
          className="absolute top-2.5 right-2.5 z-10 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted p-0.5"
          aria-label="Close tour"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Step label + skip hint */}
        <div className="flex items-center justify-between mb-2 pr-6">
          <span className="text-[11px] font-semibold text-primary/80 uppercase tracking-wide">
            {stepLabel}
          </span>
          {!done && (
            <span className="text-[10px] text-muted-foreground/70 italic">click to skip</span>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex gap-1 mb-3">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i < step
                  ? 'bg-primary/40 flex-1'
                  : i === step
                  ? 'bg-primary flex-[2.5]'
                  : 'bg-muted flex-1'
              }`}
            />
          ))}
        </div>

        {/* Typewriter message */}
        <p className="text-sm leading-relaxed min-h-[3.75rem]">
          {displayed}
          {!done && <span className="tour-cursor" aria-hidden />}
        </p>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/40">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onPrev() }}
            disabled={step === 0 || !done}
            className="h-7 px-2 text-xs gap-1"
          >
            &larr; Back
          </Button>

          {isLast ? (
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); onClose() }}
              disabled={!done}
              className="h-7 text-xs gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Let&apos;s Draft!
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); if (done) onNext() }}
              disabled={!done}
              className="h-7 text-xs gap-1"
            >
              Next &rarr;
            </Button>
          )}
        </div>

        {/* Bubble tail pointing down toward sprite */}
        <div
          className="absolute -bottom-[9px] right-7 w-[18px] h-[18px] bg-card border-r-2 border-b-2 border-primary/25 rotate-45"
          aria-hidden
        />
      </div>

      {/* Pokemon sprite — key forces pop animation replay on step change */}
      <div key={step} className="pointer-events-none self-end mr-4 mt-1.5 tour-pop-sprite">
        <PokemonSprite pokemon={pokemon} size={96} />
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

  const handleSkip = useCallback(() => {
    const random = POPULAR_POKEMON[Math.floor(Math.random() * POPULAR_POKEMON.length)]
    savePokemon(random)
    setPokemon(random)
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
    return <PokemonPicker onSelect={handleSelect} onSkip={handleSkip} />
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
