import { NextResponse } from 'next/server'

// COST: no Node-only deps — Edge invocations are cheaper than Node Lambda
// invocations, and this is the most frequently called route on a live draft.
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

/** Lightweight clock-sync endpoint for the live draft countdown. */
export function GET() {
  return NextResponse.json(
    { serverTime: Date.now() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

