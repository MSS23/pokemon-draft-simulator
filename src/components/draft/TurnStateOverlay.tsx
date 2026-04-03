/**
 * TurnStateOverlay — shows a radial flash when the turn transitions to the user.
 *
 * IMPORTANT: This component must NOT use useDraftStore or any Zustand selector.
 * It receives isUserTurn as a prop from page.tsx. This prevents the infinite
 * re-render bug documented in useWishlistSync.ts (2026-03-04).
 *
 * Uses only compositor-friendly properties (opacity via turnFlashFade keyframe,
 * position: fixed). No layout-affecting animations. Satisfies TURN-04.
 */
'use client'

import { useEffect, useRef, useState } from 'react'

interface TurnStateOverlayProps {
  isUserTurn: boolean
}

export function TurnStateOverlay({ isUserTurn }: TurnStateOverlayProps) {
  const [visible, setVisible] = useState(false)
  const prevIsUserTurnRef = useRef(isUserTurn)

  useEffect(() => {
    // Only fire on false -> true transition, not on initial mount if already on turn
    if (isUserTurn && !prevIsUserTurnRef.current) {
      setVisible(true)
      const timer = setTimeout(() => setVisible(false), 600)
      return () => clearTimeout(timer)
    }
    prevIsUserTurnRef.current = isUserTurn
  }, [isUserTurn])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-none"
      style={{
        background: 'radial-gradient(circle at center, rgba(74,222,128,0.25), transparent 70%)',
        animation: 'turnFlashFade 0.5s ease-out forwards',
      }}
      aria-hidden="true"
    />
  )
}
