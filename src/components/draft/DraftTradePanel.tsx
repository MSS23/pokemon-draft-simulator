'use client'

import { useState, useMemo, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ArrowLeftRight, Check, X, AlertTriangle, Loader2 } from 'lucide-react'
import { DraftTradeService, type DraftTradeValidation } from '@/lib/draft-trade-service'
import { notify } from '@/lib/notifications'
import { createLogger } from '@/lib/logger'

const log = createLogger('DraftTradePanel')

interface TeamData {
  id: string
  name: string
  userName: string
  picks: Array<{
    id: string
    pokemonId: string
    pokemonName: string
    cost: number
  }>
}

interface DraftTradePanelProps {
  draftId: string
  teams: TeamData[]
  userTeamId: string | null
  minPokemonPerTeam: number
  onTradeComplete: () => void
}

export default function DraftTradePanel({
  draftId,
  teams,
  userTeamId,
  minPokemonPerTeam,
  onTradeComplete,
}: DraftTradePanelProps) {
  const [isTradeOpen, setIsTradeOpen] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [myOffered, setMyOffered] = useState<string[]>([])
  const [theirOffered, setTheirOffered] = useState<string[]>([])
  const [validation, setValidation] = useState<DraftTradeValidation | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const myTeam = useMemo(() => teams.find(t => t.id === userTeamId), [teams, userTeamId])
  const otherTeams = useMemo(() => teams.filter(t => t.id !== userTeamId), [teams, userTeamId])
  const selectedTeam = useMemo(() => teams.find(t => t.id === selectedTeamId), [teams, selectedTeamId])

  const myOfferedCost = useMemo(() => {
    if (!myTeam) return 0
    return myTeam.picks.filter(p => myOffered.includes(p.id)).reduce((sum, p) => sum + p.cost, 0)
  }, [myTeam, myOffered])

  const theirOfferedCost = useMemo(() => {
    if (!selectedTeam) return 0
    return selectedTeam.picks.filter(p => theirOffered.includes(p.id)).reduce((sum, p) => sum + p.cost, 0)
  }, [selectedTeam, theirOffered])

  const costDiff = myOfferedCost - theirOfferedCost
  const costsMatch = myOfferedCost > 0 && theirOfferedCost > 0 && costDiff === 0

  const resetTrade = useCallback(() => {
    setMyOffered([])
    setTheirOffered([])
    setValidation(null)
    setError(null)
    setSelectedTeamId('')
  }, [])

  const toggleMyPick = useCallback((pickId: string) => {
    setMyOffered(prev => prev.includes(pickId) ? prev.filter(id => id !== pickId) : [...prev, pickId])
    setValidation(null)
  }, [])

  const toggleTheirPick = useCallback((pickId: string) => {
    setTheirOffered(prev => prev.includes(pickId) ? prev.filter(id => id !== pickId) : [...prev, pickId])
    setValidation(null)
  }, [])

  const handleValidate = useCallback(async () => {
    if (!userTeamId || !selectedTeamId) return
    setIsValidating(true)
    setError(null)

    try {
      const result = await DraftTradeService.validateTrade({
        draftId,
        fromTeamId: userTeamId,
        toTeamId: selectedTeamId,
        fromPicks: myOffered,
        toPicks: theirOffered,
      }, minPokemonPerTeam)

      setValidation(result)
      if (!result.valid) {
        setError(result.reason || 'Trade is not valid')
      }
    } catch (err) {
      log.error('Validation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to validate trade')
    } finally {
      setIsValidating(false)
    }
  }, [draftId, userTeamId, selectedTeamId, myOffered, theirOffered, minPokemonPerTeam])

  const handleExecute = useCallback(async () => {
    if (!userTeamId || !selectedTeamId || !validation?.valid) return
    setIsExecuting(true)
    setError(null)

    try {
      await DraftTradeService.executeTrade({
        draftId,
        fromTeamId: userTeamId,
        toTeamId: selectedTeamId,
        fromPicks: myOffered,
        toPicks: theirOffered,
      }, minPokemonPerTeam)

      notify.success('Trade Complete!', 'Pokemon have been swapped successfully')
      setIsTradeOpen(false)
      resetTrade()
      onTradeComplete()
    } catch (err) {
      log.error('Trade execution error:', err)
      setError(err instanceof Error ? err.message : 'Failed to execute trade')
      notify.error('Trade Failed', err instanceof Error ? err.message : 'Trade could not be completed')
    } finally {
      setIsExecuting(false)
    }
  }, [draftId, userTeamId, selectedTeamId, myOffered, theirOffered, minPokemonPerTeam, validation, resetTrade, onTradeComplete])

  if (!userTeamId || !myTeam) {
    return null
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsTradeOpen(true)}
        className="flex items-center gap-2"
      >
        <ArrowLeftRight className="h-4 w-4" />
        Propose Trade
      </Button>

      <Dialog open={isTradeOpen} onOpenChange={(open) => { if (!open) { resetTrade(); setIsTradeOpen(false) } }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ArrowLeftRight className="h-5 w-5 text-blue-500" />
              Propose Trade
            </DialogTitle>
            <DialogDescription>
              Select Pokemon to trade. Both sides must have equal total cost.
            </DialogDescription>
          </DialogHeader>

          {/* Team Selector */}
          <div className="mb-4">
            <Select
              value={selectedTeamId}
              onValueChange={(val) => { setSelectedTeamId(val); setTheirOffered([]); setValidation(null) }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a team to trade with" />
              </SelectTrigger>
              <SelectContent>
                {otherTeams.map(team => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name} ({team.userName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTeam && (
            <div className="flex-1 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* My Team */}
                <Card className="p-3">
                  <div className="mb-2">
                    <div className="font-semibold text-sm">{myTeam.name} Gives</div>
                    <div className="text-xs text-muted-foreground">
                      Selected: {myOffered.length} | Cost: {myOfferedCost} pts
                    </div>
                  </div>
                  <ScrollArea className="h-[350px] pr-2">
                    <div className="space-y-1.5">
                      {myTeam.picks.map(pick => {
                        const isSelected = myOffered.includes(pick.id)
                        return (
                          <div
                            key={pick.id}
                            onClick={() => toggleMyPick(pick.id)}
                            className={`p-2 border rounded-lg cursor-pointer transition-all text-sm ${
                              isSelected
                                ? 'border-red-400 bg-red-50 dark:bg-red-950/20'
                                : 'hover:border-red-300 hover:bg-muted'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{pick.pokemonName}</span>
                              <Badge variant="outline" className="text-xs">{pick.cost} pts</Badge>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </Card>

                {/* Trade Summary */}
                <div className="flex flex-col items-center justify-center space-y-3">
                  <ArrowLeftRight className="h-10 w-10 text-blue-500" />

                  <Card className="w-full p-3 bg-muted/50">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>{myTeam.name}:</span>
                        <span className="font-semibold">{myOfferedCost} pts</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{selectedTeam.name}:</span>
                        <span className="font-semibold">{theirOfferedCost} pts</span>
                      </div>
                      <div className="border-t pt-2">
                        <div className="flex justify-between items-center">
                          <span>Difference:</span>
                          <Badge variant={costsMatch ? 'default' : 'destructive'} className="text-xs">
                            {costsMatch ? 'Equal' : `${Math.abs(costDiff)} pts ${costDiff > 0 ? 'over' : 'under'}`}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </Card>

                  {validation && (
                    <Badge
                      variant={validation.valid ? 'default' : 'destructive'}
                      className="text-xs"
                    >
                      {validation.valid ? (
                        <><Check className="h-3 w-3 mr-1" /> Valid Trade</>
                      ) : (
                        <><X className="h-3 w-3 mr-1" /> Invalid</>
                      )}
                    </Badge>
                  )}
                </div>

                {/* Their Team */}
                <Card className="p-3">
                  <div className="mb-2">
                    <div className="font-semibold text-sm">{selectedTeam.name} Gives</div>
                    <div className="text-xs text-muted-foreground">
                      Selected: {theirOffered.length} | Cost: {theirOfferedCost} pts
                    </div>
                  </div>
                  <ScrollArea className="h-[350px] pr-2">
                    <div className="space-y-1.5">
                      {selectedTeam.picks.map(pick => {
                        const isSelected = theirOffered.includes(pick.id)
                        return (
                          <div
                            key={pick.id}
                            onClick={() => toggleTheirPick(pick.id)}
                            className={`p-2 border rounded-lg cursor-pointer transition-all text-sm ${
                              isSelected
                                ? 'border-green-400 bg-green-50 dark:bg-green-950/20'
                                : 'hover:border-green-300 hover:bg-muted'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{pick.pokemonName}</span>
                              <Badge variant="outline" className="text-xs">{pick.cost} pts</Badge>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </Card>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { resetTrade(); setIsTradeOpen(false) }}>
              Cancel
            </Button>
            {!validation?.valid ? (
              <Button
                onClick={handleValidate}
                disabled={!costsMatch || myOffered.length === 0 || theirOffered.length === 0 || isValidating}
              >
                {isValidating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating...</>
                ) : (
                  <><Check className="mr-2 h-4 w-4" /> Validate Trade</>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleExecute}
                disabled={isExecuting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isExecuting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Executing...</>
                ) : (
                  <><ArrowLeftRight className="mr-2 h-4 w-4" /> Execute Trade</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
