'use client'

import { useEffect, useState, useCallback } from 'react'
import { TourGuide, type TourStep } from '@/components/tour/TourGuide'

const LS_KEY = 'draft-tour-completed'

const DRAFT_TOUR_STEPS: TourStep[] = [
  {
    message: (name) =>
      `Hey, I'm ${name}! Welcome to your draft room. Let me show you around so you know where everything is.`,
    targetId: null,
  },
  {
    message: () =>
      `This is the draft progress bar. It shows whose turn it is, the pick timer countdown, and how far along the draft is. When the timer hits zero, the turn auto-skips.`,
    targetId: 'tour-draft-progress',
  },
  {
    message: () =>
      `Here are the team rosters. Your team is highlighted. Watch your budget and see what everyone else is picking in real-time.`,
    targetId: 'tour-team-rosters',
  },
  {
    message: () =>
      `This is your wishlist. Queue up Pokemon you want in priority order. If your timer runs out, your top available wishlist pick is auto-selected.`,
    targetId: 'tour-wishlist',
  },
  {
    message: () =>
      `The Pokemon pool is down here. Browse, search, and filter all available Pokemon. Click one to see its details or draft it when it's your turn.`,
    targetId: 'tour-pokemon-grid',
  },
  {
    message: () =>
      `Use the activity button in the top right to see what other players are picking in real-time. It's a great way to keep track of the draft.`,
    targetId: 'tour-activity-btn',
  },
  {
    message: (name) =>
      `You're all set! Time to build an unstoppable team. Good luck, trainer! - ${name}`,
    targetId: null,
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
