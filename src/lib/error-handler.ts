/**
 * Error Handler Service
 *
 * Centralized error handling and recovery logic for the application.
 * Provides consistent error messages and recovery strategies.
 */

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  NETWORK = 'network',
  DATABASE = 'database',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  PERMISSION = 'permission',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  UNKNOWN = 'unknown'
}

export interface AppError {
  code: string
  category: ErrorCategory
  severity: ErrorSeverity
  message: string
  userMessage: string
  details?: unknown
  timestamp: string
  recoverable: boolean
  retryable: boolean
}

export interface ErrorContext {
  userId?: string
  draftId?: string
  teamId?: string
  action?: string
  metadata?: Record<string, unknown>
}

class ErrorHandler {
  private static instance: ErrorHandler
  private errorLog: AppError[] = []
  private maxLogSize = 100

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler()
    }
    return ErrorHandler.instance
  }

  /**
   * Handle and categorize errors
   */
  handleError(
    error: unknown,
    context?: ErrorContext
  ): AppError {
    const appError = this.categorizeError(error, context)
    this.logError(appError, context)
    return appError
  }

  /**
   * Categorize an error into standard format
   */
  private categorizeError(error: unknown, context?: ErrorContext): AppError {
    // Handle Supabase/PostgreSQL errors
    if (this.isSupabaseError(error)) {
      return this.handleSupabaseError(error as any, context)
    }

    // Handle Fetch/Network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        code: 'NETWORK_ERROR',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.ERROR,
        message: 'Network request failed',
        userMessage: 'Unable to connect to the server. Please check your internet connection.',
        details: error,
        timestamp: new Date().toISOString(),
        recoverable: true,
        retryable: true
      }
    }

    // Handle validation errors
    if (error instanceof Error && error.message.includes('not legal')) {
      return {
        code: 'VALIDATION_ERROR',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.WARNING,
        message: error.message,
        userMessage: error.message,
        details: error,
        timestamp: new Date().toISOString(),
        recoverable: true,
        retryable: false
      }
    }

    // Handle generic errors
    if (error instanceof Error) {
      return {
        code: 'GENERIC_ERROR',
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.ERROR,
        message: error.message,
        userMessage: 'An unexpected error occurred. Please try again.',
        details: error,
        timestamp: new Date().toISOString(),
        recoverable: true,
        retryable: true
      }
    }

    // Unknown error type
    return {
      code: 'UNKNOWN_ERROR',
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.ERROR,
      message: String(error),
      userMessage: 'An unexpected error occurred. Please try again.',
      details: error,
      timestamp: new Date().toISOString(),
      recoverable: true,
      retryable: false
    }
  }

  /**
   * Check if error is from Supabase
   */
  private isSupabaseError(error: unknown): boolean {
    return typeof error === 'object' &&
           error !== null &&
           ('code' in error || 'status' in error || 'statusCode' in error)
  }

  /**
   * Handle Supabase-specific errors
   */
  private handleSupabaseError(error: any, context?: ErrorContext): AppError {
    const code = error.code || error.status || error.statusCode || 'UNKNOWN'
    const message = error.message || error.error_description || String(error)

    // Common Supabase error codes
    switch (code) {
      case '23505': // Unique violation
        return {
          code: 'DUPLICATE_ERROR',
          category: ErrorCategory.CONFLICT,
          severity: ErrorSeverity.WARNING,
          message: 'Duplicate entry detected',
          userMessage: 'This item already exists. Please try a different name.',
          details: error,
          timestamp: new Date().toISOString(),
          recoverable: true,
          retryable: false
        }

      case '23503': // Foreign key violation
        return {
          code: 'REFERENCE_ERROR',
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.ERROR,
          message: 'Referenced item not found',
          userMessage: 'The referenced item no longer exists. Please refresh and try again.',
          details: error,
          timestamp: new Date().toISOString(),
          recoverable: true,
          retryable: false
        }

      case 'PGRST116': // No rows returned
        return {
          code: 'NOT_FOUND',
          category: ErrorCategory.NOT_FOUND,
          severity: ErrorSeverity.WARNING,
          message: 'Resource not found',
          userMessage: 'The requested item could not be found.',
          details: error,
          timestamp: new Date().toISOString(),
          recoverable: true,
          retryable: false
        }

      case '401':
      case 'PGRST301': // JWT expired
        return {
          code: 'UNAUTHORIZED',
          category: ErrorCategory.AUTHENTICATION,
          severity: ErrorSeverity.ERROR,
          message: 'Authentication failed',
          userMessage: 'Your session has expired. Please refresh the page.',
          details: error,
          timestamp: new Date().toISOString(),
          recoverable: true,
          retryable: false
        }

      case '403':
        return {
          code: 'FORBIDDEN',
          category: ErrorCategory.PERMISSION,
          severity: ErrorSeverity.ERROR,
          message: 'Permission denied',
          userMessage: 'You do not have permission to perform this action.',
          details: error,
          timestamp: new Date().toISOString(),
          recoverable: false,
          retryable: false
        }

      case '408':
      case 'ETIMEDOUT':
        return {
          code: 'TIMEOUT',
          category: ErrorCategory.NETWORK,
          severity: ErrorSeverity.WARNING,
          message: 'Request timed out',
          userMessage: 'The request took too long. Please try again.',
          details: error,
          timestamp: new Date().toISOString(),
          recoverable: true,
          retryable: true
        }

      default:
        return {
          code: `DB_ERROR_${code}`,
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.ERROR,
          message: message,
          userMessage: 'A database error occurred. Please try again.',
          details: error,
          timestamp: new Date().toISOString(),
          recoverable: true,
          retryable: true
        }
    }
  }

  /**
   * Log error (in production, this would send to error tracking service)
   */
  private logError(error: AppError, context?: ErrorContext): void {
    // Add to in-memory log
    this.errorLog.push(error)
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift() // Remove oldest error
    }

    // Console log for development
    const logLevel = error.severity === ErrorSeverity.CRITICAL || error.severity === ErrorSeverity.ERROR
      ? 'error'
      : error.severity === ErrorSeverity.WARNING
      ? 'warn'
      : 'info'

    console[logLevel]('[ErrorHandler]', {
      ...error,
      context
    })

    // In production, send to error tracking service (e.g., Sentry)
    if (process.env.NODE_ENV === 'production' && error.severity === ErrorSeverity.CRITICAL) {
      // TODO: Send to error tracking service
    }
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 10): AppError[] {
    return this.errorLog.slice(-limit)
  }

  /**
   * Clear error log
   */
  clearLog(): void {
    this.errorLog = []
  }

  /**
   * Create a recovery strategy for an error
   */
  getRecoveryStrategy(error: AppError): {
    action: 'retry' | 'refresh' | 'redirect' | 'ignore'
    message: string
  } {
    if (!error.recoverable) {
      return {
        action: 'redirect',
        message: 'This error requires navigation to a different page'
      }
    }

    if (error.retryable) {
      return {
        action: 'retry',
        message: 'Please try again'
      }
    }

    if (error.category === ErrorCategory.AUTHENTICATION) {
      return {
        action: 'refresh',
        message: 'Please refresh the page to continue'
      }
    }

    return {
      action: 'ignore',
      message: 'The error has been logged'
    }
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance()

/**
 * Wrapper for async functions with error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context?: ErrorContext,
  onError?: (error: AppError) => void
): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    const appError = errorHandler.handleError(error, context)
    onError?.(appError)
    return null
  }
}

/**
 * Wrapper for sync functions with error handling
 */
export function withSyncErrorHandling<T>(
  fn: () => T,
  context?: ErrorContext,
  onError?: (error: AppError) => void
): T | null {
  try {
    return fn()
  } catch (error) {
    const appError = errorHandler.handleError(error, context)
    onError?.(appError)
    return null
  }
}
