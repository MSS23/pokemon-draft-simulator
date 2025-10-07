/**
 * Custom hook for Pokemon image handling with fallback logic
 * Centralizes image loading, error handling, and fallback logic
 */

import { useState, useCallback } from 'react'
import {
  getBestPokemonImageUrl,
  getPokemonAnimatedBackupUrl,
  getPokemonSpriteUrl,
  getOfficialArtworkUrl
} from '@/utils/pokemon'
import { useImagePreference } from '@/contexts/ImagePreferenceContext'

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
 * Hook for managing Pokemon image state with automatic fallbacks
 */
export function usePokemonImage({
  pokemonId,
  pokemonName,
  preferOfficialArt = false
}: PokemonImageConfig): PokemonImageState & PokemonImageActions {
  const { imageType } = useImagePreference()
  const [fallbackAttempt, setFallbackAttempt] = useState(0)
  const [imageError, setImageError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showOfficialArt, setShowOfficialArt] = useState(preferOfficialArt)

  // Get image URL based on current state and global preference
  const getImageUrl = useCallback(() => {
    // If user prefers PNG, always use official artwork or static sprite
    if (imageType === 'png') {
      switch (fallbackAttempt) {
        case 0:
          return getOfficialArtworkUrl(pokemonId)
        case 1:
          return getPokemonSpriteUrl(pokemonId)
        default:
          return getBestPokemonImageUrl(pokemonId, pokemonName)
      }
    }

    // If user prefers GIF (animated)
    if (showOfficialArt) {
      switch (fallbackAttempt) {
        case 0:
          return getOfficialArtworkUrl(pokemonId)
        case 1:
          return getBestPokemonImageUrl(pokemonId, pokemonName)
        default:
          return getPokemonSpriteUrl(pokemonId)
      }
    } else {
      switch (fallbackAttempt) {
        case 0:
          return getBestPokemonImageUrl(pokemonId, pokemonName)
        case 1:
          return getPokemonAnimatedBackupUrl(pokemonId)
        case 2:
          return getPokemonSpriteUrl(pokemonId)
        default:
          return getOfficialArtworkUrl(pokemonId)
      }
    }
  }, [pokemonId, pokemonName, showOfficialArt, fallbackAttempt, imageType])

  // Handle image loading error
  const handleImageError = useCallback(() => {
    if (fallbackAttempt < 3) {
      setFallbackAttempt(prev => prev + 1)
      setImageError(false)
    } else {
      setImageError(true)
      setIsLoading(false)
    }
  }, [fallbackAttempt])

  // Handle successful image load
  const handleImageLoad = useCallback(() => {
    setIsLoading(false)
    setImageError(false)
  }, [])

  // Toggle between official art and sprite modes
  const toggleImageMode = useCallback(() => {
    setShowOfficialArt(prev => !prev)
    setFallbackAttempt(0) // Reset fallback when switching modes
    setImageError(false)
    setIsLoading(true)
  }, [])

  // Reset image state
  const resetImage = useCallback(() => {
    setFallbackAttempt(0)
    setImageError(false)
    setIsLoading(true)
    setShowOfficialArt(preferOfficialArt)
  }, [preferOfficialArt])

  return {
    // State
    imageUrl: getImageUrl(),
    isLoading,
    hasError: imageError,
    currentFallback: fallbackAttempt,
    showingOfficialArt: showOfficialArt,
    
    // Actions
    handleImageError,
    handleImageLoad,
    toggleImageMode,
    resetImage
  }
}
