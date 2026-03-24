import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy endpoint to fetch a Google Sheets document as CSV.
 * Needed because Google Sheets export URLs are blocked by CORS in the browser.
 *
 * GET /api/sheets?url=<google-sheets-url>
 */

const SHEET_ID_REGEX = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/
const GID_REGEX = /[?&#]gid=(\d+)/

function buildExportUrl(url: string): string | null {
  const idMatch = url.match(SHEET_ID_REGEX)
  if (!idMatch) return null

  const sheetId = idMatch[1]
  const gidMatch = url.match(GID_REGEX)
  const gid = gidMatch ? gidMatch[1] : '0'

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  // Validate it's a Google Sheets URL
  if (!url.includes('docs.google.com/spreadsheets')) {
    return NextResponse.json(
      { error: 'URL must be a Google Sheets link' },
      { status: 400 }
    )
  }

  const exportUrl = buildExportUrl(url)
  if (!exportUrl) {
    return NextResponse.json(
      { error: 'Could not parse Google Sheets ID from URL' },
      { status: 400 }
    )
  }

  try {
    const response = await fetch(exportUrl, {
      headers: {
        'User-Agent': 'PokemonDraft/1.0',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Sheet not found. Make sure the sheet is shared publicly (Anyone with the link).' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: `Failed to fetch sheet (HTTP ${response.status}). Make sure the sheet is shared publicly.` },
        { status: response.status }
      )
    }

    const csvText = await response.text()

    // Sanity check - should look like CSV
    if (csvText.includes('<!DOCTYPE html>') || csvText.includes('<html')) {
      return NextResponse.json(
        { error: 'Sheet is not accessible. Make sure it is shared publicly (Anyone with the link).' },
        { status: 403 }
      )
    }

    return NextResponse.json({ csv: csvText })
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch sheet: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
