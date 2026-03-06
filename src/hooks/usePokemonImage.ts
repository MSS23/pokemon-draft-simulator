/**
 * Custom hook for Pokemon image handling with fallback logic
 * Centralizes image loading, error handling, and fallback logic
 */

import { useState, useCallback } from 'react'
import {
  getBestPokemonImageUrl,
  getPokemonAnimatedBackupUrl,
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

  // GIF-only: Showdown animated → PokeAPI showdown animated
  const getImageUrl = useCallback(() => {
    if (fallbackAttempt === 0) {
      return getBestPokemonImageUrl(pokemonId, pokemonName)
    }
    return getPokemonAnimatedBackupUrl(pokemonId)
  }, [pokemonId, pokemonName, fallbackAttempt])

  const handleImageError = useCallback(() => {
    if (fallbackAttempt < 1) {
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
