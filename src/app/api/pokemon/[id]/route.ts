import { NextRequest, NextResponse } from 'next/server'

const POKEAPI_BASE_URL = 'https://pokeapi.co/api/v2'
const FETCH_TIMEOUT_MS = 10_000

// Validate Pokemon ID: non-empty, max 50 chars, alphanumeric + hyphens only
function isValidPokemonId(id: string): boolean {
  return id.length > 0 && id.length <= 50 && /^[a-zA-Z0-9-]+$/.test(id)
}

/**
 * CDN-cacheable PokeAPI proxy.
 *
 * Returns raw PokeAPI JSON with Cache-Control headers so Vercel Edge Network
 * caches responses globally. Pokemon species data is entirely static —
 * s-maxage=86400 (24h) with stale-while-revalidate=3600 (1h) fallback.
 *
 * Do NOT add auth — Pokemon data is public.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!isValidPokemonId(id)) {
    return NextResponse.json(
      { error: 'Invalid Pokemon id' },
      { status: 400 }
    )
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const upstream = await fetch(`${POKEAPI_BASE_URL}/pokemon/${id}`, {
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'Pokemon not found' },
        { status: upstream.status }
      )
    }

    const body = await upstream.text()

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
        'CDN-Cache-Control': 'public, s-maxage=86400',
      },
    })
  } catch (_err) {
    clearTimeout(timeoutId)
    return NextResponse.json(
      { error: 'PokeAPI unavailable' },
      { status: 502 }
    )
  }
}
