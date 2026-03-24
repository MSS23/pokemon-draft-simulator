'use client'

import { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface PageTransitionProps {
  children: ReactNode
  /** Optional key to trigger re-animation on route change */
  transitionKey?: string
}

/**
 * Simple page transition wrapper.
 * Fades in with a slight upward slide on mount.
 *
 * Usage:
 *   <PageTransition transitionKey={pathname}>
 *     {children}
 *   </PageTransition>
 */
export function PageTransition({ children, transitionKey }: PageTransitionProps) {
  return (
    <motion.div
      key={transitionKey}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
