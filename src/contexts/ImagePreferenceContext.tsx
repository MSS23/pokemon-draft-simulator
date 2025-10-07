'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

type ImageType = 'gif' | 'png'

interface ImagePreferenceContextType {
  imageType: ImageType
  setImageType: (type: ImageType) => void
  toggleImageType: () => void
}

const ImagePreferenceContext = createContext<ImagePreferenceContextType | undefined>(undefined)

const IMAGE_PREFERENCE_KEY = 'pokemon-draft-image-preference'

export function ImagePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [imageType, setImageTypeState] = useState<ImageType>('gif')
  const [mounted, setMounted] = useState(false)

  // Load preference from localStorage on mount
  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem(IMAGE_PREFERENCE_KEY) as ImageType | null
    if (stored === 'gif' || stored === 'png') {
      setImageTypeState(stored)
    }
  }, [])

  const setImageType = (type: ImageType) => {
    setImageTypeState(type)
    if (mounted) {
      localStorage.setItem(IMAGE_PREFERENCE_KEY, type)
    }
  }

  const toggleImageType = () => {
    setImageType(imageType === 'gif' ? 'png' : 'gif')
  }

  return (
    <ImagePreferenceContext.Provider value={{ imageType, setImageType, toggleImageType }}>
      {children}
    </ImagePreferenceContext.Provider>
  )
}

export function useImagePreference() {
  const context = useContext(ImagePreferenceContext)
  if (context === undefined) {
    // Return default values if context is not available (shouldn't happen in production)
    console.warn('useImagePreference used outside ImagePreferenceProvider, using defaults')
    return {
      imageType: 'gif' as const,
      setImageType: () => {},
      toggleImageType: () => {}
    }
  }
  return context
}
