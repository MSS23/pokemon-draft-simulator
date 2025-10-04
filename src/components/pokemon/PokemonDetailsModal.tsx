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
import { X } from 'lucide-react'

interface PokemonDetailsModalProps {
  pokemon: Pokemon | null
  isOpen: boolean
  onClose: () => void
  onSelect?: (pokemon: Pokemon) => void
  isDrafted?: boolean
  isDisabled?: boolean
}

export default function PokemonDetailsModal({
  pokemon,
  isOpen,
  onClose,
  onSelect,
  isDrafted = false,
  isDisabled = false,
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-white via-blue-50/30 to-purple-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <DialogHeader className="relative">
          {/* Background decoration */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-lg" />

          <div className="relative flex items-center justify-between">
            <div>
              <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent mb-1">
                {pokemon.name}
              </DialogTitle>
              <DialogDescription className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <span>Pokémon #{pokemon.id.padStart(3, '0')}</span>
                {!isDrafted && !isDisabled && (
                  <>
                    <span>•</span>
                    <span className="text-green-600 dark:text-green-400 font-medium">Available to draft</span>
                  </>
                )}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                className={cn(
                  "text-lg px-4 py-2 font-bold shadow-lg",
                  pokemon.cost >= 25 ? "bg-gradient-to-r from-red-500 to-orange-600 text-white" :
                  pokemon.cost >= 20 ? "bg-gradient-to-r from-purple-500 to-pink-600 text-white" :
                  pokemon.cost >= 15 ? "bg-gradient-to-r from-blue-500 to-cyan-600 text-white" :
                  pokemon.cost >= 10 ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white" :
                  "bg-gradient-to-r from-gray-500 to-slate-600 text-white"
                )}
                style={{
                  boxShadow: `0 4px 12px ${pokemon.cost >= 25 ? '#f56565' : pokemon.cost >= 20 ? '#9f7aea' : pokemon.cost >= 15 ? '#4299e1' : pokemon.cost >= 10 ? '#48bb78' : '#718096'}40`
                }}
              >
                {pokemon.cost} pts
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Image and Basic Info */}
          <div className="space-y-4">
            {/* Pokemon Image */}
            <div className="flex justify-center relative">
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
                      "cursor-pointer transition-all duration-300 hover:scale-105",
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
                <div className="w-48 h-48 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">
                  No Image Available
                </div>
              )}
            </div>

            {/* Types */}
            <div className="flex justify-center gap-2">
              {pokemon.types.map((type) => (
                <Badge
                  key={type.name}
                  className="text-white px-4 py-2 text-sm font-semibold"
                  style={{ backgroundColor: type.color }}
                >
                  {type.name.toUpperCase()}
                </Badge>
              ))}
            </div>

            {/* Abilities */}
            <div>
              <h3 className="font-semibold mb-2">Abilities</h3>
              <div className="space-y-1">
                {pokemon.abilities.map((ability, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="mr-2 mb-1"
                  >
                    {ability}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Stats */}
          <div className="space-y-4">
            {/* Stats Header */}
            <h3 className="font-semibold text-lg">Base Stats</h3>

            {/* Stats Content */}
            <div className="space-y-3">
                {[
                  { name: 'HP', value: pokemon.stats.hp, key: 'hp' },
                  { name: 'Attack', value: pokemon.stats.attack, key: 'attack' },
                  { name: 'Defense', value: pokemon.stats.defense, key: 'defense' },
                  { name: 'Sp. Attack', value: pokemon.stats.specialAttack, key: 'specialAttack' },
                  { name: 'Sp. Defense', value: pokemon.stats.specialDefense, key: 'specialDefense' },
                  { name: 'Speed', value: pokemon.stats.speed, key: 'speed' },
                ].map((stat) => (
                  <div key={stat.key} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">{stat.name}</span>
                      <span
                        className="font-bold"
                        style={{ color: getStatColor(stat.value) }}
                      >
                        {stat.value}
                      </span>
                    </div>
                    <Progress
                      value={(stat.value / statMax) * 100}
                      className="h-2"
                      style={{
                        backgroundColor: '#e5e7eb',
                      }}
                    />
                  </div>
                ))}

                {/* Total */}
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-lg text-purple-600">
                      {pokemon.stats.total}
                    </span>
                  </div>
                  <Progress
                    value={(pokemon.stats.total / (statMax * 6)) * 100}
                    className="h-3 mt-1"
                  />
                </div>

            </div>
          </div>
        </div>

        {/* Enhanced Action Buttons */}
        {!isDrafted && !isDisabled && onSelect && (
          <div className="flex justify-end gap-3 pt-6 border-t border-gradient-to-r from-blue-200 via-purple-200 to-cyan-200">
            <Button
              variant="outline"
              onClick={onClose}
              className="px-6 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Close
            </Button>
            <Button
              onClick={() => onSelect(pokemon)}
              className="px-8 font-bold text-lg shadow-xl bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 hover:from-blue-700 hover:via-purple-700 hover:to-cyan-700 text-white transform hover:scale-105 transition-all duration-200 flex items-center gap-2"
            >
              <span className="text-xl">🔥</span>
              Draft {pokemon.name}
              <span className="text-xl">⚡</span>
            </Button>
          </div>
        )}

        {isDrafted && (
          <div className="flex justify-center pt-4 border-t">
            <Badge variant="destructive" className="px-4 py-2">
              This Pokémon has already been drafted
            </Badge>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}