import * as Sentry from '@sentry/nextjs'

const isProduction = process.env.NEXT_PUBLIC_SITE_URL === 'https://draftpokemon.com'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: isProduction,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
})
