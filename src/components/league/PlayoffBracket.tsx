'use client'

import { memo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Trophy } from 'lucide-react'
import type { Tournament, Round, Match } from '@/lib/tournament-service'

interface PlayoffBracketProps {
  tournament: Tournament
  /** Commissioner-only: click a participant on a ready match to declare the winner */
  onReportResult?: (matchId: string, winnerId: string) => void
  className?: string
}

export const PlayoffBracket = memo(function PlayoffBracket({ tournament, onReportResult, className }: PlayoffBracketProps) {
  if (!tournament || tournament.rounds.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-muted-foreground">
          No playoff bracket generated yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4 text-yellow-500" />
          Playoffs — {formatName(tournament.format)}
          {tournament.winner && (
            <Badge variant="default" className="ml-2">
              Champion: {tournament.winner.name}
            </Badge>
          )}
        </CardTitle>
        {onReportResult && !tournament.winner && (
          <p className="text-xs text-muted-foreground">
            Click a team on a ready match to record them as the winner.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 sm:gap-6 overflow-x-auto pb-4 -mx-2 px-2 snap-x snap-mandatory">
          {tournament.rounds
            .filter(r => r.matches.length > 0)
            .map(round => (
              <RoundColumn key={round.roundNumber} round={round} onReportResult={onReportResult} />
            ))}
        </div>
      </CardContent>
    </Card>
  )
})

function RoundColumn({ round, onReportResult }: { round: Round; onReportResult?: (matchId: string, winnerId: string) => void }) {
  return (
    <div className="flex flex-col gap-3 min-w-[160px] sm:min-w-[200px] snap-start">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
        {round.name}
        {round.bracket && (
          <span className="ml-1 text-[10px]">({round.bracket})</span>
        )}
      </div>
      <div className="flex flex-col gap-2 justify-around flex-1">
        {round.matches.map(match => (
          <MatchCard key={match.id} match={match} onReportResult={onReportResult} />
        ))}
      </div>
    </div>
  )
}

function MatchCard({ match, onReportResult }: { match: Match; onReportResult?: (matchId: string, winnerId: string) => void }) {
  const isComplete = match.status === 'completed'
  const isBye = match.status === 'bye'
  const isReportable =
    !!onReportResult && !isComplete && !isBye &&
    !!match.participant1 && !!match.participant2

  const report = (winnerId: string, winnerName: string) => {
    if (!isReportable) return
    if (window.confirm(`Record ${winnerName} as the winner of this match?`)) {
      onReportResult!(match.id, winnerId)
    }
  }

  return (
    <div className={cn(
      'border rounded-lg overflow-hidden text-sm',
      isComplete && 'border-green-200 dark:border-green-800',
      isBye && 'opacity-50',
    )}>
      <ParticipantRow
        name={match.participant1?.name || 'TBD'}
        score={match.score?.participant1}
        isWinner={match.winner?.id === match.participant1?.id}
        isComplete={isComplete}
        seed={match.participant1?.seed}
        onSelect={isReportable && match.participant1
          ? () => report(match.participant1!.id, match.participant1!.name)
          : undefined}
      />
      <div className="border-t" />
      <ParticipantRow
        name={match.participant2?.name || (isBye ? 'BYE' : 'TBD')}
        score={match.score?.participant2}
        isWinner={match.winner?.id === match.participant2?.id}
        isComplete={isComplete}
        seed={match.participant2?.seed}
        onSelect={isReportable && match.participant2
          ? () => report(match.participant2!.id, match.participant2!.name)
          : undefined}
      />
    </div>
  )
}

function ParticipantRow({
  name,
  score,
  isWinner,
  isComplete,
  seed,
  onSelect,
}: {
  name: string
  score?: number
  isWinner: boolean
  isComplete: boolean
  seed?: number
  onSelect?: () => void
}) {
  const content = (
    <>
      <div className="flex items-center gap-1.5 min-w-0">
        {seed && (
          <span className="text-[10px] text-muted-foreground w-4 text-right">{seed}</span>
        )}
        <span className="truncate">{name}</span>
      </div>
      {score !== undefined && (
        <span className="text-xs tabular-nums ml-2">{score}</span>
      )}
    </>
  )

  const rowClass = cn(
    'flex items-center justify-between px-2 py-1.5 w-full text-left',
    isComplete && isWinner && 'bg-green-50 dark:bg-green-900/20 font-semibold',
    isComplete && !isWinner && 'text-muted-foreground',
  )

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        title={`Mark ${name} as winner`}
        className={cn(rowClass, 'hover:bg-primary/10 focus-visible:bg-primary/10 cursor-pointer')}
      >
        {content}
      </button>
    )
  }

  return <div className={rowClass}>{content}</div>
}

function formatName(format: string): string {
  return format.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
