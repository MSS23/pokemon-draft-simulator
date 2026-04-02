'use client'

import { useState, useCallback, useMemo } from 'react'
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
import { Download, Copy, Check, FileText } from 'lucide-react'
import { teamToPokePaste, toBasicPokePasteTemplate, type PokemonSet } from '@/lib/pokepaste-parser'
import { formatPokemonName } from '@/utils/pokemon'

interface PokePasteExportProps {
  teamName: string
  pokemon: Array<{ name: string; pokemonId?: string }>
  /** Optional full PokemonSet data if available (e.g. from imported sets) */
  sets?: PokemonSet[]
}

export function PokePasteExport({ teamName, pokemon, sets }: PokePasteExportProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const pokePasteText = useMemo(() => {
    if (sets && sets.length > 0) {
      return teamToPokePaste(sets)
    }
    // Generate basic templates for Pokemon that only have names
    return pokemon
      .map(p => toBasicPokePasteTemplate(formatPokemonName(p.name)))
      .join('\n\n')
  }, [pokemon, sets])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(pokePasteText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = pokePasteText
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [pokePasteText])

  const handleDownload = useCallback(() => {
    const blob = new Blob([pokePasteText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${teamName.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [pokePasteText, teamName])

  const hasFullSets = sets && sets.length > 0

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-1.5"
      >
        <FileText className="h-3.5 w-3.5" />
        Export to Showdown
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Export to Pokemon Showdown</DialogTitle>
            <DialogDescription>
              {teamName} - {pokemon.length} Pokemon
            </DialogDescription>
          </DialogHeader>

          {!hasFullSets && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                Basic Template
              </Badge>
              <span className="text-xs text-muted-foreground">
                Paste into Showdown and fill in moves, abilities, and EVs.
              </span>
            </div>
          )}

          <Textarea
            value={pokePasteText}
            readOnly
            rows={Math.min(20, pokePasteText.split('\n').length + 1)}
            className="font-mono text-xs resize-none"
            aria-label="PokePaste export text"
          />

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCopy} className="gap-1.5">
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy to Clipboard
                </>
              )}
            </Button>
            <Button onClick={handleDownload} className="gap-1.5">
              <Download className="h-4 w-4" />
              Download .txt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
