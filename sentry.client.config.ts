import * as Sentry from '@sentry/nextjs'

const isProduction =
  typeof window !== 'undefined' &&
  window.location.hostname === 'draftpokemon.com'

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
})
