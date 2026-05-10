import * as Sentry from '@sentry/nextjs'

const isProduction = process.env.NEXT_PUBLIC_SITE_URL === 'https://draftpokemon.com'

// SEC: PII scrubber — strip cookies, auth headers, and secret-bearing fields
// from request payloads before events leave the server. The server runtime can
// see far more than the browser (env vars, raw bodies, headers), so this is
// load-bearing for keeping Clerk JWTs, Supabase keys, and password fields out
// of Sentry.
const SECRET_KEY_PATTERN = /password|token|secret|jwt|cookie|auth|api[-_]?key/i

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  if (event.request) {
    delete event.request.cookies
    if (event.request.headers) {
      const headers = event.request.headers as Record<string, string>
      for (const k of Object.keys(headers)) {
        const lk = k.toLowerCase()
        if (lk === 'authorization' || lk === 'cookie' || lk === 'x-clerk-auth-token' || lk.startsWith('x-supabase-')) {
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
    event.user = { id: event.user.id }
  }
  return event
}

function scrubBreadcrumb(crumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (crumb.category === 'fetch' || crumb.category === 'xhr' || crumb.category === 'http') {
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
  environment: process.env.NODE_ENV,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
})
