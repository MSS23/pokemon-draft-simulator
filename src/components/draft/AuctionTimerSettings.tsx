'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock, Check } from 'lucide-react'

interface AuctionTimerSettingsProps {
  isOpen: boolean
  onClose: () => void
  currentDuration: number
  onSetDuration: (duration: number) => Promise<void>
}

export default function AuctionTimerSettings({
  isOpen,
  onClose,
  currentDuration,
  onSetDuration
}: AuctionTimerSettingsProps) {
  const [duration, setDuration] = useState(currentDuration.toString())
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  const handleSave = async () => {
    const newDuration = parseInt(duration)
    if (isNaN(newDuration) || newDuration < 10) return

    try {
      setIsSaving(true)
      await onSetDuration(newDuration)
      setIsSaved(true)
      setTimeout(() => {
        setIsSaved(false)
        onClose()
      }, 1500)
    } catch (error) {
      console.error('Error setting auction duration:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const hasChanged = parseInt(duration) !== currentDuration

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Default Auction Timer
          </DialogTitle>
          <DialogDescription>
            Set the default duration for all new auctions. Nominators can still adjust the timer when nominating.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="duration">Auction Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger id="duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 seconds (Speed Draft)</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="45">45 seconds</SelectItem>
                <SelectItem value="60">1 minute (Default)</SelectItem>
                <SelectItem value="90">90 seconds</SelectItem>
                <SelectItem value="120">2 minutes</SelectItem>
                <SelectItem value="180">3 minutes</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Current setting: <span className="font-semibold">{currentDuration} seconds</span>
            </p>
          </div>

          {isSaved && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400">
              <Check className="h-4 w-4" />
              <span className="text-sm font-medium">Timer updated successfully!</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline" disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanged || isSaving || isSaved}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving ? 'Saving...' : isSaved ? 'Saved!' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
