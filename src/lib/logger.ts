/**
 * Structured Logger
 *
 * Centralized logging with environment-aware level filtering.
 * - Production: only warn and error (routed to console + Sentry)
 * - Development: all levels
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const isProduction = process.env.NODE_ENV === 'production'
const minLevel: LogLevel = isProduction ? 'warn' : 'debug'

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel]
}

function formatMessage(scope: string, message: string): string {
  return `[${scope}] ${message}`
}

class Logger {
  private scope: string

  constructor(scope: string) {
    this.scope = scope
  }

  debug(message: string, ...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.debug(formatMessage(this.scope, message), ...args)
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.info(formatMessage(this.scope, message), ...args)
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage(this.scope, message), ...args)
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(formatMessage(this.scope, message), ...args)
    }
  }
}

/**
 * Create a scoped logger instance.
 *
 * @example
 * const log = createLogger('DraftService')
 * log.info('Draft created', { draftId })
 * log.error('Failed to create draft', error)
 */
export function createLogger(scope: string): Logger {
  return new Logger(scope)
}
