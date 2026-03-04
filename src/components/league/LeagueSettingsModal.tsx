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
import { Switch } from '@/components/ui/switch'
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
  totalWeeks,
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

          {/* Nuzlocke Mode */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Nuzlocke Mode</Label>
              <p className="text-xs text-muted-foreground">
                Pokemon that faint are permanently eliminated
              </p>
            </div>
            <Switch
              checked={settings.enableNuzlocke}
              onCheckedChange={(checked) => setSettings(s => ({ ...s, enableNuzlocke: checked }))}
            />
          </div>

          {/* Trading */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Trading</Label>
              <p className="text-xs text-muted-foreground">
                Allow teams to trade Pokemon between each other
              </p>
            </div>
            <Switch
              checked={settings.enableTrades}
              onCheckedChange={(checked) => setSettings(s => ({ ...s, enableTrades: checked }))}
            />
          </div>

          {/* Trade Deadline */}
          {settings.enableTrades && (
            <div className="space-y-2">
              <Label>Trade Deadline</Label>
              <Select
                value={settings.tradeDeadlineWeek?.toString() || 'none'}
                onValueChange={(v) => setSettings(s => ({
                  ...s,
                  tradeDeadlineWeek: v === 'none' ? undefined : parseInt(v),
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No deadline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No deadline</SelectItem>
                  {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(week => (
                    <SelectItem key={week} value={week.toString()}>
                      After Week {week}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Trading will be locked after this week
              </p>
            </div>
          )}
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
