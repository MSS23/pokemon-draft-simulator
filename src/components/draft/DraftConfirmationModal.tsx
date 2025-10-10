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
import { getPokemonAnimatedUrl, getPokemonAnimatedBackupUrl, getPokemonSpriteUrl } from '@/utils/pokemon'
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
    hasError: imageError,
    handleImageError,
    handleImageLoad
  } = usePokemonImage({
    pokemonId: pokemon?.id || '',
    pokemonName: pokemon?.name || '',
    preferOfficialArt: false // Use animated GIF
  })

  if (!pokemon) return null

  const remainingBudget = currentBudget - pokemon.cost
  const remainingSlots = maxDrafts - draftedCount - 1
  const isExpensive = pokemon.cost > 15
  const isOverBudget = remainingBudget < 0
  const wouldExhaustBudget = remainingBudget < 5 && remainingSlots > 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-0 shadow-2xl">
        {/* Modern gradient background */}
        <div className="relative bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
          {/* Header with Pokemon Image */}
          <div className="relative p-8 text-center">
            {/* Subtle background pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.1),transparent_50%)]" />

            <div className="relative z-10">
              <DialogHeader className="space-y-3 mb-6">
                <DialogTitle className="text-3xl font-bold text-slate-900 dark:text-white flex items-center justify-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  Draft Confirmation
                  <Sparkles className="h-5 w-5 text-amber-500" />
                </DialogTitle>
                <DialogDescription className="text-base text-slate-600 dark:text-slate-400">
                  Add this Pokémon to your draft team?
                </DialogDescription>
              </DialogHeader>

            {/* Pokemon Image - Animated GIF */}
            <div className="flex justify-center my-8">
              <div className="relative group">
                {/* Animated glow effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full blur-xl opacity-20 group-hover:opacity-30 transition-opacity duration-300" />

                {/* Image container */}
                <div className="relative bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-700 rounded-full p-8 border-2 border-slate-200 dark:border-slate-600 shadow-xl">
                  {!imageError ? (
                    <Image
                      src={imageUrl}
                      alt={pokemon.name}
                      width={140}
                      height={140}
                      className="relative z-10 drop-shadow-2xl pixelated"
                      unoptimized
                      onError={handleImageError}
                      onLoad={handleImageLoad}
                    />
                  ) : (
                    <div className="w-[140px] h-[140px] flex items-center justify-center">
                      <span className="text-6xl">✨</span>
                    </div>
                  )}

                  {/* Loading spinner */}
                  {imageLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-800/50 rounded-full">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pokemon Info */}
            <div className="space-y-5">
              <div>
                <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-3 capitalize">
                  {pokemon.name}
                </h3>
                <div className="flex justify-center gap-2">
                  {pokemon.types.map((type) => (
                    <Badge
                      key={type.name}
                      className="text-white font-bold px-4 py-1.5 text-sm uppercase tracking-wide shadow-lg hover:scale-105 transition-transform"
                      style={{
                        backgroundColor: type.color,
                        boxShadow: `0 4px 12px ${type.color}50`
                      }}
                    >
                      {type.name}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Cost Analysis */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-5 space-y-3 shadow-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Draft Cost:</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        "font-bold px-4 py-1.5 text-sm shadow-md",
                        pokemon.cost >= 25 ? "bg-gradient-to-r from-red-500 to-orange-500 text-white" :
                        pokemon.cost >= 20 ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white" :
                        pokemon.cost >= 15 ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white" :
                        pokemon.cost >= 10 ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white" :
                        "bg-gradient-to-r from-slate-500 to-slate-600 text-white"
                      )}
                    >
                      {pokemon.cost} pts
                    </Badge>
                    {isExpensive && <Crown className="h-5 w-5 text-amber-500" />}
                  </div>
                </div>

                <div className="h-px bg-slate-200 dark:bg-slate-700" />

                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Remaining Budget:</span>
                  <span className={cn(
                    "font-bold text-lg",
                    isOverBudget ? "text-red-600 dark:text-red-400" :
                    wouldExhaustBudget ? "text-orange-600 dark:text-orange-400" :
                    "text-green-600 dark:text-green-400"
                  )}>
                    {remainingBudget} pts
                  </span>
                </div>

                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Team Slots:</span>
                  <span className="font-bold text-lg text-slate-900 dark:text-white">
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
              <div className="bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-5 border border-slate-200 dark:border-slate-600 shadow-md">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center justify-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  Key Stats
                </h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="space-y-1">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">{pokemon.stats.hp}</div>
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">HP</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{pokemon.stats.attack}</div>
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">ATK</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{pokemon.stats.total}</div>
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">TOTAL</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 p-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 h-12 font-semibold border-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(pokemon)}
            disabled={isOverBudget}
            className={cn(
              "flex-1 h-12 font-bold shadow-lg transition-all duration-200",
              isOverBudget
                ? "bg-slate-400 hover:bg-slate-400 cursor-not-allowed opacity-60"
                : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white hover:shadow-xl hover:scale-[1.02]"
            )}
          >
            <Crown className="h-5 w-5 mr-2" />
            {isOverBudget ? "Over Budget" : `Draft ${pokemon.name}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}