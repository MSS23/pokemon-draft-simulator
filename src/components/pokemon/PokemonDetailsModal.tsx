'use client'

import React, { useState } from 'react'
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
import { Progress } from '@/components/ui/progress'
import { getStatColor, getBestPokemonImageUrl, getPokemonAnimatedBackupUrl, getPokemonSpriteUrl, getOfficialArtworkUrl } from '@/utils/pokemon'
import { cn } from '@/lib/utils'

interface PokemonDetailsModalProps {
  pokemon: Pokemon | null
  isOpen: boolean
  onClose: () => void
  onSelect?: (pokemon: Pokemon) => void
  isDrafted?: boolean
  isDisabled?: boolean
  isAtPickLimit?: boolean
  currentPicks?: number
  maxPicks?: number
}

export default function PokemonDetailsModal({
  pokemon,
  isOpen,
  onClose,
  onSelect,
  isDrafted = false,
  isDisabled = false,
  isAtPickLimit = false,
  currentPicks,
  maxPicks,
}: PokemonDetailsModalProps) {
  const [imageError, setImageError] = useState(false)
  const [showOfficialArt, setShowOfficialArt] = useState(true)
  const [fallbackAttempt, setFallbackAttempt] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  if (!pokemon) return null

  // Image fallback chain for modal
  const getImageUrl = () => {
    if (showOfficialArt) {
      switch (fallbackAttempt) {
        case 0:
          return getOfficialArtworkUrl(pokemon.id)
        case 1:
          return getBestPokemonImageUrl(pokemon.id, pokemon.name)
        default:
          return getPokemonSpriteUrl(pokemon.id)
      }
    } else {
      switch (fallbackAttempt) {
        case 0:
          return getBestPokemonImageUrl(pokemon.id, pokemon.name)
        case 1:
          return getPokemonAnimatedBackupUrl(pokemon.id)
        case 2:
          return getPokemonSpriteUrl(pokemon.id)
        default:
          return getOfficialArtworkUrl(pokemon.id)
      }
    }
  }

  const handleImageError = () => {
    if (fallbackAttempt < 3) {
      setFallbackAttempt(prev => prev + 1)
      setImageError(false)
    } else {
      setImageError(true)
      setIsLoading(false)
    }
  }

  const handleImageLoad = () => {
    setIsLoading(false)
    setImageError(false)
  }

  const handleImageClick = () => {
    setShowOfficialArt(!showOfficialArt)
    setFallbackAttempt(0)
    setImageError(false)
    setIsLoading(true)
  }

  const statMax = 255

  if (!pokemon) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700">
        <DialogHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                {pokemon.name}
              </DialogTitle>
              <DialogDescription className="text-slate-600 dark:text-slate-400 flex items-center gap-2 text-sm">
                <span>Pokémon #{pokemon.id.padStart(3, '0')}</span>
                {!isDrafted && !isDisabled && (
                  <>
                    <span>•</span>
                    <span className="text-green-600 dark:text-green-400 font-medium">Available to draft</span>
                  </>
                )}
              </DialogDescription>
            </div>
            <Badge
              className={cn(
                "text-xl px-5 py-2.5 font-bold shadow-lg whitespace-nowrap",
                pokemon.cost >= 25 ? "bg-red-500 hover:bg-red-600" :
                pokemon.cost >= 20 ? "bg-purple-500 hover:bg-purple-600" :
                pokemon.cost >= 15 ? "bg-blue-500 hover:bg-blue-600" :
                pokemon.cost >= 10 ? "bg-green-500 hover:bg-green-600" :
                "bg-gray-500 hover:bg-gray-600"
              )}
            >
              {pokemon.cost} pts
            </Badge>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Image and Basic Info */}
          <div className="space-y-4">
            {/* Pokemon Image */}
            <div className="flex justify-center relative min-h-[200px]">
              {!imageError ? (
                <>
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    </div>
                  )}
                  <Image
                    src={getImageUrl()}
                    alt={pokemon.name}
                    width={200}
                    height={200}
                    className={cn(
                      "cursor-pointer transition-all duration-200 hover:scale-105",
                      isLoading && "opacity-0",
                      !isLoading && "opacity-100"
                    )}
                    onClick={handleImageClick}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                    unoptimized
                  />
                </>
              ) : (
                <div className="w-48 h-48 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400">
                  No Image Available
                </div>
              )}
            </div>

            {/* Types */}
            <div className="flex justify-center gap-2">
              {pokemon.types.map((type) => (
                <Badge
                  key={type.name}
                  className="text-white px-4 py-1.5 text-sm font-semibold"
                  style={{ backgroundColor: type.color }}
                >
                  {type.name.toUpperCase()}
                </Badge>
              ))}
            </div>

            {/* Abilities */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
              <h3 className="font-semibold mb-3 text-slate-900 dark:text-white">Abilities</h3>
              <div className="flex flex-wrap gap-2">
                {pokemon.abilities.map((ability, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
                  >
                    {ability}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Stats */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-slate-900 dark:text-white">Base Stats</h3>

            <div className="space-y-3">
              {[
                { name: 'HP', value: pokemon.stats.hp, key: 'hp' },
                { name: 'Attack', value: pokemon.stats.attack, key: 'attack' },
                { name: 'Defense', value: pokemon.stats.defense, key: 'defense' },
                { name: 'Sp. Attack', value: pokemon.stats.specialAttack, key: 'specialAttack' },
                { name: 'Sp. Defense', value: pokemon.stats.specialDefense, key: 'specialDefense' },
                { name: 'Speed', value: pokemon.stats.speed, key: 'speed' },
              ].map((stat) => (
                <div key={stat.key} className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{stat.name}</span>
                    <span
                      className="font-bold text-base"
                      style={{ color: getStatColor(stat.value) }}
                    >
                      {stat.value}
                    </span>
                  </div>
                  <Progress
                    value={(stat.value / statMax) * 100}
                    className="h-2"
                  />
                </div>
              ))}

              {/* Total */}
              <div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-900 dark:text-white">Total</span>
                  <span className="font-bold text-lg text-purple-600 dark:text-purple-400">
                    {pokemon.stats.total}
                  </span>
                </div>
                <Progress
                  value={(pokemon.stats.total / (statMax * 6)) * 100}
                  className="h-2.5 mt-2"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {!isDrafted && !isDisabled && onSelect && (
          <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-700">
            <Button
              variant="outline"
              onClick={onClose}
              className="px-6"
            >
              Close
            </Button>
            <Button
              onClick={() => onSelect(pokemon)}
              disabled={isAtPickLimit}
              className="px-6 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAtPickLimit
                ? `Pick Limit Reached (${currentPicks}/${maxPicks})`
                : `Draft ${pokemon.name}`
              }
            </Button>
          </div>
        )}

        {isDrafted && (
          <div className="flex justify-center pt-4 border-t border-slate-200 dark:border-slate-700">
            <Badge variant="destructive" className="px-4 py-2">
              This Pokémon has already been drafted
            </Badge>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}