/**
 * Analytics Service — PostHog Integration
 *
 * Typed event tracking for key user actions.
 * Only initializes when NEXT_PUBLIC_POSTHOG_KEY is set.
 */

import posthog from 'posthog-js'

let initialized = false

export function initAnalytics() {
  if (initialized) return
  if (typeof window === 'undefined') return

  // Only initialize on production domain — no noise from localhost or preview deploys
  const hostname = window.location.hostname
  if (hostname !== 'draftpokemon.com') return

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

  if (!key) return

  posthog.init(key, {
    api_host: host,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // only track explicit events
    persistence: 'localStorage+cookie',
    loaded: () => {
      initialized = true
    },
  })
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (!initialized) return
  posthog.identify(userId, properties)
}

export function resetUser() {
  if (!initialized) return
  posthog.reset()
}

// ============================================================================
// TYPED EVENT TRACKING
// ============================================================================

export const analytics = {
  // Draft events
  draftCreated: (props: { draftId: string; format: string; draftType: string; teamCount: number }) =>
    track('draft_created', props),

  draftJoined: (props: { draftId: string; isHost: boolean; isGuest: boolean }) =>
    track('draft_joined', props),

  draftStarted: (props: { draftId: string; participantCount: number }) =>
    track('draft_started', props),

  draftCompleted: (props: { draftId: string; totalPicks: number; durationMinutes: number }) =>
    track('draft_completed', props),

  pickMade: (props: { draftId: string; pokemonId: string; round: number; cost: number }) =>
    track('pick_made', props),

  // Auction events
  bidPlaced: (props: { draftId: string; pokemonId: string; amount: number }) =>
    track('bid_placed', props),

  auctionWon: (props: { draftId: string; pokemonId: string; finalPrice: number }) =>
    track('auction_won', props),

  // League events
  leagueCreated: (props: { leagueId: string; teamCount: number }) =>
    track('league_created', props),

  matchRecorded: (props: { leagueId: string; matchId: string }) =>
    track('match_recorded', props),

  tradeProposed: (props: { leagueId: string }) =>
    track('trade_proposed', props),

  // Tournament events
  tournamentCreated: (props: { tournamentId: string; format: string }) =>
    track('tournament_created', props),

  // Auth events
  userRegistered: (props: { method: 'email' | 'google' | 'discord' }) =>
    track('user_registered', props),

  userLoggedIn: (props: { method: 'email' | 'google' | 'discord' }) =>
    track('user_logged_in', props),

  // PWA events
  pwaInstalled: () => track('pwa_installed', {}),

  // Feature usage
  wishlistUsed: (props: { draftId: string; itemCount: number }) =>
    track('wishlist_used', props),

  autoPickTriggered: (props: { draftId: string }) =>
    track('auto_pick_triggered', props),
}

function track(event: string, properties: Record<string, unknown>) {
  if (!initialized) return
  posthog.capture(event, properties)
}
