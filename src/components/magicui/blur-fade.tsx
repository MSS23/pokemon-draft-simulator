'use client'

import { cn } from '@/lib/utils'
import { ReactNode, useEffect, useRef, useState } from 'react'

interface BlurFadeProps {
  children: ReactNode
  className?: string
  delay?: number
  duration?: number
  yOffset?: number
  inView?: boolean
}

export function BlurFade({
  children,
  className,
  delay = 0,
  duration = 0.5,
  yOffset = 8,
  inView = true,
}: BlurFadeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!inView)

  useEffect(() => {
    if (!inView) { setVisible(true); return }
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inView])

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={{
        opacity: visible ? 1 : 0,
        filter: visible ? 'blur(0)' : `blur(4px)`,
        transform: visible ? 'translateY(0)' : `translateY(${yOffset}px)`,
        transition: `opacity ${duration}s ease ${delay}s, filter ${duration}s ease ${delay}s, transform ${duration}s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}
