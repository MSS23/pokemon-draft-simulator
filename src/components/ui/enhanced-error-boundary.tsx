'use client'

import React, { Component, ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertTriangle,
  RefreshCw,
  Bug,
  Home,
  ChevronDown,
  ChevronUp,
  Copy,
  Send
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ErrorInfo {
  componentStack: string
  errorBoundary?: string
  errorBoundaryStack?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  retryCount: number
  isRetrying: boolean
  showDetails: boolean
  errorId: string
}

interface EnhancedErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  maxRetries?: number
  resetKeys?: Array<string | number>
  resetOnPropsChange?: boolean
  showErrorDetails?: boolean
  reportErrors?: boolean
  className?: string
}

export class EnhancedErrorBoundary extends Component<
  EnhancedErrorBoundaryProps,
  ErrorBoundaryState
> {
  private resetTimeoutId: number | null = null

  constructor(props: EnhancedErrorBoundaryProps) {
    super(props)

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRetrying: false,
      showDetails: false,
      errorId: ''
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Generate unique error ID for tracking
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return {
      hasError: true,
      error,
      errorId
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error Boundary caught an error:', error, errorInfo)

    this.setState({ errorInfo })

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // Report error if enabled
    if (this.props.reportErrors) {
      this.reportError(error, errorInfo)
    }
  }

  componentDidUpdate(prevProps: EnhancedErrorBoundaryProps) {
    const { resetKeys, resetOnPropsChange } = this.props
    const { hasError } = this.state

    // Reset error boundary if resetKeys changed
    if (hasError && resetKeys) {
      const prevResetKeys = prevProps.resetKeys || []
      const hasResetKeyChanged = resetKeys.some(
        (key, index) => key !== prevResetKeys[index]
      )

      if (hasResetKeyChanged) {
        this.resetErrorBoundary()
      }
    }

    // Reset if any props changed and resetOnPropsChange is enabled
    if (hasError && resetOnPropsChange && prevProps !== this.props) {
      this.resetErrorBoundary()
    }
  }

  resetErrorBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRetrying: false,
      showDetails: false,
      errorId: ''
    })

    if (this.resetTimeoutId) {
      window.clearTimeout(this.resetTimeoutId)
      this.resetTimeoutId = null
    }
  }

  handleRetry = () => {
    const { maxRetries = 3 } = this.props
    const { retryCount } = this.state

    if (retryCount >= maxRetries) {
      return
    }

    this.setState({ isRetrying: true })

    // Add a small delay to prevent immediate re-error
    this.resetTimeoutId = window.setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: retryCount + 1,
        isRetrying: false
      })
    }, 500)
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  handleReload = () => {
    window.location.reload()
  }

  toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }))
  }

  copyErrorDetails = () => {
    const { error, errorInfo, errorId } = this.state
    const errorText = `
Error ID: ${errorId}
Error: ${error?.message || 'Unknown error'}
Stack: ${error?.stack || 'No stack trace'}
Component Stack: ${errorInfo?.componentStack || 'No component stack'}
User Agent: ${navigator.userAgent}
URL: ${window.location.href}
Timestamp: ${new Date().toISOString()}
    `.trim()

    navigator.clipboard.writeText(errorText).then(() => {
      toast.success('Error details copied to clipboard')
    }).catch(() => {
      toast.error('Failed to copy error details')
    })
  }

  reportError = async (error: Error, errorInfo: ErrorInfo) => {
    try {
      // In a real app, this would send to your error tracking service
      const report = {
        errorId: this.state.errorId,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }

      console.log('Error report generated:', report)
      // Example: await fetch('/api/errors', { method: 'POST', body: JSON.stringify(report) })
    } catch (reportError) {
      console.error('Failed to report error:', reportError)
    }
  }

  render() {
    const { hasError, error, errorInfo, retryCount, isRetrying, showDetails, errorId } = this.state
    const { children, fallback, maxRetries = 3, showErrorDetails = true } = this.props

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback
      }

      const canRetry = retryCount < maxRetries
      const errorMessage = error?.message || 'An unexpected error occurred'

      return (
        <div className={cn('p-4 space-y-4', this.props.className)}>
          <Card className="border-red-200 bg-red-50 dark:bg-red-900/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                Something went wrong
                <Badge variant="outline" className="text-xs">
                  Error #{errorId.slice(-6)}
                </Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <Alert className="border-red-200 bg-red-50/50">
                <Bug className="h-4 w-4" />
                <AlertDescription className="text-red-800 dark:text-red-200">
                  {errorMessage}
                </AlertDescription>
              </Alert>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {canRetry && (
                  <Button
                    onClick={this.handleRetry}
                    disabled={isRetrying}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isRetrying ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Try Again ({maxRetries - retryCount} left)
                      </>
                    )}
                  </Button>
                )}

                <Button
                  onClick={this.handleReload}
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reload Page
                </Button>

                <Button
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Button>

                {showErrorDetails && (
                  <Button
                    onClick={this.toggleDetails}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    {showDetails ? (
                      <>
                        <ChevronUp className="h-4 w-4 mr-1" />
                        Hide Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4 mr-1" />
                        Show Details
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* Retry count indicator */}
              {retryCount > 0 && (
                <div className="text-xs text-red-600 dark:text-red-400">
                  Retry attempts: {retryCount}/{maxRetries}
                </div>
              )}

              {/* Error details (collapsible) */}
              {showDetails && showErrorDetails && (
                <div className="space-y-3 pt-4 border-t border-red-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-red-700 dark:text-red-400">
                      Technical Details
                    </h4>
                    <div className="flex gap-1">
                      <Button
                        onClick={this.copyErrorDetails}
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                      {this.props.reportErrors && (
                        <Button
                          onClick={() => this.reportError(error!, errorInfo!)}
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Report
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-medium text-red-600 dark:text-red-400">
                        Error ID:
                      </label>
                      <div className="text-xs font-mono text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/20 p-2 rounded">
                        {errorId}
                      </div>
                    </div>

                    {error?.stack && (
                      <div>
                        <label className="text-xs font-medium text-red-600 dark:text-red-400">
                          Stack Trace:
                        </label>
                        <pre className="text-xs text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/20 p-2 rounded overflow-auto max-h-32">
                          {error.stack}
                        </pre>
                      </div>
                    )}

                    {errorInfo?.componentStack && (
                      <div>
                        <label className="text-xs font-medium text-red-600 dark:text-red-400">
                          Component Stack:
                        </label>
                        <pre className="text-xs text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/20 p-2 rounded overflow-auto max-h-32">
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )
    }

    return children
  }
}

// Higher-order component for functional components
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryConfig?: Omit<EnhancedErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <EnhancedErrorBoundary {...errorBoundaryConfig}>
      <Component {...props} />
    </EnhancedErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`

  return WrappedComponent
}

// Hook for error reporting from functional components
export function useErrorHandler() {
  return (error: Error, errorInfo?: Partial<ErrorInfo>) => {
    console.error('Manual error report:', error, errorInfo)

    // In a real app, report to error tracking service
    const report = {
      errorId: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo?.componentStack,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString()
    }

    console.log('Manual error report generated:', report)
  }
}