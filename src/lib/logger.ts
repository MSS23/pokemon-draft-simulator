/**
 * Structured Logger
 *
 * Centralized logging with environment-aware level filtering.
 * - Production: warn and error only, structured JSON output
 * - Development: all levels, human-readable output
 *
 * Supports context propagation for request tracing.
 * Backward-compatible: accepts (message, ...args) or (message, context).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

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

function isLogContext(value: unknown): value is LogContext {
  return value !== null && typeof value === 'object' && !(value instanceof Error) && !Array.isArray(value)
}

function formatStructured(level: LogLevel, scope: string, message: string, context?: LogContext): string {
  if (isProduction) {
    const entry: Record<string, unknown> = {
      level,
      scope,
      message,
      timestamp: new Date().toISOString(),
    }
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        if (value instanceof Error) {
          entry[key] = { message: value.message, stack: value.stack }
        } else {
          entry[key] = value
        }
      }
    }
    return JSON.stringify(entry)
  }

  return `[${scope}] ${message}`
}

class Logger {
  private scope: string
  private defaultContext: LogContext

  constructor(scope: string, defaultContext?: LogContext) {
    this.scope = scope
    this.defaultContext = defaultContext || {}
  }

  /**
   * Create a child logger with additional default context.
   * Useful for adding requestId or draftId to all logs in a request.
   */
  child(context: LogContext): Logger {
    return new Logger(this.scope, { ...this.defaultContext, ...context })
  }

  debug(message: string, ...args: unknown[]): void {
    if (!shouldLog('debug')) return
    this.emit('debug', message, args)
  }

  info(message: string, ...args: unknown[]): void {
    if (!shouldLog('info')) return
    this.emit('info', message, args)
  }

  warn(message: string, ...args: unknown[]): void {
    if (!shouldLog('warn')) return
    this.emit('warn', message, args)
  }

  error(message: string, ...args: unknown[]): void {
    if (!shouldLog('error')) return
    this.emit('error', message, args)
  }

  private emit(level: LogLevel, message: string, args: unknown[]): void {
    const consoleFn = level === 'debug' ? console.debug : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error

    // If single arg is a plain object, treat as structured context
    if (args.length === 1 && isLogContext(args[0])) {
      const ctx = { ...this.defaultContext, ...(args[0] as LogContext) }
      consoleFn(formatStructured(level, this.scope, message, ctx))
      return
    }

    // If we have default context, include it in structured output
    if (Object.keys(this.defaultContext).length > 0 && isProduction) {
      consoleFn(formatStructured(level, this.scope, message, this.defaultContext), ...args)
      return
    }

    // Backward-compatible: pass variadic args through
    consoleFn(formatStructured(level, this.scope, message), ...args)
  }
}

/**
 * Create a scoped logger instance.
 *
 * @example
 * const log = createLogger('DraftService')
 * log.info('Draft created', { draftId, roomCode })  // structured context
 * log.error('Failed to create draft', error)          // backward-compatible
 * log.info('Values:', val1, val2)                     // variadic args
 *
 * // Child logger with request context
 * const reqLog = log.child({ requestId: '123', userId: 'abc' })
 * reqLog.info('Processing pick') // includes requestId + userId automatically
 */
export function createLogger(scope: string, defaultContext?: LogContext): Logger {
  return new Logger(scope, defaultContext)
}
