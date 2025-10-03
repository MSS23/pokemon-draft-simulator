'use client'

import Image from 'next/image'
import { Pokemon } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getStatColor, getPokemonCardClass, getPokemonRarityClass, isPokemonShiny } from '@/utils/pokemon'
import { cn } from '@/lib/utils'
import { usePendingActionFeedback } from '@/hooks/useOptimisticUpdates'
import { usePokemonImage } from '@/hooks/usePokemonImage'
import { Clock, AlertCircle, CheckCircle, Eye, Heart } from 'lucide-react'

interface PokemonCardProps {
  pokemon: Pokemon
  onViewDetails?: (pokemon: Pokemon) => void
  onAddToWishlist?: (pokemon: Pokemon) => void
  onRemoveFromWishlist?: (pokemon: Pokemon) => void
  isDrafted?: boolean
  isDisabled?: boolean
  isInWishlist?: boolean
  isUnaffordable?: boolean
  showCost?: boolean
  showStats?: boolean
  showWishlistButton?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function PokemonCard({
  pokemon,
  onViewDetails,
  onAddToWishlist,
  onRemoveFromWishlist,
  isDrafted = false,
  isDisabled = false,
  isInWishlist = false,
  isUnaffordable = false,
  showCost = true,
  showStats = true,
  showWishlistButton = true,
  size = 'md',
  className,
}: PokemonCardProps) {
  // Check for pending actions
  const { getPendingActionStatus } = usePendingActionFeedback()
  const pendingPick = getPendingActionStatus('pick', pokemon.id.toString())
  const pendingBid = getPendingActionStatus('bid', pokemon.id.toString())
  const pendingNominate = getPendingActionStatus('nominate', pokemon.id.toString())
  
  const isPending = !!(pendingPick || pendingBid || pendingNominate)
  const pendingAction = pendingPick || pendingBid || pendingNominate

  // Use centralized image handling hook
  const {
    imageUrl,
    isLoading,
    hasError,
    handleImageError,
    handleImageLoad,
    toggleImageMode
  } = usePokemonImage({
    pokemonId: pokemon.id,
    pokemonName: pokemon.name,
    preferOfficialArt: false
  })

  const sizeClasses = {
    sm: 'w-32 h-44 sm:w-36 sm:h-48',
    md: 'w-44 h-56 sm:w-48 sm:h-60 md:w-52 md:h-64',
    lg: 'w-56 h-72 sm:w-60 sm:h-76 md:w-64 md:h-80'
  }

  const imageSizes = {
    sm: 56,
    md: 80,
    lg: 96
  }

  // Image click handler for switching modes
  const handleImageClick = () => {
    toggleImageMode()
  }

  // Wishlist toggle handler
  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering card click
    if (isInWishlist) {
      onRemoveFromWishlist?.(pokemon)
    } else {
      onAddToWishlist?.(pokemon)
    }
  }

