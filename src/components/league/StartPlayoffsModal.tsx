'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Trophy } from 'lucide-react'
import type { Standing, Team } from '@/types'
import type { TournamentFormat } from '@/lib/tournament-service'
import {
  createTournament,
  startTournament,
  exportTournament,
} from '@/lib/tournament-service'
import { LeagueService } from '@/lib/league-service'

interface StartPlayoffsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leagueId: string
  leagueName: string
  standings: (Standing & { team: Team })[]
  onPlayoffsStarted: (tournamentJson: string) => void
}

const FORMAT_OPTIONS: { value: TournamentFormat; label: string; desc: string }[] = [
  { value: 'single-elimination', label: 'Single Elimination', desc: 'Lose once and you\'re out' },
  { value: 'double-elimination', label: 'Double Elimination', desc: 'Must lose twice to be eliminated' },
  { value: 'swiss', label: 'Swiss System', desc: 'Everyone plays, paired by record' },
  { value: 'round-robin', label: 'Round Robin', desc: 'Everyone plays everyone' },
]

export function StartPlayoffsModal({
  open,
  onOpenChange,
  leagueId,
  leagueName,
  standings,
  onPlayoffsStarted,
}: StartPlayoffsModalProps) {
  const [format, setFormat] = useState<TournamentFormat>('single-elimination')
  const [topN, setTopN] = useState(Math.min(standings.length, 8))
  const [isStarting, setIsStarting] = useState(false)

  const qualifiedTeams = standings.slice(0, topN)

  const handleStart = async () => {
    setIsStarting(true)
    try {
      const participants = qualifiedTeams.map((s, i) => ({
        id: s.team.id,
        name: s.team.name,
        teamId: s.team.id,
        seed: i + 1,
      }))

      let tournament = createTournament(
        `${leagueName} Playoffs`,
        format,
        participants,
      )

      tournament = startTournament(tournament)

      const json = exportTournament(tournament)

      // Save to league settings
      await LeagueService.savePlayoffState(leagueId, JSON.parse(json))

      onPlayoffsStarted(json)
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to start playoffs:', err)
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Start Playoffs
          </DialogTitle>
          <DialogDescription>
            Configure playoff format and select qualifying teams.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Format</label>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  className={`p-2 rounded-lg border text-left text-sm transition-colors ${
                    format === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Team Count */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Qualifying Teams: {topN} of {standings.length}
            </label>
            <input
              type="range"
              min={2}
              max={standings.length}
              value={topN}
              onChange={e => setTopN(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Seeding Preview */}
          <div>
            <label className="text-sm font-medium mb-1 block">Seeding (by standings)</label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {qualifiedTeams.map((s, i) => (
                <div key={s.team.id} className="flex items-center gap-2 text-sm px-2 py-1 rounded bg-muted/50">
                  <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0 text-xs">
                    {i + 1}
                  </Badge>
                  <span className="truncate">{s.team.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {s.wins}W-{s.losses}L
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={isStarting || qualifiedTeams.length < 2}>
            {isStarting ? 'Starting...' : 'Start Playoffs'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
