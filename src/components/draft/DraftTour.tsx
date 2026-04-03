'use client'

import { useEffect, useState, useCallback } from 'react'
import { TourGuide, type TourStep } from '@/components/tour/TourGuide'

const LS_KEY = 'draft-tour-completed'

const DRAFT_TOUR_STEPS: TourStep[] = [
  {
    message: (name) =>
      `Hey, I'm ${name}! Welcome to your draft room. Let me show you around — it'll only take a minute.`,
    targetId: null,
  },
  {
    message: () =>
      `This is the draft progress bar. It shows whose turn it is, the pick timer, and how far along the draft is. Keep an eye on the countdown — when it hits zero, the turn auto-skips.`,
    targetId: 'tour-draft-progress',
  },
  {
    message: () =>
      `Here's the Pokemon pool. Browse, search by name or type, and filter to find the perfect pick. Tap any Pokemon to see its stats or draft it when it's your turn.`,
    targetId: 'tour-pokemon-grid',
  },
  {
    message: () =>
      `These are the team rosters. Your team is highlighted in blue. Watch your budget and keep an eye on what opponents are picking in real-time.`,
    targetId: 'tour-team-rosters',
  },
  {
    message: (name) =>
      `Finally, your wishlist. Queue up Pokemon you want in priority order — if your timer runs out, your top available pick is auto-selected. You're all set, trainer! Good luck! - ${name}`,
    targetId: 'tour-wishlist',
  },
]

export function DraftTour() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    try {
      const done = localStorage.getItem(LS_KEY)
      if (!done) {
        // Small delay to let the draft page render its elements first
        const timer = setTimeout(() => setIsOpen(true), 1500)
        return () => clearTimeout(timer)
      }
    } catch {
      // localStorage unavailable
    }
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    try {
      localStorage.setItem(LS_KEY, '1')
    } catch {
      // localStorage unavailable
    }
  }, [])

  return <TourGuide steps={DRAFT_TOUR_STEPS} isOpen={isOpen} onClose={handleClose} />
}
