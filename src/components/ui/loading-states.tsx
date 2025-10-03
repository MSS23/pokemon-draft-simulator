'use client'

import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Loader2, Zap, Users, Trophy } from 'lucide-react'

// Generic Loading Spinner
export function LoadingSpinner({
  size = 'md',
  className
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  }

  return (
    <Loader2 className={cn('animate-spin', sizeClasses[size], className)} />
  )
}

// Loading Screen for Full Page
export function LoadingScreen({
  title = 'Loading...',
  description,
  showLogo = true
}: {
  title?: string
  description?: string
  showLogo?: boolean
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
      <div className="text-center space-y-6">
        {showLogo && (
          <div className="flex justify-center">
            <div className="p-4 bg-white dark:bg-slate-800 rounded-full shadow-lg">
              <Zap className="h-12 w-12 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        )}

        <div className="space-y-4">
          <LoadingSpinner size="lg" className="mx-auto text-blue-600 dark:text-blue-400" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {title}
            </h1>
            {description && (
              <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Animated progress indicator */}
        <div className="w-64 mx-auto">
          <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}

// Loading Card for Content Areas
export function LoadingCard({
  title = 'Loading...',
  className
}: {
  title?: string
  className?: string
}) {
  return (
    <Card className={cn('', className)}>
      <CardContent className="flex flex-col items-center justify-center py-8 space-y-4">
        <LoadingSpinner size="md" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {title}
        </p>
      </CardContent>
    </Card>
  )
}

// Skeleton Loading for Lists
export function SkeletonCard({
  lines = 3,
  showAvatar = false,
  className
}: {
  lines?: number
  showAvatar?: boolean
  className?: string
}) {
  return (
    <Card className={cn('animate-pulse', className)}>
      <CardContent className="p-4">
        <div className="flex items-start space-x-4">
          {showAvatar && (
            <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
          )}
          <div className="flex-1 space-y-2">
            {Array.from({ length: lines }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'bg-gray-200 dark:bg-gray-700 rounded',
                  i === 0 ? 'h-4' : 'h-3',
                  i === lines - 1 ? 'w-2/3' : 'w-full'
                )}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Pokemon Grid Loading Skeleton
export function PokemonGridSkeleton({
  count = 12,
  cardSize = 'md'
}: {
  count?: number
  cardSize?: 'sm' | 'md' | 'lg'
}) {
  const gridCols = {
    sm: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8',
    md: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
    lg: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
  }

  const cardSizes = {
    sm: 'h-44',
    md: 'h-56',
    lg: 'h-72'
  }

  return (
    <div className={cn('grid gap-2 sm:gap-3 md:gap-4', gridCols[cardSize])}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className={cn('animate-pulse', cardSizes[cardSize])}>
          <CardContent className="p-3 h-full flex flex-col">
            {/* Header */}
            <div className="flex justify-between mb-2">
              <div className="space-y-1">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-12" />
              </div>
              <div className="h-6 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>

            {/* Image */}
            <div className="flex-1 flex items-center justify-center mb-2">
              <div className="h-16 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            </div>

            {/* Types */}
            <div className="flex gap-1 justify-center mb-2">
              <div className="h-5 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-5 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>

            {/* Button */}
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Draft Room Loading State
export function DraftRoomLoading() {
  return (
    <LoadingScreen
      title="Loading Draft Room..."
      description="Connecting to the draft and syncing team data. This should only take a moment."
    />
  )
}

// Team Status Loading
export function TeamStatusSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="space-y-1">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
              </div>
            </div>
            <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// Inline Loading for Buttons
export function ButtonLoading({
  children,
  isLoading = false,
  loadingText = 'Loading...',
  ...props
}: {
  children: React.ReactNode
  isLoading?: boolean
  loadingText?: string
} & React.ComponentProps<'button'>) {
  return (
    <button {...props} disabled={isLoading || props.disabled}>
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <LoadingSpinner size="sm" />
          {loadingText}
        </span>
      ) : (
        children
      )}
    </button>
  )
}

// Data Loading States
export function DataLoadingState({
  type = 'content',
  message
}: {
  type?: 'content' | 'pokemon' | 'teams' | 'results'
  message?: string
}) {
  const icons = {
    content: Loader2,
    pokemon: Zap,
    teams: Users,
    results: Trophy
  }

  const messages = {
    content: message || 'Loading content...',
    pokemon: message || 'Loading Pokémon data...',
    teams: message || 'Loading team information...',
    results: message || 'Calculating results...'
  }

  const Icon = icons[type]

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-full">
        <Icon className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-spin" />
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-sm">
        {messages[type]}
      </p>
    </div>
  )
}