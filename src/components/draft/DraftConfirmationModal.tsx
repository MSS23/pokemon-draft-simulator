'use client'

import React from 'react'
import Image from 'next/image'
import { Pokemon } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getBestPokemonImageUrl, getTypeColor } from '@/utils/pokemon'
import { cn } from '@/lib/utils'
import { Sparkles, Zap, Shield, Crown, AlertTriangle } from 'lucide-react'
import { usePokemonImage } from '@/hooks/usePokemonImage'

interface DraftConfirmationModalProps {
  pokemon: Pokemon | null
  isOpen: boolean
  onClose: () => void
  onConfirm: (pokemon: Pokemon) => void
  currentBudget?: number
  draftedCount?: number
  maxDrafts?: number
}

export default function DraftConfirmationModal({
  pokemon,
  isOpen,
  onClose,
  onConfirm,
  currentBudget = 100,
  draftedCount = 0,
  maxDrafts = 6,
}: DraftConfirmationModalProps) {
  const {
    imageUrl,
    isLoading: imageLoading,
    hasError: imageError
  } = usePokemonImage({
    pokemonId: pokemon?.id || '',
    pokemonName: pokemon?.name || '',
    preferOfficialArt: true
  })

  if (!pokemon) return null

  const remainingBudget = currentBudget - pokemon.cost
  const remainingSlots = maxDrafts - draftedCount - 1
  const isExpensive = pokemon.cost > 15
  const isOverBudget = remainingBudget < 0
  const wouldExhaustBudget = remainingBudget < 5 && remainingSlots > 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        {/* Header with Pokemon Image */}
        <div className="relative p-6 pb-4 text-center">
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),transparent)]" />

          <div className="relative z-10">
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent flex items-center justify-center gap-2">
                <Sparkles className="h-6 w-6 text-yellow-500 animate-pulse" />
                Draft Confirmation
                <Sparkles className="h-6 w-6 text-yellow-500 animate-pulse" />
              </DialogTitle>
              <DialogDescription className="text-slate-600 dark:text-slate-400">
                Add this Pokémon to your draft team?
              </DialogDescription>
            </DialogHeader>

            {/* Pokemon Image */}
            <div className="flex justify-center my-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-purple-500 to-cyan-400 rounded-full blur-2xl opacity-30 animate-pulse" />
                <div className="relative bg-white/90 dark:bg-slate-800/90 rounded-full p-4 border-4 border-white/50 shadow-2xl">
                  {!imageError && !imageLoading ? (
                    <Image
                      src={imageUrl}
                      alt={pokemon.name}
                      width={120}
                      height={120}
                      className="relative z-10 drop-shadow-lg"
                      unoptimized
                    />
                  ) : (
                    <div className="w-32 h-32 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-slate-600 dark:to-slate-700 rounded-full flex items-center justify-center">
                      <span className="text-2xl">🔮</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pokemon Info */}
            <div className="space-y-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">
                  {pokemon.name}
                </h3>
                <div className="flex justify-center gap-2 mb-3">
                  {pokemon.types.map((type) => (
                    <Badge
                      key={type.name}
                      className="text-white font-semibold px-3 py-1 shadow-lg"
                      style={{
                        backgroundColor: type.color,
                        boxShadow: `0 4px 8px ${type.color}40`
                      }}
                    >
                      {type.name.toUpperCase()}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Cost Analysis */}
              <div className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-4 space-y-3 backdrop-blur-sm border border-white/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Draft Cost:</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        "font-bold px-3 py-1",
                        pokemon.cost >= 25 ? "bg-gradient-to-r from-red-500 to-orange-600 text-white" :
                        pokemon.cost >= 20 ? "bg-gradient-to-r from-purple-500 to-pink-600 text-white" :
                        pokemon.cost >= 15 ? "bg-gradient-to-r from-blue-500 to-cyan-600 text-white" :
                        pokemon.cost >= 10 ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white" :
                        "bg-gradient-to-r from-gray-500 to-slate-600 text-white"
                      )}
                    >
                      {pokemon.cost} pts
                    </Badge>
                    {isExpensive && <Crown className="h-4 w-4 text-yellow-500" />}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Remaining Budget:</span>
                  <span className={cn(
                    "font-bold",
                    isOverBudget ? "text-red-600 dark:text-red-400" :
                    wouldExhaustBudget ? "text-orange-600 dark:text-orange-400" :
                    "text-green-600 dark:text-green-400"
                  )}>
                    {remainingBudget} pts
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Team Slots:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {draftedCount + 1}/{maxDrafts}
                  </span>
                </div>

                {/* Warnings */}
                {(isOverBudget || wouldExhaustBudget) && (
                  <div className={cn(
                    "flex items-start gap-2 p-3 rounded-lg border",
                    isOverBudget
                      ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
                      : "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800"
                  )}>
                    <AlertTriangle className={cn(
                      "h-4 w-4 mt-0.5",
                      isOverBudget ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"
                    )} />
                    <div className="text-sm">
                      {isOverBudget ? (
                        <p className="text-red-700 dark:text-red-300 font-medium">
                          This would exceed your budget by {Math.abs(remainingBudget)} points!
                        </p>
                      ) : (
                        <p className="text-orange-700 dark:text-orange-300 font-medium">
                          This will use most of your budget with {remainingSlots} slots remaining.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Key Stats Preview */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-slate-800 dark:to-slate-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Key Stats
                </h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-lg font-bold text-red-600 dark:text-red-400">{pokemon.stats.hp}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">HP</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-orange-600 dark:text-orange-400">{pokemon.stats.attack}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">ATK</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{pokemon.stats.total}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">TOTAL</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 p-6 pt-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-slate-300 dark:border-slate-600"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(pokemon)}
            disabled={isOverBudget}
            className={cn(
              "flex-1 font-semibold shadow-lg transition-all",
              isOverBudget
                ? "bg-gray-400 hover:bg-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 hover:from-blue-700 hover:via-purple-700 hover:to-cyan-700 text-white transform hover:scale-105"
            )}
          >
            <Crown className="h-4 w-4 mr-2" />
            {isOverBudget ? "Over Budget" : `Draft ${pokemon.name}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}