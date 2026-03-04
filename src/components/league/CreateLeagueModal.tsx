'use client'

/**
 * Create League Modal Component
 *
 * Wizard for creating a league from a completed draft with configuration options:
 * - League name
 * - Number of weeks (6-20)
 * - Match format (best of 1/3/5)
 * - Free agent picks configuration
 */

import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LeagueService } from '@/lib/league-service'
import { createLogger } from '@/lib/logger'
import { Loader2, Trophy, Users, Calendar, Swords, UserPlus } from 'lucide-react'

const log = createLogger('CreateLeagueModal')

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
  const [freeAgentPicksAllowed, setFreeAgentPicksAllowed] = useState(3)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const createInFlightRef = useRef(false)

  const canSplitConferences = teamCount >= 4

  const handleCreate = async () => {
    // Ref guard prevents double-submission (state updates are async)
    if (createInFlightRef.current) return
    createInFlightRef.current = true
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
        matchFormat,
        freeAgentPicksAllowed,
      })

      // Initialize Pokemon status for all teams
      await LeagueService.initializeLeaguePokemonStatus(leagueId)

      onSuccess(leagueId)
      onClose()
    } catch (err) {
      log.error('Failed to create league:', err)
      setError(err instanceof Error ? err.message : 'Failed to create league')
    } finally {
      setIsCreating(false)
      createInFlightRef.current = false
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
              aria-required="true"
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
            <Select value={matchFormat} onValueChange={(v) => setMatchFormat(v as 'best_of_1' | 'best_of_3' | 'best_of_5')}>
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

          {/* Free Agent Picks */}
          <div className="space-y-2">
            <Label htmlFor="free-agent-picks" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Free Agent Picks Allowed
            </Label>
            <Select value={String(freeAgentPicksAllowed)} onValueChange={(v) => setFreeAgentPicksAllowed(Number(v))}>
              <SelectTrigger id="free-agent-picks">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">None</SelectItem>
                <SelectItem value="1">1 pick</SelectItem>
                <SelectItem value="2">2 picks</SelectItem>
                <SelectItem value="3">3 picks</SelectItem>
                <SelectItem value="5">5 picks</SelectItem>
                <SelectItem value="10">10 picks</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Teams can claim free agents from the pool after the draft but before the first game is played. Once the first match starts, free agent claims are locked.
            </p>
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
