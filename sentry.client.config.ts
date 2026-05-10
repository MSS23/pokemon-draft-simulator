import * as Sentry from '@sentry/nextjs'

const isProduction =
  typeof window !== 'undefined' &&
  window.location.hostname === 'draftpokemon.com'

// SEC: PII scrubber — strip cookies, auth headers, and obvious secret-bearing
// fields from request payloads before events leave the browser. Defense in depth
// even though Sentry's default sendDefaultPii is false; explicit beats implicit.
const SECRET_KEY_PATTERN = /password|token|secret|jwt|cookie|auth|api[-_]?key/i

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  if (event.request) {
    delete event.request.cookies
    if (event.request.headers) {
      const headers = event.request.headers as Record<string, string>
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === 'authorization' || k.toLowerCase() === 'cookie' || k.toLowerCase() === 'x-clerk-auth-token') {
          delete headers[k]
        }
      }
    }
    if (typeof event.request.data === 'string') {
      event.request.data = '[redacted]'
    } else if (event.request.data && typeof event.request.data === 'object') {
      const data = event.request.data as Record<string, unknown>
      for (const k of Object.keys(data)) {
        if (SECRET_KEY_PATTERN.test(k)) data[k] = '[redacted]'
      }
    }
  }
  if (event.user) {
    // Keep id only — drop email, ip_address, username, etc.
    event.user = { id: event.user.id }
  }
  return event
}

function scrubBreadcrumb(crumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (crumb.category === 'fetch' || crumb.category === 'xhr') {
    if (crumb.data && typeof crumb.data === 'object') {
      const data = crumb.data as Record<string, unknown>
      if ('request_body' in data) delete data.request_body
      if ('response_body' in data) delete data.response_body
    }
  }
  return crumb
}

// Tag every event with the deployment environment so we can filter
// staging/preview noise out of the production Sentry view. Vercel sets
// VERCEL_ENV to 'production' | 'preview' | 'development'; outside Vercel
// (local dev, CI), fall back to NODE_ENV.
const sentryEnvironment =
  process.env.NEXT_PUBLIC_VERCEL_ENV ??
  process.env.VERCEL_ENV ??
  process.env.NODE_ENV ??
  'development'

// Lower the sampling rate in production to control quota. Staging/preview
// stays at full 10% so we get useful debugging signal on PR previews.
const sentryTracesSampleRate = sentryEnvironment === 'production' ? 0.02 : 0.1

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isProduction,
  tracesSampleRate: sentryTracesSampleRate,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  environment: sentryEnvironment,
  ignoreErrors: [
    'Hydration failed',
    'There was an error while hydrating',
    'NetworkError',
    'Failed to fetch',
    'ResizeObserver loop',
    'Non-Error promise rejection',
  ],
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
})
