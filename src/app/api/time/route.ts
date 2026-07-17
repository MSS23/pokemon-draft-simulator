import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Lightweight clock-sync endpoint for the live draft countdown. */
export function GET() {
  return NextResponse.json(
    { serverTime: Date.now() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

