'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { soundService } from '@/lib/sound-service'
import { Volume2, VolumeX, Bell, BellOff, Vibrate, Sparkles } from 'lucide-react'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [soundEnabled, setSoundEnabled] = useState(soundService.isEnabled())
  const [volume, setVolume] = useState(soundService.getVolume() * 100)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [animationsEnabled, setAnimationsEnabled] = useState(true)
  const [hapticEnabled, setHapticEnabled] = useState(true)

  useEffect(() => {
    // Load settings from localStorage
    try {
      const notifications = localStorage.getItem('notificationsEnabled')
      const animations = localStorage.getItem('animationsEnabled')
      const haptic = localStorage.getItem('hapticEnabled')

      if (notifications !== null) setNotificationsEnabled(notifications === 'true')
      if (animations !== null) setAnimationsEnabled(animations === 'true')
      if (haptic !== null) setHapticEnabled(haptic === 'true')
    } catch (error) {
      console.warn('Failed to load settings:', error)
    }
  }, [])

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled)
    soundService.setEnabled(enabled)
    if (enabled) {
      soundService.play('notification')
    }
  }

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0]
    setVolume(newVolume)
    soundService.setVolume(newVolume / 100)
  }

  const handleNotificationsToggle = (enabled: boolean) => {
    setNotificationsEnabled(enabled)
    localStorage.setItem('notificationsEnabled', String(enabled))
    if (enabled) {
      soundService.play('success')
    }
  }

  const handleAnimationsToggle = (enabled: boolean) => {
    setAnimationsEnabled(enabled)
    localStorage.setItem('animationsEnabled', String(enabled))
    // Apply to document
    if (enabled) {
      document.documentElement.classList.remove('no-animations')
    } else {
      document.documentElement.classList.add('no-animations')
    }
  }

  const handleHapticToggle = (enabled: boolean) => {
    setHapticEnabled(enabled)
    localStorage.setItem('hapticEnabled', String(enabled))
    if (enabled) {
      soundService.vibrate(50)
    }
  }

  const handleTestSound = () => {
    soundService.play('your-turn')
    if (hapticEnabled) {
      soundService.vibrate([50, 100, 50])
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize your draft experience
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Sound Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              Sound Effects
            </h3>

            <div className="flex items-center justify-between">
              <Label htmlFor="sound-enabled" className="flex flex-col gap-1">
                <span>Enable Sounds</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                  Play sounds for draft events
                </span>
              </Label>
              <Switch
                id="sound-enabled"
                checked={soundEnabled}
                onCheckedChange={handleSoundToggle}
              />
            </div>

            {soundEnabled && (
              <div className="space-y-2">
                <Label htmlFor="volume" className="text-sm">
                  Volume: {Math.round(volume)}%
                </Label>
                <Slider
                  id="volume"
                  min={0}
                  max={100}
                  step={5}
                  value={[volume]}
                  onValueChange={handleVolumeChange}
                  className="w-full"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestSound}
                  className="w-full"
                >
                  Test Sound
                </Button>
              </div>
            )}
          </div>

          {/* Notification Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              Notifications
            </h3>

            <div className="flex items-center justify-between">
              <Label htmlFor="notifications-enabled" className="flex flex-col gap-1">
                <span>Browser Notifications</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                  Show notifications for your turn
                </span>
              </Label>
              <Switch
                id="notifications-enabled"
                checked={notificationsEnabled}
                onCheckedChange={handleNotificationsToggle}
              />
            </div>
          </div>

          {/* Visual Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Visual Effects
            </h3>

            <div className="flex items-center justify-between">
              <Label htmlFor="animations-enabled" className="flex flex-col gap-1">
                <span>Animations & Confetti</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                  Show celebration animations
                </span>
              </Label>
              <Switch
                id="animations-enabled"
                checked={animationsEnabled}
                onCheckedChange={handleAnimationsToggle}
              />
            </div>
          </div>

          {/* Haptic Settings */}
          {typeof navigator !== 'undefined' && 'vibrate' in navigator && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Vibrate className="w-4 h-4" />
                Haptic Feedback
              </h3>

              <div className="flex items-center justify-between">
                <Label htmlFor="haptic-enabled" className="flex flex-col gap-1">
                  <span>Vibration</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                    Vibrate on important events (mobile)
                  </span>
                </Label>
                <Switch
                  id="haptic-enabled"
                  checked={hapticEnabled}
                  onCheckedChange={handleHapticToggle}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
