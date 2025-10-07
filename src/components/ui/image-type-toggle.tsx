'use client'

import { Button } from '@/components/ui/button'
import { useImagePreference } from '@/contexts/ImagePreferenceContext'
import { PlayCircle, ImageIcon } from 'lucide-react'

export function ImageTypeToggle() {
  const { imageType, toggleImageType } = useImagePreference()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleImageType}
      className="relative hover:bg-slate-100 dark:hover:bg-slate-800"
      title={imageType === 'gif' ? 'Using animated GIFs - Click for static PNGs' : 'Using static PNGs - Click for animated GIFs'}
    >
      {imageType === 'gif' ? (
        <>
          <PlayCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <span className="sr-only">Switch to PNG images</span>
        </>
      ) : (
        <>
          <ImageIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <span className="sr-only">Switch to animated GIFs</span>
        </>
      )}
    </Button>
  )
}
