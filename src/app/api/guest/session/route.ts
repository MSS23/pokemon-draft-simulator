/**
 * Guest Session API — SEC-06
 *
 * Issues httpOnly cookie-based guest session IDs to replace localStorage-based IDs.
 * The cookie is httpOnly: not readable from JavaScript, preventing XSS exfiltration.
 *
 * POST /api/guest/session — Create or retrieve guest session
 * GET  /api/guest/session — Check if a guest session cookie exists (for client init)
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'

const GUEST_COOKIE_NAME = 'guest-session-id'
const GUEST_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

function generateGuestId(): string {
  // crypto.randomUUID() is available in Node.js 14.17+ and all modern runtimes
  return `guest-${crypto.randomUUID()}`
}

/**
 * POST /api/guest/session
 * Creates a new guest session or returns the existing one.
 * If the user is authenticated via Clerk, returns their Clerk user ID instead.
 */
export async function POST(_request: Request): Promise<NextResponse> {
  // If the user is already authenticated via Clerk, no guest session needed
  const { userId: clerkUserId } = await auth()

  if (clerkUserId) {
    return NextResponse.json({
      userId: clerkUserId,
      isAuthenticated: true,
      source: 'clerk'
    })
  }

  // Check for existing guest session cookie
  const cookieStore = await cookies()
  const existingCookie = cookieStore.get(GUEST_COOKIE_NAME)

  if (existingCookie?.value) {
    return NextResponse.json({
      userId: existingCookie.value,
      isAuthenticated: false,
      source: 'existing-cookie'
    })
  }

  // Generate new guest ID and set httpOnly cookie
  const guestId = generateGuestId()

  const response = NextResponse.json({
    userId: guestId,
    isAuthenticated: false,
    source: 'new-cookie'
  })

  response.cookies.set(GUEST_COOKIE_NAME, guestId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: GUEST_COOKIE_MAX_AGE,
    path: '/'
  })

  return response
}

/**
 * GET /api/guest/session
 * Returns whether a guest session cookie exists.
 * Used by client to check initialization state without exposing the ID.
 */
export async function GET(): Promise<NextResponse> {
  const { userId: clerkUserId } = await auth()

  if (clerkUserId) {
    return NextResponse.json({
      hasSession: true,
      isAuthenticated: true
    })
  }

  const cookieStore = await cookies()
  const existing = cookieStore.get(GUEST_COOKIE_NAME)

  return NextResponse.json({
    hasSession: !!existing,
    isAuthenticated: false
  })
}
