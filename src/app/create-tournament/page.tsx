'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { useAuth } from '@/contexts/AuthContext'
import { KnockoutService } from '@/lib/knockout-service'
import { POKEMON_FORMATS, getFormatById } from '@/lib/formats'
import { notify } from '@/lib/notifications'
import { createLogger } from '@/lib/logger'
import {
  Swords, Trophy, ArrowLeft, Plus, Trash2, Loader2, Shield, ChevronLeft, ChevronRight,
} from 'lucide-react'

const log = createLogger('CreateTournamentPage')

const VGC_FORMATS = POKEMON_FORMATS
  .filter(f => f.category === 'vgc')
  .sort((a, b) => b.meta.popularity - a.meta.popularity || b.meta.lastUpdated.localeCompare(a.meta.lastUpdated))

const STEPS = [
  { id: 'format', label: 'Format' },
  { id: 'players', label: 'Players' },
  { id: 'settings', label: 'Settings' },
] as const

export default function CreateTournamentPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [step, setStep] = useState(0)
  const [isCreating, setIsCreating] = useState(false)

  const [name, setName] = useState('')
  const [formatId, setFormatId] = useState('')
  const [matchFormat, setMatchFormat] = useState<'best_of_1' | 'best_of_3'>('best_of_3')
  const [players, setPlayers] = useState<{ name: string }[]>([
    { name: '' }, { name: '' }, { name: '' }, { name: '' },
  ])

  const selectedFormat = formatId ? getFormatById(formatId) : null
  const validPlayers = players.filter(p => p.name.trim())
  const totalRounds = validPlayers.length >= 2 ? Math.ceil(Math.log2(validPlayers.length)) : 0
  const nextPow2 = validPlayers.length >= 2 ? Math.pow(2, totalRounds) : 0
  const byesNeeded = nextPow2 - validPlayers.length

  const addPlayer = useCallback(() => {
    if (players.length >= KnockoutService.MAX_PLAYERS) return
    setPlayers(prev => [...prev, { name: '' }])
  }, [players.length])

  const removePlayer = useCallback((index: number) => {
    if (players.length <= 2) return
    setPlayers(prev => prev.filter((_, i) => i !== index))
  }, [players.length])

  const updatePlayer = useCallback((index: number, value: string) => {
    setPlayers(prev => prev.map((p, i) => i === index ? { name: value } : p))
  }, [])

  const canProceed = (s: number) => {
    if (s === 0) return !!formatId
    if (s === 1) return validPlayers.length >= 2 && name.trim().length > 0
    return true
  }

  const handleCreate = async () => {
    if (!user) return
    setIsCreating(true)
    try {
      const { league } = await KnockoutService.createStandalone({
        name: name.trim(),
        formatId,
        players: validPlayers,
        matchFormat,
        hostId: user.id,
      })
      notify.success('Tournament Created!', 'Bracket is ready')
      router.push(`/tournament/${league.id}`)
    } catch (err) {
      log.error('Failed to create tournament:', err)
      notify.error('Failed', err instanceof Error ? err.message : 'Could not create tournament')
    } finally {
      setIsCreating(false)
    }
  }

  if (authLoading) {
    return (
      <SidebarLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SidebarLayout>
    )
  }

  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-yellow-500" />Sign In Required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Sign in to create and manage tournaments.</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => router.push('/')} className="flex-1">Go Back</Button>
                <Button onClick={() => router.push('/auth/login')} className="flex-1">Sign In</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Create Knockout Tournament</h1>
            <p className="text-sm text-muted-foreground">Single elimination bracket — up to 32 players</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                i === step ? 'bg-primary text-primary-foreground' :
                i < step ? 'bg-green-500 text-white' :
                'bg-muted text-muted-foreground'
              }`}>{i + 1}</div>
              <span className={`text-sm ${i === step ? 'font-medium' : 'text-muted-foreground'} hidden sm:inline`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="p-6 space-y-6">
            {/* Step 0: Format */}
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold mb-3 block">Choose a Tournament Regulation</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {VGC_FORMATS.map(fmt => (
                      <button
                        key={fmt.id}
                        onClick={() => {
                          setFormatId(fmt.id)
                          if (!name.trim()) setName(`${fmt.shortName} Tournament`)
                        }}
                        className={`p-3 border-2 rounded-lg text-left transition-colors ${
                          formatId === fmt.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{fmt.shortName}</span>
                          <Badge variant="outline" size="sm" className="text-[10px]">Gen {fmt.generation}</Badge>
                          {fmt.gameType === 'doubles' && <Badge variant="secondary" size="sm" className="text-[10px]">Doubles</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{fmt.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Players */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tournament-name">Tournament Name</Label>
                  <Input
                    id="tournament-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="My Tournament"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Players ({validPlayers.length})</Label>
                    <Button
                      variant="outline" size="sm"
                      onClick={addPlayer}
                      disabled={players.length >= KnockoutService.MAX_PLAYERS}
                    >
                      <Plus className="h-3 w-3 mr-1" />Add
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {players.map((player, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
                        <Input
                          value={player.name}
                          onChange={e => updatePlayer(i, e.target.value)}
                          placeholder={`Player ${i + 1}`}
                          className="h-9"
                        />
                        <Button
                          variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                          onClick={() => removePlayer(i)}
                          disabled={players.length <= 2}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Settings & Review */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Match Format</Label>
                  <Select value={matchFormat} onValueChange={v => setMatchFormat(v as 'best_of_1' | 'best_of_3')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="best_of_1">Best of 1</SelectItem>
                      <SelectItem value="best_of_3">Best of 3 (recommended)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Review */}
                <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    Tournament Summary
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium truncate">{name || '—'}</span>
                    <span className="text-muted-foreground">Format</span>
                    <span className="font-medium">{selectedFormat?.shortName || '—'}</span>
                    <span className="text-muted-foreground">Players</span>
                    <span className="font-medium">{validPlayers.length}</span>
                    <span className="text-muted-foreground">Rounds</span>
                    <span className="font-medium">{totalRounds}</span>
                    {byesNeeded > 0 && (
                      <>
                        <span className="text-muted-foreground">First-round Byes</span>
                        <span className="font-medium">{byesNeeded}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Match Format</span>
                    <span className="font-medium">{matchFormat === 'best_of_3' ? 'Best of 3' : 'Best of 1'}</span>
                  </div>

                  {/* Player list */}
                  <div className="pt-2 border-t">
                    <span className="text-xs font-medium text-muted-foreground mb-1.5 block">Seeding (entry order)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {validPlayers.map((p, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {i + 1}. {p.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => setStep(s => s - 1)}
                disabled={step === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed(step)}>
                  Next<ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleCreate} disabled={isCreating || !canProceed(step)}>
                  {isCreating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                  ) : (
                    <><Swords className="h-4 w-4 mr-2" />Create Tournament</>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </SidebarLayout>
  )
}
