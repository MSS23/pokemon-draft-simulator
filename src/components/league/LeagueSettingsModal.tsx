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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LeagueService } from '@/lib/league-service'
import { Loader2 } from 'lucide-react'
import type { ExtendedLeagueSettings } from '@/types'
import { createLogger } from '@/lib/logger'

const log = createLogger('LeagueSettingsModal')

interface LeagueSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  leagueId: string
  currentSettings: ExtendedLeagueSettings
  totalWeeks: number
  onSave: () => void
}

export function LeagueSettingsModal({
  isOpen,
  onClose,
  leagueId,
  currentSettings,
  totalWeeks: _totalWeeks,
  onSave,
}: LeagueSettingsModalProps) {
  const [settings, setSettings] = useState<ExtendedLeagueSettings>({ ...currentSettings })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    try {
      setSaving(true)
      await LeagueService.updateLeagueSettings(leagueId, settings)
      onSave()
    } catch (err) {
      log.error('Failed to save league settings:', err)
      alert('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>League Settings</DialogTitle>
          <DialogDescription>
            Configure league rules and options. Only the league host can change these.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Match Format */}
          <div className="space-y-2">
            <Label>Match Format</Label>
            <Select
              value={settings.matchFormat}
              onValueChange={(v) => setSettings(s => ({
                ...s,
                matchFormat: v as ExtendedLeagueSettings['matchFormat'],
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="best_of_1">Best of 1</SelectItem>
                <SelectItem value="best_of_3">Best of 3</SelectItem>
                <SelectItem value="best_of_5">Best of 5</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
