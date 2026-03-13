'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { TeamSheetService, type TeamSheet } from '@/lib/teamsheet-service'
import { notify } from '@/lib/notifications'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

const TERA_COLORS: Record<string, string> = {
  Normal: 'bg-gray-400', Fire: 'bg-red-500', Water: 'bg-blue-500', Electric: 'bg-yellow-400',
  Grass: 'bg-green-500', Ice: 'bg-cyan-400', Fighting: 'bg-orange-600', Poison: 'bg-purple-500',
  Ground: 'bg-amber-600', Flying: 'bg-indigo-400', Psychic: 'bg-pink-500', Bug: 'bg-lime-500',
  Rock: 'bg-stone-500', Ghost: 'bg-violet-600', Dragon: 'bg-indigo-600', Dark: 'bg-zinc-700',
  Steel: 'bg-slate-400', Fairy: 'bg-pink-400', Stellar: 'bg-gradient-to-r from-blue-400 to-purple-400',
}

interface TeamSheetViewProps {
  isOpen: boolean
  onClose: () => void
  playerName: string
  sheet: TeamSheet
  isOwner?: boolean
}

export function TeamSheetView({ isOpen, onClose, playerName, sheet, isOwner = false }: TeamSheetViewProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const text = TeamSheetService.toPokepaste(sheet, isOwner)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    notify.success('Copied', 'Team sheet copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{playerName}&apos;s Team</DialogTitle>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs">
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {sheet.map((mon, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-3 space-y-2">
                {/* Name + Item */}
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{mon.name}</span>
                  {mon.item && (
                    <Badge variant="outline" className="text-[10px]">{mon.item}</Badge>
                  )}
                </div>

                {/* Ability + Tera */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{mon.ability}</span>
                  </span>
                  {mon.teraType && (
                    <Badge className={`text-[10px] text-white ${TERA_COLORS[mon.teraType] || 'bg-gray-500'}`}>
                      Tera {mon.teraType}
                    </Badge>
                  )}
                </div>

                {/* EVs / Nature / IVs — owner only */}
                {isOwner && (mon.evs || mon.nature || mon.ivs) && (
                  <div className="text-[11px] text-muted-foreground space-y-0.5 border-t pt-1.5 mt-1">
                    {mon.evs && (() => {
                      const parts = Object.entries(mon.evs).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k.toUpperCase()}`)
                      return parts.length > 0 ? <p><span className="font-medium text-foreground">EVs:</span> {parts.join(' / ')}</p> : null
                    })()}
                    {mon.nature && <p><span className="font-medium text-foreground">{mon.nature}</span> Nature</p>}
                    {mon.ivs && (() => {
                      const parts = Object.entries(mon.ivs).filter(([, v]) => v !== 31).map(([k, v]) => `${v} ${k.toUpperCase()}`)
                      return parts.length > 0 ? <p><span className="font-medium text-foreground">IVs:</span> {parts.join(' / ')}</p> : null
                    })()}
                  </div>
                )}

                {/* Moves */}
                <div className="grid grid-cols-2 gap-1">
                  {mon.moves.filter(m => m.trim()).map((move, mi) => (
                    <div key={mi} className="text-xs px-2 py-1 bg-muted/50 rounded">
                      {move}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Inline sprites row showing just Pokemon names for the standings table */
export function TeamSheetSprites({ sheet, onClick }: { sheet: TeamSheet; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 hover:opacity-80 transition-opacity"
      title="View team sheet"
    >
      {sheet.slice(0, 6).map((mon, i) => (
        <span
          key={i}
          className="inline-block px-1.5 py-0.5 bg-muted/60 rounded text-[10px] font-medium truncate max-w-[70px]"
          title={mon.name}
        >
          {mon.name}
        </span>
      ))}
    </button>
  )
}
