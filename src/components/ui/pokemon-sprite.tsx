'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, getPokemonSpriteUrl, toShowdownName } from '@/utils/pokemon'

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

  // Reset the chain when the sprite target changes (components are often
  // reused across different Pokemon, e.g. keyed by list index)
  useEffect(() => {
    setFallbackLevel(0)
  }, [pokemonId, pokemonName])

  // Teamsheet entries have no real dex id (callers pass "0") — the id-keyed
  // fallback rungs would 404, so use name-keyed Showdown dex sprites instead.
  const hasRealId = Number.parseInt(pokemonId, 10) > 0
  const src = fallbackLevel === 0
    ? getPokemonAnimatedUrl(pokemonId, pokemonName)
    : hasRealId
      ? (fallbackLevel === 1 ? getPokemonAnimatedBackupUrl(pokemonId) : getPokemonSpriteUrl(pokemonId))
      : `https://play.pokemonshowdown.com/sprites/dex/${toShowdownName(pokemonName)}.png`

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
