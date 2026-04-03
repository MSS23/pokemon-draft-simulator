'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { ClipboardCopy, Download, ChevronDown } from 'lucide-react'
import {
  toBasicPokePasteTemplate,
  parsePokePaste,
  type PokemonSet,
} from '@/lib/pokepaste-parser'
import { notify } from '@/lib/notifications'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// PokePasteExportButton
// ---------------------------------------------------------------------------

interface PokePasteExportButtonProps {
  pokemonNames: string[]
  teamName: string
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'icon'
}

export function PokePasteExportButton({
  pokemonNames,
  teamName,
  variant = 'outline',
  size = 'sm',
}: PokePasteExportButtonProps) {
  const generatePaste = (): string => {
    const header = `=== ${teamName} ===\n\n`
    const sets = pokemonNames
      .map((name) => toBasicPokePasteTemplate(name))
      .join('\n\n')
    return header + sets
  }

  const handleCopyToClipboard = async () => {
    const paste = generatePaste()
    await navigator.clipboard.writeText(paste)
    notify.success(
      'Copied!',
      'PokePaste copied to clipboard — paste into Showdown teambuilder',
    )
  }

  const handleDownloadTxt = () => {
    const paste = generatePaste()
    const blob = new Blob([paste], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${teamName.replace(/\s+/g, '-').toLowerCase()}-pokepaste.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    notify.success('Downloaded!', `${teamName} PokePaste saved as .txt`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className="gap-1.5">
          <ClipboardCopy className="h-3.5 w-3.5" />
          Export PokePaste
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleCopyToClipboard}>
          <ClipboardCopy className="h-4 w-4 mr-2" />
          Copy to Clipboard
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownloadTxt}>
          <Download className="h-4 w-4 mr-2" />
          Download .txt
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// PokePasteImportArea
// ---------------------------------------------------------------------------

interface PokePasteImportAreaProps {
  onImport: (sets: PokemonSet[]) => void
  className?: string
}

export function PokePasteImportArea({
  onImport,
  className,
}: PokePasteImportAreaProps) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<PokemonSet[]>([])

  const handleParse = () => {
    const sets = parsePokePaste(text)
    setPreview(sets)
    if (sets.length > 0) {
      onImport(sets)
      notify.success(
        'Imported!',
        `Parsed ${sets.length} Pokemon from PokePaste`,
      )
    } else {
      notify.error('No Pokemon found', 'Check the paste format and try again')
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      <Textarea
        placeholder="Paste your PokePaste / Showdown team here..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="font-mono text-sm"
      />
      <div className="flex items-center gap-2">
        <Button onClick={handleParse} size="sm" disabled={!text.trim()}>
          Parse Team
        </Button>
        {preview.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {preview.length} Pokemon parsed
          </span>
        )}
      </div>
      {preview.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {preview.map((set, i) => (
            <div
              key={i}
              className="p-2 rounded-lg border bg-muted/30 text-sm"
            >
              <div className="font-semibold">{set.name}</div>
              {set.item && (
                <div className="text-xs text-muted-foreground">
                  @ {set.item}
                </div>
              )}
              {set.ability && (
                <div className="text-xs text-muted-foreground">
                  {set.ability}
                </div>
              )}
              {set.moves.length > 0 && (
                <div className="text-xs mt-1">{set.moves.join(', ')}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
