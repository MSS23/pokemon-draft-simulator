'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { getTeamColor } from '@/utils/team-colors'
import { Crown, Sparkles } from 'lucide-react'

interface Team {
  id: string
  name: string
  userName: string
  draftOrder: number
}

interface DraftOrderRevealProps {
  teams: Team[]
  userTeamId: string | null
  onComplete: () => void
}

export default function DraftOrderReveal({ teams, userTeamId, onComplete }: DraftOrderRevealProps) {
  const [phase, setPhase] = useState<'shuffling' | 'revealing' | 'done'>('shuffling')
  const [revealedCount, setRevealedCount] = useState(0)
  const [shuffleDisplay, setShuffleDisplay] = useState<Team[]>([])

  const sortedTeams = [...teams].sort((a, b) => a.draftOrder - b.draftOrder)

  // Shuffling animation - rapidly swap displayed names
  useEffect(() => {
    if (phase !== 'shuffling') return

    const shuffled = [...teams]
    let tick = 0
    const interval = setInterval(() => {
      // Fisher-Yates visual shuffle
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      setShuffleDisplay([...shuffled])
      tick++

      if (tick >= 12) {
        clearInterval(interval)
        setShuffleDisplay(sortedTeams)
        setPhase('revealing')
      }
    }, 120)

    return () => clearInterval(interval)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reveal animation - show each slot one by one
  useEffect(() => {
    if (phase !== 'revealing') return

    const interval = setInterval(() => {
      setRevealedCount(prev => {
        const next = prev + 1
        if (next >= sortedTeams.length) {
          clearInterval(interval)
          setTimeout(() => setPhase('done'), 800)
        }
        return next
      })
    }, 400)

    return () => clearInterval(interval)
  }, [phase, sortedTeams.length])

  // Auto-dismiss after done
  useEffect(() => {
    if (phase === 'done') {
      const timer = setTimeout(onComplete, 1500)
      return () => clearTimeout(timer)
    }
  }, [phase, onComplete])

  const handleSkip = useCallback(() => {
    onComplete()
  }, [onComplete])

  const displayTeams = phase === 'shuffling' ? shuffleDisplay : sortedTeams

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-muted/30 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            <h2 className="text-lg font-bold">Draft Order</h2>
            <Sparkles className="h-5 w-5 text-yellow-500" />
          </div>
          <p className="text-xs text-muted-foreground">
            {phase === 'shuffling' ? 'Randomizing...' : phase === 'revealing' ? 'Revealing order...' : 'Good luck!'}
          </p>
        </div>

        {/* Order List */}
        <div className="p-4 space-y-1.5">
          {displayTeams.map((team, idx) => {
            const isRevealed = phase !== 'shuffling' && idx < revealedCount
            const isDone = phase === 'done'
            const isUser = team.id === userTeamId
            const color = getTeamColor(idx)

            return (
              <div
                key={phase === 'shuffling' ? `shuffle-${idx}` : team.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-300',
                  phase === 'shuffling' && 'border-transparent bg-muted/50',
                  isRevealed && !isUser && 'border-border bg-muted/30',
                  isRevealed && isUser && 'border-primary/50 bg-primary/10 ring-1 ring-primary/30',
                  isDone && isUser && 'border-primary bg-primary/15 ring-2 ring-primary/40',
                  !isRevealed && phase !== 'shuffling' && 'border-transparent bg-muted/20 opacity-40'
                )}
              >
                {/* Position Number */}
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300',
                  isRevealed || phase === 'shuffling'
                    ? `${color.bg} ${color.text} border ${color.border}`
                    : 'bg-muted text-muted-foreground'
                )}>
                  {idx + 1}
                </div>

                {/* Team Name */}
                <div className={cn(
                  'flex-1 min-w-0 transition-all duration-300',
                  phase === 'shuffling' && 'blur-[2px]'
                )}>
                  <span className={cn(
                    'text-sm font-semibold truncate block',
                    isUser && isRevealed && 'text-primary'
                  )}>
                    {team.name}
                  </span>
                  {isRevealed && (
                    <span className="text-[11px] text-muted-foreground truncate block">
                      {team.userName}
                    </span>
                  )}
                </div>

                {/* First Pick Crown */}
                {idx === 0 && (isRevealed || isDone) && (
                  <Crown className="h-4 w-4 text-yellow-500 shrink-0" />
                )}

                {/* "You" badge */}
                {isUser && (isRevealed || isDone) && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary shrink-0">
                    You
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4">
          <button
            onClick={handleSkip}
            className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-colors"
          >
            {phase === 'done' ? 'Continue to draft' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  )
}
