'use client'

import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
  className?: string
}

export const ShimmerButton = forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = 'rgba(255,255,255,0.25)',
      shimmerSize = '0.1em',
      borderRadius = '0.5rem',
      shimmerDuration = '1.5s',
      background = 'hsl(var(--primary))',
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        style={
          {
            '--shimmer-color': shimmerColor,
            '--shimmer-size': shimmerSize,
            '--border-radius': borderRadius,
            '--shimmer-duration': shimmerDuration,
            '--background': background,
          } as React.CSSProperties
        }
        className={cn(
          'group relative cursor-pointer overflow-hidden whitespace-nowrap px-6 py-2.5 text-sm font-semibold text-white',
          'transition-all duration-300 ease-in-out',
          '[background:var(--background)]',
          '[border-radius:var(--border-radius)]',
          'hover:scale-[1.02] active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          className
        )}
        {...props}
      >
        {/* shimmer layer */}
        <div
          className="absolute inset-0 overflow-hidden [border-radius:inherit]"
          style={{ zIndex: 0 }}
        >
          <div
            className="absolute inset-[-100%] animate-[shimmer_var(--shimmer-duration,1.5s)_linear_infinite]"
            style={{
              background: `conic-gradient(from 0deg at 50% 50%, transparent 0%, var(--shimmer-color) 10%, transparent 20%)`,
            }}
          />
        </div>
        {/* highlight */}
        <div className="absolute inset-[1px] [border-radius:inherit] bg-gradient-to-b from-white/10 to-transparent" />
        <span className="relative z-10 flex items-center gap-2">{children}</span>
      </button>
    )
  }
)
ShimmerButton.displayName = 'ShimmerButton'
