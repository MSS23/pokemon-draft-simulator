'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Upload, AlertCircle } from 'lucide-react'
import { parsePokePaste, formatEVs, type PokemonSet } from '@/lib/pokepaste-parser'

interface PokePasteImportProps {
  onImport: (pokemon: PokemonSet[]) => void
  isOpen: boolean
  onClose: () => void
}

export function PokePasteImport({ onImport, isOpen, onClose }: PokePasteImportProps) {
  const [pasteText, setPasteText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PokemonSet[] | null>(null)

  const handleParse = useCallback(() => {
    setError(null)
    setPreview(null)
    try {
      const sets = parsePokePaste(pasteText)
      if (sets.length === 0) {
        setError('No Pokemon found in paste text. Make sure you\'re using PokePaste / Showdown format.')
        return
      }
      setPreview(sets)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse paste')
    }
  }, [pasteText])

  const handleConfirm = useCallback(() => {
    if (preview) {
      onImport(preview)
      setPasteText('')
      setPreview(null)
      setError(null)
      onClose()
    }
  }, [preview, onImport, onClose])

  const handleClose = useCallback(() => {
    setPasteText('')
    setPreview(null)
    setError(null)
    onClose()
  }, [onClose])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import from Pokemon Showdown
          </DialogTitle>
          <DialogDescription>
            Paste your Showdown team export or PokePaste text below.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <>
            <Textarea
              placeholder={`Garchomp @ Life Orb\nAbility: Rough Skin\nTera Type: Steel\nEVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature\n- Earthquake\n- Dragon Claw\n- Swords Dance\n- Protect`}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
              className="font-mono text-xs resize-none"
              aria-label="PokePaste import text"
            />

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleParse} disabled={!pasteText.trim()}>
                Parse Pokemon
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="text-sm font-medium">
              {preview.length} Pokemon found - confirm import:
            </div>

            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {preview.map((set, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-lg bg-muted/50 border text-xs"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{set.name}</span>
                    {set.nickname && (
                      <span className="text-muted-foreground">({set.nickname})</span>
                    )}
                    {set.item && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        {set.item}
                      </Badge>
                    )}
                    {set.teraType && (
                      <Badge variant="secondary" className="text-[10px] h-4">
                        Tera: {set.teraType}
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-1 space-y-0.5">
                    {set.ability && <div>Ability: {set.ability}</div>}
                    {Object.keys(set.evs).length > 0 && (
                      <div>EVs: {formatEVs(set.evs)}</div>
                    )}
                    {set.nature && <div>{set.nature} Nature</div>}
                    {set.moves.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {set.moves.map((m, j) => (
                          <Badge key={j} variant="secondary" className="text-[10px] h-4">
                            {m}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview(null)}>
                Back
              </Button>
              <Button onClick={handleConfirm}>
                Import {preview.length} Pokemon
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
