'use client'

/**
 * Trade Proposal Modal Component
 *
 * Interface for proposing Pokemon trades between teams:
 * - Drag-and-drop Pokemon builder
 * - Team A ↔ Team B interface
 * - Shows Pokemon status (can't trade dead)
 * - Trade notes/comments
 */

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TradeService } from '@/lib/trade-service'
import { PokemonStatusBadge } from './PokemonStatusBadge'
import { Loader2, ArrowLeftRight, AlertTriangle, Plus, X } from 'lucide-react'
import type { Pick, TeamPokemonStatus } from '@/types'

interface TradeProposalModalProps {
  isOpen: boolean
  onClose: () => void
  leagueId: string
  currentWeek: number
  fromTeamId: string
  fromTeamName: string
  toTeamId: string
  toTeamName: string
  fromTeamPicks: (Pick & { status?: TeamPokemonStatus })[]
  toTeamPicks: (Pick & { status?: TeamPokemonStatus })[]
  onSuccess: () => void
}

export function TradeProposalModal({
  isOpen,
  onClose,
  leagueId,
  currentWeek,
  fromTeamId,
  fromTeamName,
  toTeamId,
  toTeamName,
  fromTeamPicks,
  toTeamPicks,
  onSuccess,
}: TradeProposalModalProps) {
  const [selectedFromPicks, setSelectedFromPicks] = useState<string[]>([])
  const [selectedToPicks, setSelectedToPicks] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleFromPick = (pickId: string) => {
    setSelectedFromPicks(prev =>
      prev.includes(pickId) ? prev.filter(id => id !== pickId) : [...prev, pickId]
    )
  }

  const toggleToPick = (pickId: string) => {
    setSelectedToPicks(prev =>
      prev.includes(pickId) ? prev.filter(id => id !== pickId) : [...prev, pickId]
    )
  }

  const handleSubmit = async () => {
    setError(null)

    // Validation
    if (selectedFromPicks.length === 0 && selectedToPicks.length === 0) {
      setError('You must select at least one Pokemon to trade')
      return
    }

    setIsSubmitting(true)

    try {
      await TradeService.proposeTrade(
        leagueId,
        currentWeek,
        fromTeamId,
        toTeamId,
        selectedFromPicks,
        selectedToPicks,
        notes || undefined
      )

      onSuccess()
      onClose()
    } catch (err) {
      console.error('Failed to propose trade:', err)
      setError(err instanceof Error ? err.message : 'Failed to propose trade')
    } finally {
      setIsSubmitting(false)
    }
  }

  const availableFromPicks = fromTeamPicks.filter(p => !p.status || p.status.status !== 'dead')
  const availableToPicks = toTeamPicks.filter(p => !p.status || p.status.status !== 'dead')

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <ArrowLeftRight className="h-6 w-6 text-blue-500" />
            Propose Trade
          </DialogTitle>
          <DialogDescription>
            Select Pokemon to trade between {fromTeamName} and {toTeamName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
            {/* From Team */}
            <Card className="p-4">
              <div className="mb-3">
                <Label className="text-base font-semibold">{fromTeamName} Gives</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Select Pokemon to offer
                </p>
              </div>

              <ScrollArea className="h-[400px] pr-3">
                <div className="space-y-2">
                  {availableFromPicks.map(pick => {
                    const isSelected = selectedFromPicks.includes(pick.id)
                    return (
                      <div
                        key={pick.id}
                        onClick={() => toggleFromPick(pick.id)}
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                            : 'hover:border-blue-300 hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{pick.pokemonName}</div>
                            <div className="text-xs text-muted-foreground">
                              Cost: {pick.cost} • Round {pick.round}
                            </div>
                          </div>
                          {pick.status && (
                            <PokemonStatusBadge
                              status={pick.status.status}
                              size="sm"
                              showText={false}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {availableFromPicks.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-8">
                      No Pokemon available to trade
                    </p>
                  )}
                </div>
              </ScrollArea>
            </Card>

            {/* Trade Summary */}
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="text-center">
                <ArrowLeftRight className="h-12 w-12 text-blue-500 mx-auto mb-2" />
                <div className="text-sm font-medium">Trade Summary</div>
              </div>

              <Card className="w-full p-4 bg-muted/50">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">{fromTeamName} gives:</Label>
                    <div className="mt-1 space-y-1">
                      {selectedFromPicks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing</p>
                      ) : (
                        selectedFromPicks.map(pickId => {
                          const pick = fromTeamPicks.find(p => p.id === pickId)
                          return (
                            <div key={pickId} className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {pick?.pokemonName}
                              </Badge>
                              <button
                                onClick={() => toggleFromPick(pickId)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <Label className="text-xs text-muted-foreground">{toTeamName} gives:</Label>
                    <div className="mt-1 space-y-1">
                      {selectedToPicks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing</p>
                      ) : (
                        selectedToPicks.map(pickId => {
                          const pick = toTeamPicks.find(p => p.id === pickId)
                          return (
                            <div key={pickId} className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {pick?.pokemonName}
                              </Badge>
                              <button
                                onClick={() => toggleToPick(pickId)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              <div className="w-full">
                <Label htmlFor="trade-notes" className="text-sm">Trade Notes (Optional)</Label>
                <Textarea
                  id="trade-notes"
                  placeholder="Add notes about this trade..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1"
                />
              </div>
            </div>

            {/* To Team */}
            <Card className="p-4">
              <div className="mb-3">
                <Label className="text-base font-semibold">{toTeamName} Gives</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Select Pokemon to receive
                </p>
              </div>

              <ScrollArea className="h-[400px] pr-3">
                <div className="space-y-2">
                  {availableToPicks.map(pick => {
                    const isSelected = selectedToPicks.includes(pick.id)
                    return (
                      <div
                        key={pick.id}
                        onClick={() => toggleToPick(pick.id)}
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                            : 'hover:border-blue-300 hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{pick.pokemonName}</div>
                            <div className="text-xs text-muted-foreground">
                              Cost: {pick.cost} • Round {pick.round}
                            </div>
                          </div>
                          {pick.status && (
                            <PokemonStatusBadge
                              status={pick.status.status}
                              size="sm"
                              showText={false}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {availableToPicks.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-8">
                      No Pokemon available to trade
                    </p>
                  )}
                </div>
              </ScrollArea>
            </Card>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || (selectedFromPicks.length === 0 && selectedToPicks.length === 0)}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Proposing Trade...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Propose Trade
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
