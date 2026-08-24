/**
 * Custom hook for Pokemon image handling with fallback logic
 * Centralizes image loading, error handling, and fallback logic
 */

import { useState, useCallback, useEffect } from 'react'
import {
  getBestPokemonImageUrl,
  getPokemonAnimatedBackupUrl,
  getPokemonSpriteUrl,
} from '@/utils/pokemon'

export interface PokemonImageConfig {
  pokemonId: string
  pokemonName: string
  preferOfficialArt?: boolean
}

export interface PokemonImageState {
  imageUrl: string
  isLoading: boolean
  hasError: boolean
  currentFallback: number
  showingOfficialArt: boolean
}

export interface PokemonImageActions {
  handleImageError: () => void
  handleImageLoad: () => void
  toggleImageMode: () => void
  resetImage: () => void
}

/**
 * Hook for managing Pokemon image state with automatic fallbacks (GIFs only)
 */
export function usePokemonImage({
  pokemonId,
  pokemonName,
}: PokemonImageConfig): PokemonImageState & PokemonImageActions {
  const [fallbackAttempt, setFallbackAttempt] = useState(0)
  const [imageError, setImageError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Reset the fallback chain when the Pokemon changes — otherwise a component
  // reused for a new Pokemon stays stuck on the previous one's error state.
  useEffect(() => {
    setFallbackAttempt(0)
    setImageError(false)
    setIsLoading(true)
  }, [pokemonId, pokemonName])

  // Showdown animated → PokeAPI showdown animated → static PNG (always exists)
  const getImageUrl = useCallback(() => {
    if (fallbackAttempt === 0) {
      return getBestPokemonImageUrl(pokemonId, pokemonName)
    }
    if (fallbackAttempt === 1) {
      return getPokemonAnimatedBackupUrl(pokemonId)
    }
    return getPokemonSpriteUrl(pokemonId)
  }, [pokemonId, pokemonName, fallbackAttempt])

  const handleImageError = useCallback(() => {
    if (fallbackAttempt < 2) {
      setFallbackAttempt(prev => prev + 1)
      setImageError(false)
    } else {
      setImageError(true)
      setIsLoading(false)
    }
  }, [fallbackAttempt])

  const handleImageLoad = useCallback(() => {
    setIsLoading(false)
    setImageError(false)
  }, [])

  const toggleImageMode = useCallback(() => {
    setFallbackAttempt(0)
    setImageError(false)
    setIsLoading(true)
  }, [])

  const resetImage = useCallback(() => {
    setFallbackAttempt(0)
    setImageError(false)
    setIsLoading(true)
  }, [])

  return {
    imageUrl: getImageUrl(),
    isLoading,
    hasError: imageError,
    currentFallback: fallbackAttempt,
    showingOfficialArt: false,
    handleImageError,
    handleImageLoad,
    toggleImageMode,
    resetImage
  }
}
