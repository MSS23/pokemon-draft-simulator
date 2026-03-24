'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Search, Sparkles, Loader2 } from 'lucide-react'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, formatPokemonName } from '@/utils/pokemon'

// ─── Tour event ───────────────────────────────────────────────────────────────

export const TOUR_OPEN_EVENT = 'poke-draft:tour:open'

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
      `Your dashboard is organized into three tabs. The Drafts tab is where you manage your draft rooms — create, join, or spectate live picks.`,
    targetId: 'tour-view-tabs',
  },
  {
    message: () =>
      `Switch to the Leagues tab for your round-robin seasons — standings, W/L records, streaks, and this week's matchups all live here.`,
    targetId: 'tour-view-tabs',
  },
  {
    message: () =>
      `The Tournaments tab is for knockout brackets. Create a tournament, invite players, and battle through single-elimination rounds!`,
    targetId: 'tour-view-tabs',
  },
  {
    message: () =>
      `Use the sidebar to quickly create or join a draft or tournament, watch live drafts, or jump into your active leagues.`,
    targetId: null,
  },
  {
    message: (name) =>
      `You're all set, trainer! Time to build an unstoppable team. I'll be cheering you on every pick. — ${name}`,
    targetId: null,
  },
]

export const CREATE_DRAFT_TOUR_STEPS: TourStep[] = [
  {
    message: (name) =>
      `Hi, I'm ${name}! This is where you create a draft room. Let me walk you through each section!`,
    targetId: null,
  },
  {
    message: () =>
      `Start here — set your name and team name. This is how other players will see you during the draft.`,
    targetId: 'tour-create-identity',
  },
  {
    message: () =>
      `Pick your draft settings: number of teams, draft type (snake points, tiered, or auction), time per pick, and how many Pokémon each team drafts.`,
    targetId: 'tour-create-settings',
  },
  {
    message: () =>
      `Choose a Pokémon format — this controls which Pokémon are legal. VGC Regulation H is the official competitive standard. You can also upload a custom CSV!`,
    targetId: 'tour-create-format',
  },
  {
    message: () =>
      `All done! Hit "Create Draft Room" to generate your room. You'll get a 6-letter code — share it with friends so they can join.`,
    targetId: 'tour-create-submit',
  },
]

export const JOIN_DRAFT_TOUR_STEPS: TourStep[] = [
  {
    message: (name) =>
      `Hey there! I'm ${name}. Joining a draft is easy — you just need the 6-letter room code from whoever created it.`,
    targetId: null,
  },
  {
    message: () =>
      `Type the room code here and click "Find Room." It'll load the draft details so you know exactly what you're joining.`,
    targetId: 'tour-join-code',
  },
  {
    message: () =>
      `Once the room loads, enter your team name here. You can also toggle "Join as Spectator" to watch without picking — great for scouting!`,
    targetId: 'tour-join-team',
  },
]

export const GENERIC_TOUR_STEPS: TourStep[] = [
  {
    message: (name) =>
      `Hi, I'm ${name}! Head to the Dashboard for a full guided tour of all the features — I'll walk you through everything there!`,
    targetId: null,
  },
]

const ROUTE_STEPS: Record<string, TourStep[]> = {
  '/dashboard': DASHBOARD_TOUR_STEPS,
  '/create-draft': CREATE_DRAFT_TOUR_STEPS,
  '/join-draft': JOIN_DRAFT_TOUR_STEPS,
}

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

// ─── Spotlight overlay ────────────────────────────────────────────────────────

function SpotlightOverlay({ targetId }: { targetId: string | null }) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  useEffect(() => {
    if (!targetId) {
      setRect(null)
      return
    }
    const el = document.getElementById(targetId)
    if (!el) {
      setRect(null)
      return
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const measure = () => {
      const found = document.getElementById(targetId)
      if (!found) return
      const r = found.getBoundingClientRect()
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height })
    }

    const timeout = setTimeout(measure, 380)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })

    return () => {
      clearTimeout(timeout)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure)
    }
  }, [targetId])

  if (!targetId || !rect) return null

  const pad = 12
  const x = Math.round(rect.left - pad)
  const y = Math.round(rect.top - pad)
  const w = Math.round(rect.width + pad * 2)
  const h = Math.round(rect.height + pad * 2)
  const r = 10

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 150, pointerEvents: 'none' }}>
      <svg
        style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <mask id="tour-spotlight">
            <rect width="100%" height="100%" fill="white" />
            <rect x={x} y={y} width={w} height={h} rx={r} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask="url(#tour-spotlight)" />
      </svg>
      {/* highlight ring */}
      <div
        style={{
          position: 'fixed',
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: r,
          boxShadow: '0 0 0 2px hsl(var(--primary)), 0 0 28px rgba(220,38,38,0.3)',
          transition: 'left 0.35s cubic-bezier(0.4,0,0.2,1), top 0.35s cubic-bezier(0.4,0,0.2,1), width 0.35s cubic-bezier(0.4,0,0.2,1), height 0.35s cubic-bezier(0.4,0,0.2,1)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

// ─── Highlight helper (scroll only — SpotlightOverlay handles visuals) ────────

function scrollToElement(id: string | null) {
  if (!id) return
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

  // Scroll to target when step changes (SpotlightOverlay handles the visual)
  useEffect(() => {
    if (isOpen && phase === 'touring') {
      scrollToElement(steps[step]?.targetId ?? null)
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
    <>
      <SpotlightOverlay targetId={currentStep.targetId} />
      <MascotBubble
        pokemon={pokemon}
        message={message}
        step={step}
        totalSteps={steps.length}
        onNext={handleNext}
        onPrev={handlePrev}
        onClose={handleClose}
      />
    </>
  )
}

// ─── GlobalTourGuide ──────────────────────────────────────────────────────────

export function GlobalTourGuide() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  // Auto-open on first login
  useEffect(() => {
    const pending = localStorage.getItem('tour:pendingStart')
    if (pending) {
      localStorage.removeItem('tour:pendingStart')
      const done = localStorage.getItem('tour:completed')
      if (!done) {
        localStorage.removeItem('tour:favoritePokemon') // force picker on first run
        setIsOpen(true)
      }
    }
  }, [])

  // Listen for manual trigger from ? button
  useEffect(() => {
    const handler = () => setIsOpen(true)
    window.addEventListener(TOUR_OPEN_EVENT, handler)
    return () => window.removeEventListener(TOUR_OPEN_EVENT, handler)
  }, [])

  const steps = useMemo(() => {
    for (const [route, routeSteps] of Object.entries(ROUTE_STEPS)) {
      if (pathname === route) return routeSteps
    }
    return GENERIC_TOUR_STEPS
  }, [pathname])

  return <TourGuide steps={steps} isOpen={isOpen} onClose={() => setIsOpen(false)} />
}
