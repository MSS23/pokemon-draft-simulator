import * as Sentry from '@sentry/nextjs'

const isProduction = process.env.NEXT_PUBLIC_SITE_URL === 'https://draftpokemon.com'

// SEC: PII scrubber for the edge runtime (middleware). The edge sees every
// request, so cookies and Clerk auth tokens flow through here on every page
// load. Strip them before events leave.
const SECRET_KEY_PATTERN = /password|token|secret|jwt|cookie|auth|api[-_]?key/i

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  if (event.request) {
    delete event.request.cookies
    if (event.request.headers) {
      const headers = event.request.headers as Record<string, string>
      for (const k of Object.keys(headers)) {
        const lk = k.toLowerCase()
        if (lk === 'authorization' || lk === 'cookie' || lk === 'x-clerk-auth-token') {
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

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isProduction,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  beforeSend: scrubEvent,
})
