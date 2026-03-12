'use client'

import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { KnockoutService } from '@/lib/knockout-service'
import { createLogger } from '@/lib/logger'
import { Loader2, Swords, Trophy } from 'lucide-react'

const log = createLogger('CreateTournamentModal')

interface CreateTournamentModalProps {
  isOpen: boolean
  onClose: () => void
  draftId: string
  draftName: string
  teamCount: number
  onSuccess: (leagueId: string) => void
}

export function CreateTournamentModal({
  isOpen,
  onClose,
  draftId,
  draftName,
  teamCount,
  onSuccess,
}: CreateTournamentModalProps) {
  const [name, setName] = useState(`${draftName} Tournament`)
  const [matchFormat, setMatchFormat] = useState<'best_of_1' | 'best_of_3'>('best_of_3')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const createInFlightRef = useRef(false)

  const totalRounds = Math.ceil(Math.log2(teamCount))
  const nextPow2 = Math.pow(2, totalRounds)
  const byesNeeded = nextPow2 - teamCount

  const handleCreate = async () => {
    if (createInFlightRef.current) return
    createInFlightRef.current = true
    setError(null)
    setIsCreating(true)

    try {
      const { league } = await KnockoutService.createFromDraft(draftId, {
        name,
        matchFormat,
        seedByDraftOrder: true,
      })

      onSuccess(league.id)
      onClose()
    } catch (err) {
      log.error('Failed to create tournament:', err)
      setError(err instanceof Error ? err.message : 'Failed to create tournament')
    } finally {
      setIsCreating(false)
      createInFlightRef.current = false
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Swords className="h-5 w-5 text-red-500" />
            Create Knockout Tournament
          </DialogTitle>
          <DialogDescription>
            Single elimination bracket — lose once and you&apos;re out.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Tournament Name */}
          <div className="space-y-2">
            <Label htmlFor="tournament-name">Tournament Name</Label>
            <Input
              id="tournament-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Tournament"
              aria-required="true"
            />
          </div>

          {/* Match Format */}
          <div className="space-y-2">
            <Label htmlFor="tournament-match-format" className="flex items-center gap-2">
              <Swords className="h-4 w-4" />
              Match Format
            </Label>
            <Select value={matchFormat} onValueChange={(v) => setMatchFormat(v as 'best_of_1' | 'best_of_3')}>
              <SelectTrigger id="tournament-match-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="best_of_1">Best of 1</SelectItem>
                <SelectItem value="best_of_3">Best of 3 (recommended)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bracket Preview */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Bracket Preview
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>Players</span>
              <span className="font-medium text-foreground">{teamCount}</span>
              <span>Bracket Size</span>
              <span className="font-medium text-foreground">{nextPow2}</span>
              <span>Rounds</span>
              <span className="font-medium text-foreground">{totalRounds}</span>
              {byesNeeded > 0 && (
                <>
                  <span>First-round Byes</span>
                  <span className="font-medium text-foreground">{byesNeeded}</span>
                </>
              )}
              <span>Total Matches</span>
              <span className="font-medium text-foreground">{teamCount - 1}</span>
            </div>

            {/* Round names */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Array.from({ length: totalRounds }, (_, i) => {
                const remaining = totalRounds - i
                const roundName = remaining === 1 ? 'Finals'
                  : remaining === 2 ? 'Semis'
                  : remaining === 3 ? 'Quarters'
                  : `R${i + 1}`
                return (
                  <Badge key={i} variant="outline" className="text-xs">
                    {roundName}
                  </Badge>
                )
              })}
            </div>
          </div>

          {teamCount > KnockoutService.MAX_PLAYERS && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">
                Maximum {KnockoutService.MAX_PLAYERS} players supported for knockout tournaments.
              </p>
            </div>
          )}

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
          <Button
            onClick={handleCreate}
            disabled={isCreating || !name.trim() || teamCount > KnockoutService.MAX_PLAYERS || teamCount < 2}
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Tournament'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
