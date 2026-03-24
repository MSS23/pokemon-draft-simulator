import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const title = searchParams.get('title') || 'Pokemon Draft League'
  const subtitle = searchParams.get('subtitle') || 'Real-time competitive drafting platform'
  const status = searchParams.get('status') || null
  const teams = searchParams.get('teams') || null
  const format = searchParams.get('format') || null

  // Build a dynamic subtitle if individual components are provided
  const dynamicParts = [format, teams ? `${teams} Teams` : null, status].filter(Boolean)
  const dynamicSubtitle = dynamicParts.length > 0 ? dynamicParts.join(' \u2022 ') : subtitle

  // Status badge color mapping
  const statusColors: Record<string, { bg: string; border: string; text: string }> = {
    live: { bg: 'rgba(34, 197, 94, 0.2)', border: 'rgba(34, 197, 94, 0.6)', text: '#4ade80' },
    open: { bg: 'rgba(59, 130, 246, 0.2)', border: 'rgba(59, 130, 246, 0.6)', text: '#60a5fa' },
    completed: { bg: 'rgba(148, 163, 184, 0.2)', border: 'rgba(148, 163, 184, 0.6)', text: '#94a3b8' },
    drafting: { bg: 'rgba(251, 191, 36, 0.2)', border: 'rgba(251, 191, 36, 0.6)', text: '#fbbf24' },
  }
  const statusStyle = status ? statusColors[status.toLowerCase()] || statusColors.open : null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Pokeball icon */}
        <div
          style={{
            display: 'flex',
            width: 100,
            height: 100,
            borderRadius: '50%',
            overflow: 'hidden',
            flexDirection: 'column',
            marginBottom: 28,
            border: '4px solid white',
          }}
        >
          <div style={{ flex: 1, background: '#dc2855', display: 'flex' }} />
          <div
            style={{
              height: 6,
              background: '#1a1a2e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          />
          <div style={{ flex: 1, background: 'white', display: 'flex' }} />
        </div>

        {/* Status badge */}
        {status && statusStyle && (
          <div
            style={{
              display: 'flex',
              padding: '6px 20px',
              borderRadius: 9999,
              background: statusStyle.bg,
              border: `2px solid ${statusStyle.border}`,
              color: statusStyle.text,
              fontSize: 18,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '2px',
              marginBottom: 16,
            }}
          >
            {status}
          </div>
        )}

        {/* Title */}
        <div
          style={{
            fontSize: title.length > 30 ? 48 : 64,
            fontWeight: 800,
            color: 'white',
            letterSpacing: '-2px',
            display: 'flex',
            textAlign: 'center',
            maxWidth: '90%',
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 26,
            color: '#94a3b8',
            marginTop: 16,
            display: 'flex',
            textAlign: 'center',
          }}
        >
          {dynamicSubtitle}
        </div>

        {/* Feature pills - only show for generic (no custom title) */}
        {!searchParams.get('title') && (
          <div
            style={{
              display: 'flex',
              gap: 24,
              marginTop: 40,
            }}
          >
            {['Snake Draft', 'Auction', 'Leagues', 'Tournaments'].map((label) => (
              <div
                key={label}
                style={{
                  padding: '10px 24px',
                  borderRadius: 9999,
                  background: 'rgba(220, 40, 85, 0.2)',
                  border: '1px solid rgba(220, 40, 85, 0.4)',
                  color: '#f87171',
                  fontSize: 20,
                  display: 'flex',
                }}
              >
                {label}
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
