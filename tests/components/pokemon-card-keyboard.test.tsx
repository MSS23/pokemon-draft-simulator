import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Pokemon } from '@/types'

vi.mock('@/hooks/useOptimisticUpdates', () => ({
  usePendingActionFeedback: () => ({ getPendingActionStatus: () => null }),
}))
vi.mock('@/hooks/usePokemonImage', () => ({
  usePokemonImage: () => ({
    imageUrl: '/x.png', isLoading: false, hasError: false,
    handleImageError: vi.fn(), handleImageLoad: vi.fn(),
  }),
}))

import PokemonCard from '@/components/pokemon/PokemonCard'

const pokemon: Pokemon = {
  id: '1000', name: 'Gholdengo',
  types: [{ name: 'steel', color: '#999' }, { name: 'ghost', color: '#555' }],
  stats: { hp: 87, attack: 60, defense: 95, specialAttack: 133, specialDefense: 91, speed: 84, total: 550 },
  abilities: ['Good As Gold'], sprite: '', cost: 20, isLegal: true,
}

describe('PokemonCard keyboard handling', () => {
  it('Enter on the nested wishlist button does not open details or cancel the button', () => {
    const onViewDetails = vi.fn()
    const onAddToWishlist = vi.fn()
    render(<PokemonCard pokemon={pokemon} onViewDetails={onViewDetails} onAddToWishlist={onAddToWishlist} />)

    const button = screen.getByRole('button', { name: 'Add Gholdengo to wishlist' })
    const notPrevented = fireEvent.keyDown(button, { key: 'Enter' })
    expect(notPrevented).toBe(true)
    expect(onViewDetails).not.toHaveBeenCalled()

    fireEvent.click(button)
    expect(onAddToWishlist).toHaveBeenCalledWith(pokemon)
    expect(onViewDetails).not.toHaveBeenCalled()
  })

  it('Enter on the card itself still opens details', () => {
    const onViewDetails = vi.fn()
    render(<PokemonCard pokemon={pokemon} onViewDetails={onViewDetails} />)
    fireEvent.keyDown(screen.getByRole('article'), { key: 'Enter' })
    expect(onViewDetails).toHaveBeenCalledWith(pokemon)
  })
})
