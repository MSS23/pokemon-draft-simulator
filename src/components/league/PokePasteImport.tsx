'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Link2, Upload, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react'
import { parsePokePaste, fetchPokePaste, formatEVs, type PokemonSet } from '@/lib/pokepaste-parser'
import { Textarea } from '@/components/ui/textarea'

interface PokePasteImportProps {
  onImport: (sets: PokemonSet[]) => void
  existingPokemonNames?: string[]
}

export function PokePasteImport({ onImport, existingPokemonNames = [] }: PokePasteImportProps) {
  const [url, setUrl] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PokemonSet[] | null>(null)
  const [mode, setMode] = useState<'url' | 'paste'>('url')
  const [expanded, setExpanded] = useState(false)

  const handleFetch = useCallback(async () => {
    setError(null)
    setPreview(null)
    setIsLoading(true)
    try {
      const sets = await fetchPokePaste(url)
      if (sets.length === 0) throw new Error('No Pokemon found in paste')
      setPreview(sets)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch PokePaste')
    } finally {
      setIsLoading(false)
    }
  }, [url])

  const handleParse = useCallback(() => {
    setError(null)
    setPreview(null)
    try {
      const sets = parsePokePaste(pasteText)
      if (sets.length === 0) throw new Error('No Pokemon found in paste text')
      setPreview(sets)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse paste')
    }
  }, [pasteText])

  const handleConfirm = useCallback(() => {
    if (preview) {
      onImport(preview)
      setPreview(null)
      setUrl('')
      setPasteText('')
      setExpanded(false)
    }
  }, [preview, onImport])

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={expanded}
        aria-controls="pokepaste-import-panel"
      >
        <Upload className="h-4 w-4" />
        Import sets from PokePaste / Showdown
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <Card id="pokepaste-import-panel">
          <CardContent className="pt-4 space-y-3">
            {/* Mode toggle */}
            <div className="flex gap-1" role="group" aria-label="Import mode">
              <Button
                size="sm"
                variant={mode === 'url' ? 'default' : 'outline'}
                onClick={() => setMode('url')}
              >
                <Link2 className="h-3 w-3 mr-1" />
                PokePaste URL
              </Button>
              <Button
                size="sm"
                variant={mode === 'paste' ? 'default' : 'outline'}
                onClick={() => setMode('paste')}
              >
                <Upload className="h-3 w-3 mr-1" />
                Paste Text
              </Button>
            </div>

            {mode === 'url' ? (
              <div className="flex gap-2">
                <Input
                  placeholder="https://pokepast.es/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1"
                  aria-label="PokePaste URL"
                />
                <Button onClick={handleFetch} disabled={!url || isLoading} size="sm">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Fetch'}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Textarea
                  placeholder="Paste your Showdown team export here..."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                  aria-label="Showdown team export text"
                />
                <Button onClick={handleParse} disabled={!pasteText} size="sm">
                  Parse
                </Button>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Preview */}
            {preview && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{preview.length} Pokemon found</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleConfirm}>
                      Import {preview.length} Sets
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2">
                  {preview.map((set, i) => {
                    const isOnTeam = existingPokemonNames.some(
                      n => n.toLowerCase() === set.name.toLowerCase()
                    )
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50 border text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{set.name}</span>
                            {set.item && (
                              <Badge variant="outline" className="text-[10px] h-4">
                                {set.item}
                              </Badge>
                            )}
                            {isOnTeam && (
                              <Badge variant="secondary" className="text-[10px] h-4 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                On team
                              </Badge>
                            )}
                          </div>
                          <div className="text-muted-foreground mt-1 space-y-0.5">
                            {set.ability && <div>Ability: {set.ability}</div>}
                            {set.teraType && <div>Tera: {set.teraType}</div>}
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
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
