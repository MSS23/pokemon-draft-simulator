'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  X,
  Loader2,
  Zap,
  Trash2,
  Upload,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { POKEMON_FORMATS } from '@/lib/formats'
import { notify } from '@/lib/notifications'

interface PoolEntry {
  id: number
  name: string // lowercase hyphenated (PokeAPI format)
  displayName: string
  types: string[]
  bst: number
  cost: number
}

interface PokemonPoolBuilderProps {
  onChange: (pool: Record<string, number>) => void
  initialFormatId?: string
  className?: string
}

const TYPE_COLORS: Record<string, string> = {
  fire: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  water: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  grass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  electric: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  psychic: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  ice: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  dragon: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  dark: 'bg-gray-700 text-gray-100 dark:bg-gray-800 dark:text-gray-200',
  fairy: 'bg-pink-200 text-pink-900 dark:bg-pink-900/30 dark:text-pink-300',
  normal: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  fighting: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  poison: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  ground: 'bg-yellow-200 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-300',
  flying: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  bug: 'bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300',
  rock: 'bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-300',
  ghost: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  steel: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

function calcCostFromBST(bst: number): number {
  if (bst >= 600) return 30
  if (bst >= 550) return 25
  if (bst >= 500) return 20
  if (bst >= 450) return 15
  if (bst >= 400) return 10
  if (bst >= 350) return 8
  if (bst >= 300) return 5
  return 3
}

function toDisplayName(name: string): string {
  return name
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('-')
}

function toApiName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

export default function PokemonPoolBuilder({
  onChange,
  initialFormatId = 'vgc-reg-h',
  className,
}: PokemonPoolBuilderProps) {
  const [pool, setPool] = useState<PoolEntry[]>([])
  const [allNames, setAllNames] = useState<{ name: string; id: number }[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ name: string; id: number }[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState(initialFormatId)
  const [isLoadingNames, setIsLoadingNames] = useState(true)
  const [isLoadingFormat, setIsLoadingFormat] = useState(false)
  const [loadingPokemon, setLoadingPokemon] = useState<string | null>(null)
  const [showBSTTool, setShowBSTTool] = useState(false)
  const [bstTiers, setBstTiers] = useState({
    600: 30, 550: 25, 500: 20, 450: 15, 400: 10, 350: 8, 300: 5, 0: 3,
  })
  const searchDropdownRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load all Pokémon names once (single lightweight request)
  useEffect(() => {
    fetch('https://pokeapi.co/api/v2/pokemon?limit=1302&offset=0')
      .then((r) => r.json())
      .then((data) => {
        const names = (data.results as { name: string; url: string }[])
          .map((p) => {
            const parts = p.url.split('/')
            const id = parseInt(parts[parts.length - 2])
            return { name: p.name, id }
          })
          .filter((p) => !isNaN(p.id) && p.id <= 1025)
        setAllNames(names)
      })
      .catch(() => {})
      .finally(() => setIsLoadingNames(false))
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        setShowSearch(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Filter search results
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([])
      setShowSearch(false)
      return
    }
    const q = searchQuery.toLowerCase()
    const inPool = new Set(pool.map((p) => p.id))
    const results = allNames
      .filter((p) => !inPool.has(p.id) && (p.name.includes(q) || p.id.toString() === q))
      .slice(0, 8)
    setSearchResults(results)
    setShowSearch(results.length > 0)
  }, [searchQuery, allNames, pool])

  // Notify parent whenever pool changes
  useEffect(() => {
    const out: Record<string, number> = {}
    pool.forEach((p) => { out[p.name] = p.cost })
    onChange(out)
  }, [pool, onChange])

  const loadFromFormat = useCallback(async () => {
    if (!selectedFormat) return
    setIsLoadingFormat(true)
    try {
      const { fetchPokemonForFormat } = await import('@/lib/pokemon-api')
      const pokemonList = await fetchPokemonForFormat(selectedFormat, 1000)
      const entries: PoolEntry[] = pokemonList.map((p) => {
        const bst =
          p.stats.hp +
          p.stats.attack +
          p.stats.defense +
          p.stats.specialAttack +
          p.stats.specialDefense +
          p.stats.speed
        const apiName = p.name.toLowerCase().replace(/\s+/g, '-')
        return {
          id: parseInt(p.id),
          name: apiName,
          displayName: p.name,
          types: p.types.map((t) => (typeof t === 'string' ? t : t.name)),
          bst,
          cost: p.cost ?? calcCostFromBST(bst),
        }
      })
      setPool(entries.sort((a, b) => a.id - b.id))
      notify.success('Format loaded', `${entries.length} Pokémon added to pool`)
    } catch (err) {
      notify.error('Load failed', err instanceof Error ? err.message : 'Failed to load format')
    } finally {
      setIsLoadingFormat(false)
    }
  }, [selectedFormat])

  const addFromSearch = useCallback(
    async (name: string, id: number) => {
      setShowSearch(false)
      setSearchQuery('')
      if (pool.some((p) => p.id === id)) return
      setLoadingPokemon(name)
      try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`)
        const data = await res.json()
        const bst = (data.stats as { base_stat: number }[]).reduce(
          (sum, s) => sum + s.base_stat,
          0,
        )
        const types = (data.types as { type: { name: string } }[]).map((t) => t.type.name)
        const entry: PoolEntry = {
          id,
          name,
          displayName: toDisplayName(name),
          types,
          bst,
          cost: calcCostFromBST(bst),
        }
        setPool((prev) => [...prev, entry].sort((a, b) => a.id - b.id))
      } catch {
        notify.error('Error', `Failed to load data for ${name}`)
      } finally {
        setLoadingPokemon(null)
      }
    },
    [pool],
  )

  const updateCost = useCallback((id: number, cost: number) => {
    setPool((prev) => prev.map((p) => (p.id === id ? { ...p, cost: Math.max(1, cost) } : p)))
  }, [])

  const remove = useCallback((id: number) => {
    setPool((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const applyBSTCosts = useCallback(() => {
    setPool((prev) =>
      prev.map((p) => {
        const thresholds = Object.entries(bstTiers)
          .map(([k, v]) => ({ bst: parseInt(k), cost: v }))
          .sort((a, b) => b.bst - a.bst)
        const tier = thresholds.find((t) => p.bst >= t.bst) ?? thresholds[thresholds.length - 1]
        return { ...p, cost: tier?.cost ?? 5 }
      }),
    )
    setShowBSTTool(false)
    notify.success('Costs updated', 'Applied BST-based point values to all Pokémon')
  }, [bstTiers])

  const handleCSVImport = useCallback(
    async (file: File) => {
      try {
        const { processCustomPricingFile } = await import('@/lib/csv-parser')
        const result = await processCustomPricingFile(file)
        if (!result.success || !result.data) {
          notify.error('CSV error', result.error ?? 'Invalid file')
          return
        }
        // Try to enrich with API data for any unknown Pokémon
        const entries: PoolEntry[] = Object.entries(result.data).map(([name, cost]) => ({
          id: 0, // will be resolved below
          name: toApiName(name),
          displayName: toDisplayName(name),
          types: [],
          bst: 0,
          cost,
        }))
        setPool(entries)
        notify.success('CSV imported', `${entries.length} Pokémon loaded. Sprites will load on hover.`)
      } catch (err) {
        notify.error('Import failed', err instanceof Error ? err.message : 'Unknown error')
      }
    },
    [],
  )

  const exportCSV = useCallback(() => {
    const rows = ['pokemon,cost', ...pool.map((p) => `${p.name},${p.cost}`)]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `custom-pool-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [pool])

  const stats = useMemo(() => {
    if (!pool.length) return null
    const costs = pool.map((p) => p.cost)
    return {
      count: pool.length,
      min: Math.min(...costs),
      max: Math.max(...costs),
      avg: Math.round(costs.reduce((a, b) => a + b, 0) / costs.length),
    }
  }, [pool])

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      {/* Load from preset */}
      <div className="flex gap-2">
        <Select value={selectedFormat} onValueChange={setSelectedFormat}>
          <SelectTrigger className="flex-1 text-sm">
            <SelectValue placeholder="Select a format to start from..." />
          </SelectTrigger>
          <SelectContent>
            {POKEMON_FORMATS.map((f) => (
              <SelectItem key={f.id} value={f.id} className="text-sm">
                {f.shortName}
                {f.meta.isOfficial ? ' ⭐' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={loadFromFormat}
          disabled={isLoadingFormat}
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          {isLoadingFormat ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          <span className="ml-1">{isLoadingFormat ? 'Loading...' : 'Load'}</span>
        </Button>
      </div>

      {/* Search */}
      <div className="relative" ref={searchDropdownRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={isLoadingNames ? 'Loading Pokémon names...' : 'Search to add a Pokémon...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isLoadingNames}
            className="pl-9 pr-9 text-sm"
          />
          {loadingPokemon && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {showSearch && (
          <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg overflow-hidden">
            {searchResults.map((p) => (
              <button
                key={p.id}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left transition-colors"
                onClick={() => addFromSearch(p.name, p.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png`}
                  alt=""
                  className="h-8 w-8 object-contain"
                />
                <span className="text-muted-foreground text-xs w-10">#{p.id}</span>
                <span>{toDisplayName(p.name)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pool */}
      {pool.length > 0 ? (
        <div className="space-y-2">
          {/* Stats + actions bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">
              {stats &&
                `${stats.count} Pokémon · ${stats.min}–${stats.max} pts (avg ${stats.avg})`}
            </span>
            <div className="flex gap-1 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBSTTool((v) => !v)}
                className="text-xs h-7"
              >
                <Zap className="h-3 w-3 mr-1" />
                BST pricing
                {showBSTTool ? (
                  <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={exportCSV}
                className="text-xs h-7"
              >
                <Download className="h-3 w-3 mr-1" />
                Export
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPool([])}
                className="text-xs h-7 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
          </div>

          {/* BST tier editor */}
          {showBSTTool && (
            <div className="p-3 bg-muted/50 rounded-md border border-border space-y-2">
              <p className="text-xs font-medium text-foreground">
                Auto-assign points by BST (Base Stat Total)
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {Object.entries(bstTiers)
                  .sort(([a], [b]) => parseInt(b) - parseInt(a))
                  .map(([threshold, cost]) => (
                    <div key={threshold} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-16 shrink-0">
                        {parseInt(threshold) === 0 ? 'Below 300' : `${threshold}+ BST`}
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={999}
                        value={cost}
                        onChange={(e) =>
                          setBstTiers((prev) => ({
                            ...prev,
                            [threshold]: parseInt(e.target.value) || 1,
                          }))
                        }
                        className="h-6 w-16 text-xs text-center"
                      />
                      <span className="text-muted-foreground">pts</span>
                    </div>
                  ))}
              </div>
              <Button size="sm" onClick={applyBSTCosts} className="w-full h-7 text-xs">
                Apply to all {pool.length} Pokémon
              </Button>
            </div>
          )}

          {/* Pool list */}
          <ScrollArea className="h-72 border border-border rounded-md bg-card">
            <div className="p-1.5 space-y-0.5">
              {pool.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted group transition-colors"
                >
                  {entry.id > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${entry.id}.png`}
                      alt=""
                      className="h-8 w-8 object-contain shrink-0"
                    />
                  ) : (
                    <div className="h-8 w-8 shrink-0 rounded bg-muted" />
                  )}
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">
                    {entry.displayName}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    {entry.types.map((t) => (
                      <span
                        key={t}
                        className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                          TYPE_COLORS[t] ?? 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  {entry.bst > 0 && (
                    <span className="text-xs text-muted-foreground shrink-0 w-14 text-right">
                      BST {entry.bst}
                    </span>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="number"
                      min={1}
                      max={999}
                      value={entry.cost}
                      onChange={(e) => updateCost(entry.id, parseInt(e.target.value) || 1)}
                      className="h-7 w-14 text-sm text-center"
                    />
                    <span className="text-xs text-muted-foreground">pts</span>
                  </div>
                  <button
                    onClick={() => remove(entry.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 p-0.5"
                    aria-label={`Remove ${entry.displayName}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="text-center py-8 border border-dashed border-border rounded-md space-y-2">
          <p className="text-sm text-muted-foreground">
            Load a preset format above, or search to add Pokémon individually
          </p>
          <p className="text-xs text-muted-foreground">Or import from CSV:</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs"
          >
            <Upload className="h-3 w-3 mr-1" />
            Import CSV
          </Button>
        </div>
      )}

      {/* CSV import (always available when pool has items too) */}
      {pool.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-muted-foreground"
          >
            <Upload className="h-3 w-3 mr-1" />
            Replace with CSV
          </Button>
          <span className="text-xs text-muted-foreground">
            CSV format: <code className="text-xs">pokemon,cost</code>
          </span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleCSVImport(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