  return (
    <Card
      className={cn(
        sizeClasses[size],
        'relative group',
        'border-2 border-gray-300 rounded-xl overflow-hidden',
        'bg-gradient-to-br from-white via-gray-50 to-gray-100',
        'pokemon-entrance pokemon-hover',
        'transition-all duration-300 ease-out',
        'hover:scale-[1.02] hover:shadow-xl hover:shadow-gray-200/50',
        'focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2',
        isPokemonShiny(pokemon) && getPokemonRarityClass(pokemon.cost),
        isPokemonShiny(pokemon) && 'pokemon-sparkle',
        isDrafted && 'opacity-60 grayscale',
        isDisabled && 'opacity-40 cursor-not-allowed',
        isUnaffordable && 'opacity-75 border-orange-300 dark:border-orange-600',
        !isDisabled && !isDrafted && 'cursor-pointer',
        isPending && 'ring-4 ring-yellow-400 ring-opacity-80 animate-pulse',
        pendingAction?.status === 'failed' && 'ring-4 ring-red-400 ring-opacity-80',
        className
      )}
      onClick={() => !isDisabled && !isDrafted && onViewDetails?.(pokemon)}
    >
      {/* TCG-style border gradient */}
      <div className={cn(
        'absolute inset-0 rounded-xl',
        getPokemonCardClass(pokemon),
        'opacity-20'
      )} />

      {/* Inner card content */}
      <CardContent className="relative p-3 h-full flex flex-col bg-white/90 backdrop-blur-sm rounded-lg m-1">
        {/* TCG-style header */}
        <div className="flex justify-between items-start mb-2 sm:mb-3">
          <div className="flex-1 pr-2">
            <h3 className={cn(
              "font-bold text-gray-900 leading-tight mb-1",
              size === 'sm' ? "text-xs" : "text-sm"
            )}>
              {pokemon.name}
            </h3>
            <div className={cn(
              "text-gray-600",
              size === 'sm' ? "text-xs" : "text-xs"
            )}>
              #{pokemon.id.padStart(3, '0')}
            </div>
          </div>
          {showCost && (
            <div className="flex flex-col items-end">
              <Badge
                className={cn(
                  "font-bold px-2 py-1 rounded-full shadow-sm",
                  size === 'sm' ? "text-xs" : "text-xs",
                  pokemon.cost >= 25 ? "bg-gradient-to-r from-yellow-400 to-orange-500 text-white" :
                  pokemon.cost >= 20 ? "bg-gradient-to-r from-purple-400 to-pink-500 text-white" :
                  pokemon.cost >= 15 ? "bg-gradient-to-r from-blue-400 to-cyan-500 text-white" :
                  pokemon.cost >= 10 ? "bg-gradient-to-r from-green-400 to-emerald-500 text-white" :
                  "bg-gradient-to-r from-gray-400 to-gray-500 text-white"
                )}
              >
                {pokemon.cost}
              </Badge>
              <span className="text-xs text-gray-500 mt-1">pts</span>
            </div>
          )}
        </div>

        {/* Pending Action Indicator */}
        {isPending && (
          <div className="absolute top-2 left-2 z-10">
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shadow-lg",
              pendingAction?.status === 'pending' && "bg-yellow-100 text-yellow-800 border border-yellow-300",
              pendingAction?.status === 'failed' && "bg-red-100 text-red-800 border border-red-300"
            )}>
              {pendingAction?.status === 'pending' && <Clock className="h-3 w-3 animate-spin" />}
              {pendingAction?.status === 'failed' && <AlertCircle className="h-3 w-3" />}
              <span>
                {pendingPick && 'Picking...'}
                {pendingBid && 'Bidding...'}
                {pendingNominate && 'Nominating...'}
                {pendingAction?.status === 'failed' && 'Failed'}
              </span>
            </div>
          </div>
        )}

        {/* Wishlist Button */}
        {showWishlistButton && !isDrafted && !isDisabled && (
          <div className="absolute top-2 left-2 z-10">
            <Button
              variant={isInWishlist ? "default" : "ghost"}
              size="sm"
              onClick={handleWishlistToggle}
              className={cn(
                "h-8 w-8 p-0 rounded-full transition-all duration-300",
                "shadow-lg border border-white/20 backdrop-blur-sm",
                isInWishlist
                  ? "bg-gradient-to-r from-pink-500 to-red-500 text-white hover:from-pink-600 hover:to-red-600"
                  : "bg-white/80 text-gray-600 hover:bg-white hover:text-pink-500 opacity-0 group-hover:opacity-100"
              )}
              title={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
            >
              <Heart className={cn("h-4 w-4", isInWishlist && "fill-current")} />
            </Button>
          </div>
        )}

        {/* Quick Draft Indicator */}
        {!isDrafted && !isDisabled && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out transform translate-y-1 group-hover:translate-y-0 z-10">
            <Badge className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs px-3 py-1.5 shadow-lg border border-white/20 backdrop-blur-sm">
              <span className="flex items-center gap-1">
                <span>Click to Draft</span>
                <span className="text-blue-200">✨</span>
              </span>
            </Badge>
          </div>
        )}

        {/* Pokemon Image - TCG Style */}
        <div className="flex-1 flex items-center justify-center mb-3 relative">
          <div className="relative bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-2 border border-gray-200">
            {!hasError ? (
              <>
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-lg transition-opacity duration-200">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500/30 border-t-blue-500"></div>
                      <div className="text-xs text-gray-500 font-medium animate-pulse">Loading...</div>
                    </div>
                  </div>
                )}
                <Image
                  src={imageUrl}
                  alt={pokemon.name}
                  width={imageSizes[size]}
                  height={imageSizes[size]}
                  className={cn(
                    "cursor-pointer transition-all duration-300 hover:scale-110 rounded-md",
                    "drop-shadow-lg",
                    isLoading && "opacity-0",
                    !isLoading && "opacity-100"
                  )}
                  style={{
                    width: 'auto',
                    height: 'auto',
                    maxWidth: `${imageSizes[size]}px`,
                    maxHeight: `${imageSizes[size]}px`
                  }}
                  onClick={handleImageClick}
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                  unoptimized // Allow GIFs to animate
                />
                {/* Sparkle effect for shiny Pokemon */}
                {isPokemonShiny(pokemon) && !isLoading && (
                  <div className="absolute -top-1 -right-1 text-yellow-400 animate-pulse">
                    ✨
                  </div>
                )}
              </>
            ) : (
              <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500 text-xs">
                No Image
              </div>
            )}
          </div>
        </div>

        {/* Types - TCG Style */}
        <div className="flex gap-1 mb-2 sm:mb-3 justify-center flex-wrap">
          {pokemon.types.map((type, index) => (
            <Badge
              key={type.name}
              className={cn(
                "text-white font-semibold tracking-wide shadow-lg border border-white/30",
                "transition-all duration-300 hover:scale-110 hover:shadow-xl",
                size === 'sm' ? "text-xs px-2 py-0.5" : "text-xs px-3 py-1"
              )}
              style={{
                backgroundColor: type.color,
                boxShadow: `0 2px 8px ${type.color}40`,
                animationDelay: `${index * 0.1}s`
              }}
            >
              {size === 'sm' ? type.name.slice(0, 3).toUpperCase() : type.name.toUpperCase()}
            </Badge>
          ))}
        </div>

        {/* Enhanced Stats Display */}
        {showStats && size !== 'sm' && (
          <div className="bg-gradient-to-br from-white via-gray-50 to-gray-100 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600 rounded-lg p-3 border-2 border-gray-200 dark:border-slate-600 shadow-inner stat-reveal">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="text-center bg-red-50 dark:bg-red-900/20 rounded-lg p-2 transition-all duration-300 hover:scale-105 hover:shadow-md border border-red-100 dark:border-red-800">
                <div className="text-red-600 dark:text-red-400 font-semibold text-xs mb-1">HP</div>
                <div className="font-bold text-red-700 dark:text-red-300 text-lg leading-none">{pokemon.stats.hp}</div>
              </div>
              <div className="text-center bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2 transition-all duration-300 hover:scale-105 hover:shadow-md border border-orange-100 dark:border-orange-800">
                <div className="text-orange-600 dark:text-orange-400 font-semibold text-xs mb-1">ATK</div>
                <div className="font-bold text-orange-700 dark:text-orange-300 text-lg leading-none">{pokemon.stats.attack}</div>
              </div>
              <div className="text-center bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 transition-all duration-300 hover:scale-105 hover:shadow-md border border-blue-100 dark:border-blue-800">
                <div className="text-blue-600 dark:text-blue-400 font-semibold text-xs mb-1">DEF</div>
                <div className="font-bold text-blue-700 dark:text-blue-300 text-lg leading-none">{pokemon.stats.defense}</div>
              </div>
            </div>
            <div className="text-center pt-2 border-t-2 border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="text-sm font-bold text-purple-700 dark:text-purple-300 transition-all duration-300 group-hover:animate-pulse">
                <span className="text-xs opacity-75">BST:</span> <span className="text-lg">{pokemon.stats.total}</span>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Call-to-Action */}
        {!isDrafted && !isDisabled && size !== 'sm' && (
          <div className="mt-3">
            <div className="w-full text-center py-2.5 px-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-200 dark:border-blue-800 group-hover:from-blue-100 group-hover:to-purple-100 dark:group-hover:from-blue-800/30 dark:group-hover:to-purple-800/30 transition-all duration-300 ease-out hover:shadow-sm hover:scale-[1.01]">
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 group-hover:text-blue-800 dark:group-hover:text-blue-200 transition-colors duration-200 flex items-center justify-center gap-1.5">
                <Eye className="h-3 w-3" />
                <span>View Details & Draft</span>
              </span>
            </div>
          </div>
        )}

        {/* Drafted indicator - TCG Style */}
        {isDrafted && (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900/80 to-black/80 flex items-center justify-center rounded-xl backdrop-blur-sm">
            <div className="text-center">
              <Badge
                variant="destructive"
                className="font-bold text-sm px-4 py-2 bg-red-600 border border-red-500 shadow-lg"
              >
                DRAFTED
              </Badge>
              <div className="text-white text-xs mt-2 font-medium">
                Unavailable
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}