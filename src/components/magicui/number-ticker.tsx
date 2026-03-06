'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface NumberTickerProps {
  value: number
  className?: string
  decimals?: number
  duration?: number
  prefix?: string
  suffix?: string
}

export function NumberTicker({
  value,
  className,
  decimals = 0,
  duration = 1200,
  prefix = '',
  suffix = '',
}: NumberTickerProps) {
  const [display, setDisplay] = useState(0)
  const startRef = useRef<number | null>(null)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    const from = display
    startRef.current = null

    const step = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setDisplay(from + (value - from) * eased)
      if (progress < 1) frameRef.current = requestAnimationFrame(step)
    }

    frameRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return (
    <span className={cn('tabular-nums', className)}>
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  )
}
