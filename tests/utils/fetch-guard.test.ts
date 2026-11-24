import { describe, it, expect } from 'vitest'

// tests/setup.ts must stop unmocked same-origin fetches (e.g. UserSessionService's
// POST /api/guest/session) before they reach a real localhost:3000 socket.
describe('unit-test fetch guard', () => {
  it('rejects relative URLs without touching the network', async () => {
    await expect(fetch('/api/guest/session', { method: 'POST' })).rejects.toThrow(
      /Unmocked fetch to http:\/\/localhost:3000\/api\/guest\/session/
    )
  })

  it('rejects absolute same-origin URLs and Request objects', async () => {
    await expect(fetch(`${window.location.origin}/api/health`)).rejects.toThrow(/Unmocked fetch/)
    await expect(fetch(new URL('/x', window.location.href))).rejects.toThrow(/Unmocked fetch/)
  })
})
