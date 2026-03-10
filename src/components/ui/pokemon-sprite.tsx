'use client'

import { useCallback, useState } from 'react'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, getPokemonSpriteUrl } from '@/utils/pokemon'

interface PokemonSpriteProps {
  pokemonId: string
  pokemonName: string
  className?: string
  lazy?: boolean
}

/**
 * Reusable Pokemon sprite component with animated GIF fallback chain:
 * 1. Showdown animated GIF
 * 2. PokeAPI animated GIF backup
 * 3. Static PNG sprite
 */
export function PokemonSprite({ pokemonId, pokemonName, className = 'w-8 h-8 object-contain', lazy = true }: PokemonSpriteProps) {
  const [fallbackLevel, setFallbackLevel] = useState(0)

  const src = fallbackLevel === 0
    ? getPokemonAnimatedUrl(pokemonId, pokemonName)
    : fallbackLevel === 1
      ? getPokemonAnimatedBackupUrl(pokemonId)
      : getPokemonSpriteUrl(pokemonId)

  const handleError = useCallback(() => {
    setFallbackLevel(prev => Math.min(prev + 1, 2))
  }, [])

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={pokemonName}
      className={className}
      onError={handleError}
      loading={lazy ? 'lazy' : undefined}
    />
  )
}
