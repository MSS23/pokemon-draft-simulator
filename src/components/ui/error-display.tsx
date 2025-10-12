'use client'

import { AlertCircle, RefreshCcw, Home, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ErrorDisplayProps {
  title?: string
  message?: string
  error?: Error | null
  onRetry?: () => void
  onDismiss?: () => void
  onGoHome?: () => void
  variant?: 'inline' | 'card' | 'fullscreen'
  className?: string
  showStack?: boolean
}

/**
 * ErrorDisplay Component - Consistent error state UI
 *
 * Accessibility features:
 * - ARIA role="alert" for screen readers
 * - Clear error messages with helpful actions
 * - Keyboard accessible buttons
 * - Focus management on display
 *
 * Variants:
 * - inline: Small inline error message
 * - card: Error in a card container
 * - fullscreen: Full page error screen
 */
export function ErrorDisplay({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  error,
  onRetry,
  onDismiss,
  onGoHome,
  variant = 'card',
  className,
  showStack = false
}: ErrorDisplayProps) {
  const errorMessage = error?.message || message

  if (variant === 'inline') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className={cn(
          'flex items-center gap-3 p-4 rounded-lg',
          'bg-red-50 dark:bg-red-900/20',
          'border border-red-200 dark:border-red-800',
          'text-red-800 dark:text-red-300',
          className
        )}
      >
        <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-sm mt-1">{errorMessage}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="min-h-[44px] sm:min-h-0"
              aria-label="Retry the failed action"
            >
              <RefreshCcw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-0 h-8 w-8"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (variant === 'fullscreen') {
    return (
      <div
        className={cn(
          'min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-red-50',
          'dark:from-slate-900 dark:via-slate-800 dark:to-slate-900',
          'flex items-center justify-center p-4',
          className
        )}
      >
        <Card className="max-w-md w-full shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-red-100 dark:bg-red-900/30 rounded-full w-fit">
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription className="mt-2">{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {showStack && error?.stack && (
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <p className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                  {error.stack}
                </p>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              {onRetry && (
                <Button
                  onClick={onRetry}
                  className="flex-1 min-h-[44px] sm:min-h-0"
                  aria-label="Retry the failed action"
                >
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              )}
              {onGoHome && (
                <Button
                  variant="outline"
                  onClick={onGoHome}
                  className="flex-1 min-h-[44px] sm:min-h-0"
                  aria-label="Return to home page"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Default: card variant
  return (
    <Card
      role="alert"
      aria-live="assertive"
      className={cn(
        'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10',
        className
      )}
    >
      <CardHeader>
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-red-900 dark:text-red-300 text-base">
              {title}
            </CardTitle>
            <CardDescription className="text-red-700 dark:text-red-400 mt-1">
              {errorMessage}
            </CardDescription>
          </div>
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-0 h-8 w-8 -mt-1 -mr-2"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      {(onRetry || showStack) && (
        <CardContent className="space-y-3">
          {showStack && error?.stack && (
            <div className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                {error.stack}
              </p>
            </div>
          )}
          {onRetry && (
            <Button
              onClick={onRetry}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
              aria-label="Retry the failed action"
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  )
}

/**
 * Specialized error displays for common scenarios
 */

export function NetworkError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorDisplay
      title="Network Error"
      message="Unable to connect to the server. Please check your internet connection and try again."
      onRetry={onRetry}
      variant="card"
    />
  )
}

export function NotFoundError({ onGoHome }: { onGoHome?: () => void }) {
  return (
    <ErrorDisplay
      title="Page Not Found"
      message="The page you're looking for doesn't exist or has been moved."
      onGoHome={onGoHome}
      variant="fullscreen"
    />
  )
}

export function PermissionError() {
  return (
    <ErrorDisplay
      title="Permission Denied"
      message="You don't have permission to access this resource."
      variant="card"
    />
  )
}

export function DataLoadError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorDisplay
      title="Failed to Load Data"
      message="We couldn't load the required data. This might be a temporary issue."
      onRetry={onRetry}
      variant="inline"
    />
  )
}
