'use client'

import { ReactNode } from 'react'

interface PageTransitionProps {
  children: ReactNode
  /** Optional key to trigger re-animation on route change */
  transitionKey?: string
}

/**
 * Simple page transition wrapper. Fade in + slight upward slide on mount.
 *
 * COST: previously used framer-motion for a trivial 200ms transition —
 * replaced with a CSS animation to drop the framer-motion footprint here.
 */
export function PageTransition({ children, transitionKey }: PageTransitionProps) {
  return (
    <div key={transitionKey} className="page-transition-in">
      {children}
      <style jsx>{`
        .page-transition-in {
          animation: page-transition-fade-in 200ms ease-out;
        }
        @keyframes page-transition-fade-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .page-transition-in {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}
