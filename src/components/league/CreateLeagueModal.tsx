'use client'

/**
 * Create League Modal Component
 *
 * Wizard for creating a league from a completed draft with configuration options:
 * - League name
 * - Number of weeks (6-20)
 * - Match format (best of 1/3/5)
 * - Nuzlocke mode toggle
 * - Trade system toggle
 * - Trade deadline week
 * - Commissioner approval requirement
 */

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LeagueService } from '@/lib/league-service'
import { Loader2, Trophy, Users, Calendar, Swords, Repeat, Shield, Skull } from 'lucide-react'

interface CreateLeagueModalProps {
  isOpen: boolean
  onClose: () => void
  draftId: string
  draftName: string
  teamCount: number
  onSuccess: (leagueId: string) => void
}

export function CreateLeagueModal({
  isOpen,
  onClose,
  draftId,
  draftName,
  teamCount,
  onSuccess,
}: CreateLeagueModalProps) {
  const [leagueName, setLeagueName] = useState(`${draftName} Season 1`)
  const [totalWeeks, setTotalWeeks] = useState(10)
  const [matchFormat, setMatchFormat] = useState<'best_of_1' | 'best_of_3' | 'best_of_5'>('best_of_3')
  const [splitConferences, setSplitConferences] = useState(false)
  const [enableNuzlocke, setEnableNuzlocke] = useState(false)
  const [enableTrades, setEnableTrades] = useState(true)
  const [tradeDeadlineWeek, setTradeDeadlineWeek] = useState<number | null>(8)
  const [requireCommissionerApproval, setRequireCommissionerApproval] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSplitConferences = teamCount >= 4

  const handleCreate = async () => {
    setError(null)
    setIsCreating(true)

    try {
      // Create league
      const { leagues } = await LeagueService.createLeagueFromDraft(draftId, {
        leagueName,
        totalWeeks,
        matchFormat,
        splitIntoConferences: splitConferences && canSplitConferences,
        startDate: new Date(),
      })

      const leagueId = leagues[0].id

      // Update league settings with extended options
      await LeagueService.updateLeagueSettings(leagueId, {
        enableNuzlocke,
        enableTrades,
        tradeDeadlineWeek: enableTrades ? (tradeDeadlineWeek ?? undefined) : undefined,
        requireCommissionerApproval: enableTrades ? requireCommissionerApproval : false,
        matchFormat,
      })

      // Initialize Pokemon status for all teams
      await LeagueService.initializeLeaguePokemonStatus(leagueId)

      onSuccess(leagueId)
      onClose()
    } catch (err) {
      console.error('Failed to create league:', err)
      setError(err instanceof Error ? err.message : 'Failed to create league')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Trophy className="h-6 w-6 text-yellow-500" />
            Create League
          </DialogTitle>
          <DialogDescription>
            Configure your post-draft league with weekly fixtures, standings, and optional features
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* League Name */}
          <div className="space-y-2">
            <Label htmlFor="league-name" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              League Name
            </Label>
            <Input
              id="league-name"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              placeholder="My Pokemon League Season 1"
            />
          </div>

          {/* Total Weeks */}
          <div className="space-y-2">
            <Label htmlFor="total-weeks" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Number of Weeks
            </Label>
            <Select value={String(totalWeeks)} onValueChange={(v) => setTotalWeeks(Number(v))}>
              <SelectTrigger id="total-weeks">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[6, 8, 10, 12, 14, 16, 18, 20].map((weeks) => (
                  <SelectItem key={weeks} value={String(weeks)}>
                    {weeks} weeks
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Each week, teams will play one match in a round-robin format
            </p>
          </div>

          {/* Match Format */}
          <div className="space-y-2">
            <Label htmlFor="match-format" className="flex items-center gap-2">
              <Swords className="h-4 w-4" />
              Match Format
            </Label>
            <Select value={matchFormat} onValueChange={(v) => setMatchFormat(v as any)}>
              <SelectTrigger id="match-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="best_of_1">Best of 1 (single game)</SelectItem>
                <SelectItem value="best_of_3">Best of 3 (recommended)</SelectItem>
                <SelectItem value="best_of_5">Best of 5 (competitive)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Split Conferences */}
          {canSplitConferences && (
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <Label htmlFor="split-conferences" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Split into Conferences
                </Label>
                <p className="text-sm text-muted-foreground">
                  Divide teams into Conference A and B for separate standings
                </p>
              </div>
              <Switch
                id="split-conferences"
                checked={splitConferences}
                onCheckedChange={setSplitConferences}
              />
            </div>
          )}

          {/* Nuzlocke Mode */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-red-50 dark:bg-red-950/20">
            <div className="space-y-1">
              <Label htmlFor="enable-nuzlocke" className="flex items-center gap-2">
                <Skull className="h-4 w-4 text-red-600 dark:text-red-400" />
                Nuzlocke Mode
              </Label>
              <p className="text-sm text-muted-foreground">
                Pokemon that faint in matches are permanently removed (hardcore mode)
              </p>
            </div>
            <Switch
              id="enable-nuzlocke"
              checked={enableNuzlocke}
              onCheckedChange={setEnableNuzlocke}
            />
          </div>

          {/* Trading System */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="enable-trades" className="flex items-center gap-2">
                  <Repeat className="h-4 w-4" />
                  Enable Trading
                </Label>
                <p className="text-sm text-muted-foreground">
                  Allow Pokemon trades between teams during the season
                </p>
              </div>
              <Switch
                id="enable-trades"
                checked={enableTrades}
                onCheckedChange={setEnableTrades}
              />
            </div>

            {enableTrades && (
              <>
                {/* Trade Deadline */}
                <div className="space-y-2 pl-6">
                  <Label htmlFor="trade-deadline" className="text-sm">
                    Trade Deadline
                  </Label>
                  <Select
                    value={tradeDeadlineWeek ? String(tradeDeadlineWeek) : 'none'}
                    onValueChange={(v) => setTradeDeadlineWeek(v === 'none' ? null : Number(v))}
                  >
                    <SelectTrigger id="trade-deadline" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No deadline</SelectItem>
                      {Array.from({ length: totalWeeks - 2 }, (_, i) => i + 2).map((week) => (
                        <SelectItem key={week} value={String(week)}>
                          Week {week}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Trades locked after this week
                  </p>
                </div>

                {/* Commissioner Approval */}
                <div className="flex items-center justify-between pl-6">
                  <div className="space-y-1">
                    <Label htmlFor="commissioner-approval" className="text-sm flex items-center gap-2">
                      <Shield className="h-3 w-3" />
                      Require Commissioner Approval
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Trades must be approved by league commissioner
                    </p>
                  </div>
                  <Switch
                    id="commissioner-approval"
                    checked={requireCommissionerApproval}
                    onCheckedChange={setRequireCommissionerApproval}
                  />
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !leagueName.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating League...
              </>
            ) : (
              'Create League'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
