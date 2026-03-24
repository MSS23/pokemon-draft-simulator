import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
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
            width: 120,
            height: 120,
            borderRadius: '50%',
            overflow: 'hidden',
            flexDirection: 'column',
            marginBottom: 32,
            border: '4px solid white',
          }}
        >
          <div style={{ flex: 1, background: '#dc2855', display: 'flex' }} />
          <div
            style={{
              height: 8,
              background: '#1a1a2e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          />
          <div style={{ flex: 1, background: 'white', display: 'flex' }} />
        </div>

        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: 'white',
            letterSpacing: '-2px',
            display: 'flex',
          }}
        >
          Pokemon Draft League
        </div>

        <div
          style={{
            fontSize: 28,
            color: '#94a3b8',
            marginTop: 16,
            display: 'flex',
          }}
        >
          Real-time competitive drafting platform
        </div>

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
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
