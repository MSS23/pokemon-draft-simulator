import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import TeamRoster from '@/components/team/TeamRoster'

const index = {
  gholdengo: {
    name: 'gholdengo', nationalDex: 1000, types: ['steel', 'ghost'], abilities: ['good-as-gold'],
    stats: { hp: 87, attack: 60, defense: 95, specialAttack: 133, specialDefense: 91, speed: 84, total: 550 },
    flags: { isLegendary: false, isMythical: false, isParadox: false },
  },
  // Legendary: illegal in most formats, must still render on a roster.
  koraidon: {
    name: 'koraidon', nationalDex: 1007, types: ['fighting', 'dragon'], abilities: ['orichalcum-pulse'],
    stats: { hp: 100, attack: 135, defense: 115, specialAttack: 85, specialDefense: 100, speed: 135, total: 670 },
    flags: { isLegendary: true, isMythical: false, isParadox: false },
  },
}

const fetchMock = vi.fn(async (url: string) => {
  if (url === '/data/format-manifest.json') return new Response(JSON.stringify({ pokemonIndexHash: 'abc' }))
  if (url === '/data/pokemon_index_abc.json') return new Response(JSON.stringify(index))
  return new Response('not found', { status: 404 })
})

describe('TeamRoster', () => {
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('resolves picks above dex 400 and format-illegal picks from the static index', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TeamRoster team={{ id: 't1', name: 'Team A', userName: 'a', draftOrder: 1, picks: ['1000', '1007'], pickCosts: [22, 30] }} />
      </QueryClientProvider>
    )

    expect(await screen.findByAltText('Gholdengo')).toBeTruthy()
    expect(screen.getByAltText('Koraidon')).toBeTruthy()
    expect(screen.getByText('22')).toBeTruthy()
    const urls = fetchMock.mock.calls.map(([u]) => String(u))
    expect(urls.some(u => u.includes('/api/pokemon/') || u.includes('pokeapi.co'))).toBe(false)
  })
})
