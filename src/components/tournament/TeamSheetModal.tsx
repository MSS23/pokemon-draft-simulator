'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { TeamSheetService, type TeamSheetPokemon, type TeamSheet } from '@/lib/teamsheet-service'
import { notify } from '@/lib/notifications'
import { Loader2, Plus, Trash2, ClipboardPaste } from 'lucide-react'

const EMPTY_MON: TeamSheetPokemon = { name: '', item: '', ability: '', teraType: '', moves: ['', '', '', ''] }

const TERA_TYPES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
  'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy', 'Stellar',
]

interface Props {
  isOpen: boolean
  onClose: () => void
  draftId: string
  teamId: string
  existingSheet?: TeamSheet | null
  onSubmitted: () => void
}

export function TeamSheetModal({ isOpen, onClose, draftId, teamId, existingSheet, onSubmitted }: Props) {
  const [team, setTeam] = useState<TeamSheetPokemon[]>(
    existingSheet && existingSheet.length > 0
      ? existingSheet.map(m => ({ ...m, moves: [...m.moves] as [string, string, string, string] }))
      : [{ ...EMPTY_MON, moves: ['', '', '', ''] }]
  )
  const [isSaving, setIsSaving] = useState(false)
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)

  const updateMon = useCallback((idx: number, field: keyof TeamSheetPokemon, value: string) => {
    setTeam(prev => prev.map((mon, i) => {
      if (i !== idx) return mon
      return { ...mon, [field]: value }
    }))
  }, [])

  const updateMove = useCallback((monIdx: number, moveIdx: number, value: string) => {
    setTeam(prev => prev.map((mon, i) => {
      if (i !== monIdx) return mon
      const moves = [...mon.moves] as [string, string, string, string]
      moves[moveIdx] = value
      return { ...mon, moves }
    }))
  }, [])

  const addMon = useCallback(() => {
    if (team.length >= 6) return
    setTeam(prev => [...prev, { ...EMPTY_MON, moves: ['', '', '', ''] }])
  }, [team.length])

  const removeMon = useCallback((idx: number) => {
    if (team.length <= 1) return
    setTeam(prev => prev.filter((_, i) => i !== idx))
  }, [team.length])

  const handleImportPaste = useCallback(() => {
    if (!importText.trim()) return
    const parsed = parsePokepaste(importText)
    if (parsed.length > 0) {
      setTeam(parsed.slice(0, 6))
      setShowImport(false)
      setImportText('')
      notify.success('Imported', `${parsed.length} Pokemon loaded`)
    } else {
      notify.error('Parse Error', 'Could not parse the paste. Check the format.')
    }
  }, [importText])

  const handleSubmit = useCallback(async () => {
    const filledTeam = team.filter(m => m.name.trim())
    if (filledTeam.length === 0) {
      notify.error('Empty Team', 'Add at least 1 Pokemon')
      return
    }
    setIsSaving(true)
    try {
      await TeamSheetService.submitTeamSheet(draftId, teamId, filledTeam)
      notify.success('Team Sheet Submitted!', `${filledTeam.length} Pokemon registered`)
      onSubmitted()
      onClose()
    } catch (err) {
      notify.error('Failed', err instanceof Error ? err.message : 'Could not save team sheet')
    } finally {
      setIsSaving(false)
    }
  }, [team, draftId, teamId, onSubmitted, onClose])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Team Sheet</DialogTitle>
        </DialogHeader>

        {/* Import from Pokepaste */}
        {showImport ? (
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            <Label className="text-xs">Paste a Pokepaste / Showdown export</Label>
            <textarea
              className="w-full h-32 text-xs font-mono p-2 border rounded bg-background resize-none"
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={`Incineroar @ Assault Vest\nAbility: Intimidate\nTera Type: Ghost\n- Fake Out\n- Flare Blitz\n- Knock Off\n- U-turn`}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
              <Button size="sm" onClick={handleImportPaste}>Import</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="w-fit" onClick={() => setShowImport(true)}>
            <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" />Import from Pokepaste
          </Button>
        )}

        {/* Pokemon list */}
        <div className="space-y-4">
          {team.map((mon, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-3 relative">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">{idx + 1}/6</Badge>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeMon(idx)} disabled={team.length <= 1}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* Row 1: Name + Item */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Pokemon</Label>
                  <Input value={mon.name} onChange={e => updateMon(idx, 'name', e.target.value)} placeholder="Incineroar" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Item</Label>
                  <Input value={mon.item} onChange={e => updateMon(idx, 'item', e.target.value)} placeholder="Assault Vest" className="h-8 text-sm" />
                </div>
              </div>

              {/* Row 2: Ability + Tera */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Ability</Label>
                  <Input value={mon.ability} onChange={e => updateMon(idx, 'ability', e.target.value)} placeholder="Intimidate" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Tera Type</Label>
                  <select
                    value={mon.teraType}
                    onChange={e => updateMon(idx, 'teraType', e.target.value)}
                    className="w-full h-8 text-sm border rounded-md px-2 bg-background"
                  >
                    <option value="">Select...</option>
                    {TERA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Moves */}
              <div>
                <Label className="text-[10px] text-muted-foreground">Moves</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {mon.moves.map((move, mi) => (
                    <Input key={mi} value={move} onChange={e => updateMove(idx, mi, e.target.value)} placeholder={`Move ${mi + 1}`} className="h-7 text-xs" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {team.length < 6 && (
          <Button variant="outline" size="sm" onClick={addMon} className="w-full">
            <Plus className="h-3.5 w-3.5 mr-1" />Add Pokemon ({team.length}/6)
          </Button>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSaving || team.every(m => !m.name.trim())}>
            {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Submit Team Sheet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Parse a Pokepaste/Showdown export into TeamSheetPokemon[] */
function parsePokepaste(text: string): TeamSheetPokemon[] {
  const pokemon: TeamSheetPokemon[] = []
  const blocks = text.trim().split(/\n\s*\n/)

  for (const block of blocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const mon: TeamSheetPokemon = { name: '', item: '', ability: '', teraType: '', moves: ['', '', '', ''] }
    let moveIdx = 0

    // First line: "Pokemon @ Item" or "Nickname (Pokemon) @ Item"
    const firstLine = lines[0]
    const atMatch = firstLine.match(/^(.+?)\s*@\s*(.+)$/)
    if (atMatch) {
      mon.name = cleanPokemonName(atMatch[1])
      mon.item = atMatch[2].trim()
    } else {
      mon.name = cleanPokemonName(firstLine)
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('Ability:')) {
        mon.ability = line.replace('Ability:', '').trim()
      } else if (line.startsWith('Tera Type:')) {
        mon.teraType = line.replace('Tera Type:', '').trim()
      } else if (line.startsWith('-') && moveIdx < 4) {
        mon.moves[moveIdx++] = line.replace(/^-\s*/, '').trim()
      }
      // Skip EVs, IVs, Nature, Level lines
    }

    if (mon.name) pokemon.push(mon)
  }

  return pokemon
}

function cleanPokemonName(raw: string): string {
  // Handle "Nickname (Pokemon)" format
  const parenMatch = raw.match(/\(([^)]+)\)\s*$/)
  if (parenMatch) return parenMatch[1].trim()
  // Handle gender suffix
  return raw.replace(/\s*\(M\)\s*$/, '').replace(/\s*\(F\)\s*$/, '').trim()
}
