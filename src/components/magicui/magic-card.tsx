'use client'

import { cn } from '@/lib/utils'
import React, { useRef, useState, ReactNode } from 'react'

interface MagicCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  className?: string
  gradientSize?: number
  gradientColor?: string
  gradientOpacity?: number
}

export function MagicCard({
  children,
  className,
  gradientSize = 200,
  gradientColor = 'hsl(var(--primary))',
  gradientOpacity = 0.08,
  onMouseMove,
  onMouseLeave,
  ...props
}: MagicCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: -gradientSize, y: -gradientSize })

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    onMouseMove?.(e)
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    setPosition({ x: -gradientSize, y: -gradientSize })
    onMouseLeave?.(e)
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn('relative overflow-hidden rounded-xl border bg-card', className)}
      {...props}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(${gradientSize}px circle at ${position.x}px ${position.y}px, ${gradientColor}, transparent 70%)`,
          opacity: gradientOpacity * 10,
        }}
      />
      {children}
    </div>
  )
}
