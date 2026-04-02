'use client'

import { useState, useCallback } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { draftSounds } from '@/lib/draft-sounds'

/**
 * Compact mute / volume control for the draft header bar.
 *
 * - Click toggles mute.
 * - Hover or click the popover trigger reveals a volume slider.
 */
export default function SoundToggle({ className }: { className?: string }) {
  const [muted, setMuted] = useState(draftSounds.isMuted())
  const [volume, setVolume] = useState(draftSounds.getVolume() * 100)

  const handleToggleMute = useCallback(() => {
    const next = !muted
    setMuted(next)
    draftSounds.setMuted(next)
    if (!next) {
      draftSounds.play('tick')
    }
  }, [muted])

  const handleVolumeChange = useCallback(
    (value: number[]) => {
      const v = value[0]
      setVolume(v)
      draftSounds.setVolume(v / 100)
      if (muted && v > 0) {
        setMuted(false)
        draftSounds.setMuted(false)
      }
    },
    [muted],
  )

  const handleVolumeCommit = useCallback(() => {
    draftSounds.play('tick')
  }, [])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', className)}
          onClick={handleToggleMute}
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
        >
          {muted ? (
            <VolumeX className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="center"
        className="w-40 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Volume
          </span>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[volume]}
            onValueChange={handleVolumeChange}
            onValueCommit={handleVolumeCommit}
            aria-label="Sound volume"
          />
          <span className="text-xs tabular-nums text-center text-muted-foreground">
            {Math.round(volume)}%
          </span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
