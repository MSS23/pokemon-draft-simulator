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

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isProduction,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  environment: process.env.NODE_ENV,
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
