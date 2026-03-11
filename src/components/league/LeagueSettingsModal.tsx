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
              </SelectContent>
            </Select>
          </div>

          {/* Weekly Trade Deadline */}
          <div className="space-y-2">
            <Label>Weekly Trade Deadline</Label>
            <Select
              value={settings.weeklyTradeDeadline === false ? 'off' : 'on'}
              onValueChange={(v) => setSettings(s => ({
                ...s,
                weeklyTradeDeadline: v === 'on',
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on">Enabled (trades lock on Sunday)</SelectItem>
                <SelectItem value="off">Disabled (trade anytime)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              When enabled, trades are locked on Sunday (match day) each week. Trades reopen on Monday.
            </p>
          </div>

          {/* Season Trade Deadline Week */}
          <div className="space-y-2">
            <Label>Season Trade Deadline</Label>
            <Select
              value={settings.tradeDeadlineWeek ? String(settings.tradeDeadlineWeek) : 'none'}
              onValueChange={(v) => setSettings(s => ({
                ...s,
                tradeDeadlineWeek: v === 'none' ? undefined : Number(v),
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No season deadline</SelectItem>
                {Array.from({ length: totalWeeks }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    After Week {i + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Hard cutoff after which no trades are allowed for the rest of the season.
            </p>
          </div>

          {/* Admin Override */}
          <div className="space-y-2">
            <Label>Admin Trade Override</Label>
            <Select
              value={settings.adminOverrideTradeDeadline ? 'on' : 'off'}
              onValueChange={(v) => setSettings(s => ({
                ...s,
                adminOverrideTradeDeadline: v === 'on',
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Disabled (deadlines apply to all)</SelectItem>
                <SelectItem value="on">Enabled (commissioner bypasses deadlines)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              When enabled, the commissioner can propose and approve trades even after deadlines.
            </p>
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
