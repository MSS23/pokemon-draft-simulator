import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side proxy for pokepast.es — the site sends no CORS headers, so
 * browser-side fetches of paste URLs always fail. Locked to pokepast.es
 * to avoid being an open proxy.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  if (parsed.hostname !== 'pokepast.es') {
    return NextResponse.json({ error: 'Only pokepast.es URLs are supported' }, { status: 400 })
  }

  let path = parsed.pathname.replace(/\/+$/, '')
  if (!path.endsWith('/raw')) path += '/raw'

  const upstream = await fetch(`https://pokepast.es${path}`, {
    headers: { 'user-agent': 'pokemon-draft-simulator' },
    next: { revalidate: 300 },
  })
  if (!upstream.ok) {
    return NextResponse.json({ error: 'Failed to fetch PokePaste' }, { status: 502 })
  }

  const text = await upstream.text()
  return new NextResponse(text, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  })
}
