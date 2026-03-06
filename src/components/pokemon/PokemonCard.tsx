'use client'

import React from 'react'
import Image from 'next/image'
import { Pokemon } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getPokemonCardClass } from '@/utils/pokemon'
import { cn } from '@/lib/utils'
import { usePendingActionFeedback } from '@/hooks/useOptimisticUpdates'
import { usePokemonImage } from '@/hooks/usePokemonImage'
import { Clock, AlertCircle, Heart, Zap, Lock, Bookmark } from 'lucide-react'

interface PokemonCardProps {
  pokemon: Pokemon
  onViewDetails?: (pokemon: Pokemon) => void
  onQuickDraft?: (pokemon: Pokemon) => void
  onAddToWishlist?: (pokemon: Pokemon) => void
  onRemoveFromWishlist?: (pokemon: Pokemon) => void
  onPreDraft?: (pokemon: Pokemon) => void
  onClearPreDraft?: (pokemon: Pokemon) => void
  isDrafted?: boolean
  isDisabled?: boolean
  isInWishlist?: boolean
  isPreDrafted?: boolean
  isUnaffordable?: boolean
  isUnsafe?: boolean
  showCost?: boolean
  showStats?: boolean
  showWishlistButton?: boolean
  showQuickDraft?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  draftedByTeamName?: string
}

const CARD_HEIGHTS = {
  sm: 'h-[200px]',
  md: 'h-[260px]',
  lg: 'h-[340px]'
} as const

const IMAGE_SIZES = {
  sm: 80,
  md: 96,
  lg: 128
} as const

const PokemonCard = ({
  pokemon,
  onViewDetails,
  onQuickDraft,
  onAddToWishlist,
  onRemoveFromWishlist,
  onPreDraft,
  onClearPreDraft,
  isDrafted = false,
  isDisabled = false,
  isInWishlist = false,
  isPreDrafted = false,
  isUnaffordable = false,
  isUnsafe = false,
  showCost = true,
  showStats: _showStats = true,
  showWishlistButton = true,
  showQuickDraft = false,
  size = 'md',
  className,
  draftedByTeamName,
}: PokemonCardProps) => {
  const { getPendingActionStatus } = usePendingActionFeedback()
  const pendingPick = getPendingActionStatus('pick', pokemon.id.toString())
  const pendingBid = getPendingActionStatus('bid', pokemon.id.toString())
  const pendingNominate = getPendingActionStatus('nominate', pokemon.id.toString())
  const isPending = !!(pendingPick || pendingBid || pendingNominate)
  const pendingAction = pendingPick || pendingBid || pendingNominate

  const {
    imageUrl,
    isLoading,
    hasError,
    handleImageError,
    handleImageLoad,
  } = usePokemonImage({
    pokemonId: pokemon.id,
    pokemonName: pokemon.name,
    preferOfficialArt: false
  })

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isInWishlist) {
      onRemoveFromWishlist?.(pokemon)
    } else {
      onAddToWishlist?.(pokemon)
    }
  }

  const handleQuickDraft = (e: React.MouseEvent) => {
    e.stopPropagation()
    onQuickDraft?.(pokemon)
  }

  const handlePreDraftToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPreDrafted) {
      onClearPreDraft?.(pokemon)
    } else {
      onPreDraft?.(pokemon)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isDisabled || isDrafted) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onViewDetails?.(pokemon)
    }
  }

  const cardAriaLabel = `${pokemon.name}, ${pokemon.cost} points${isDrafted ? ', drafted' : ''}${isUnaffordable ? ', unaffordable' : ''}${isUnsafe ? ', would bust budget' : ''}${isInWishlist ? ', in wishlist' : ''}`

  return (
    <div
      role="article"
      tabIndex={!isDisabled && !isDrafted ? 0 : -1}
      aria-label={cardAriaLabel}
      onKeyDown={handleKeyDown}
      onClick={() => !isDisabled && !isDrafted && onViewDetails?.(pokemon)}
      className={cn(
        'relative group rounded-xl overflow-hidden',
        CARD_HEIGHTS[size],
        'flex flex-col',
        'border border-gray-200 dark:border-gray-700',
        'transition-all duration-200 ease-out',
        'hover:shadow-lg hover:scale-[1.02]',
        'active:scale-[0.98]',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
        'touch-manipulation',
        isDrafted && 'opacity-60 grayscale',
        isDisabled && 'opacity-40 cursor-not-allowed',
        isUnaffordable && 'opacity-75 border-orange-300 dark:border-orange-600',
        isUnsafe && !isUnaffordable && 'opacity-75 border-red-400 dark:border-red-500',
        !isDisabled && !isDrafted && 'cursor-pointer',
        isPreDrafted && !isPending && 'ring-2 ring-purple-500 ring-opacity-80 border-purple-400 dark:border-purple-500',
        isPending && 'ring-4 ring-yellow-400 ring-opacity-80 animate-pulse',
        pendingAction?.status === 'failed' && 'ring-4 ring-red-400 ring-opacity-80',
        className
      )}
    >
      {/* Type-tinted background */}
      <div className={cn(
        'absolute inset-0',
        getPokemonCardClass(pokemon),
        'opacity-15 dark:opacity-20'
      )} />

      {/* Card background */}
      <div className="absolute inset-0 bg-white/85 dark:bg-card/90" />

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
      {showWishlistButton && !isDisabled && (
        <div className="absolute top-1.5 left-1.5 z-20">
          <Button
            variant={isInWishlist ? "default" : "ghost"}
            size="sm"
            onClick={handleWishlistToggle}
            aria-label={isInWishlist ? `Remove ${pokemon.name} from wishlist` : `Add ${pokemon.name} to wishlist`}
            aria-pressed={isInWishlist}
            className={cn(
              "h-8 w-8 p-0 rounded-full transition-all duration-200",
              "shadow-sm border border-white/20",
              "touch-manipulation active:scale-90",
              isInWishlist
                ? "bg-gradient-to-r from-pink-500 to-red-500 text-white hover:from-pink-600 hover:to-red-600"
                : "bg-white/80 text-gray-500 hover:bg-white hover:text-pink-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            )}
            title={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Heart className={cn("h-3.5 w-3.5", isInWishlist && "fill-current")} />
            <span className="sr-only">
              {isInWishlist ? `Remove ${pokemon.name} from wishlist` : `Add ${pokemon.name} to wishlist`}
            </span>
          </Button>
        </div>
      )}

      {/* Pre-draft Button */}
      {(onPreDraft || onClearPreDraft) && !isDisabled && !isDrafted && (
        <div className="absolute top-10 left-1.5 z-20">
          <Button
            variant={isPreDrafted ? "default" : "ghost"}
            size="sm"
            onClick={handlePreDraftToggle}
            aria-label={isPreDrafted ? `Remove ${pokemon.name} from pre-draft` : `Pre-draft ${pokemon.name}`}
            aria-pressed={isPreDrafted}
            className={cn(
              "h-8 w-8 p-0 rounded-full transition-all duration-200",
              "shadow-sm border border-white/20",
              "touch-manipulation active:scale-90",
              isPreDrafted
                ? "bg-gradient-to-r from-purple-500 to-violet-500 text-white hover:from-purple-600 hover:to-violet-600"
                : "bg-white/80 text-gray-500 hover:bg-white hover:text-purple-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            )}
            title={isPreDrafted ? "Clear pre-draft" : "Pre-draft this Pokémon"}
          >
            <Bookmark className={cn("h-3.5 w-3.5", isPreDrafted && "fill-current")} />
            <span className="sr-only">
              {isPreDrafted ? `Remove ${pokemon.name} from pre-draft` : `Pre-draft ${pokemon.name}`}
            </span>
          </Button>
        </div>
      )}

      {/* Cost Badge */}
      {showCost && (
        <div className="absolute top-1.5 right-1.5 z-10">
          <Badge
            size={size === 'sm' ? "sm" : undefined}
            className={cn(
              "font-bold px-1.5 py-0.5 rounded-full shadow-sm",
              size !== 'sm' && "text-xs",
              pokemon.cost >= 25 ? "bg-gradient-to-r from-yellow-400 to-orange-500 text-white" :
              pokemon.cost >= 20 ? "bg-gradient-to-r from-purple-400 to-pink-500 text-white" :
              pokemon.cost >= 15 ? "bg-gradient-to-r from-blue-400 to-cyan-500 text-white" :
              pokemon.cost >= 10 ? "bg-gradient-to-r from-green-400 to-emerald-500 text-white" :
              "bg-gradient-to-r from-gray-400 to-gray-500 text-white"
            )}
          >
            {pokemon.cost}
          </Badge>
        </div>
      )}

      {/* Unsafe Pick Warning */}
      {isUnsafe && !isUnaffordable && !isDrafted && (
        <div className="absolute bottom-1.5 left-1.5 z-10" title="Picking this would leave you unable to fill your team">
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/60 dark:text-red-300 dark:border-red-600 shadow-sm">
            <Lock className="h-3 w-3" />
            <span className="hidden sm:inline">Budget lock</span>
          </div>
        </div>
      )}

      {/* Image area */}
      <div className="relative flex-1 flex items-center justify-center p-2">
        {!hasError ? (
          <>
            {isLoading && (
              <div className="absolute inset-0 m-2 rounded-lg bg-gray-100 dark:bg-muted animate-pulse" />
            )}
            <Image
              src={imageUrl}
              alt={pokemon.name}
              width={IMAGE_SIZES[size]}
              height={IMAGE_SIZES[size]}
              className={cn(
                "relative z-[1] cursor-pointer transition-all duration-200 hover:scale-110",
                "drop-shadow-md",
                isLoading ? "opacity-0" : "opacity-100"
              )}
              style={{
                width: 'auto',
                height: 'auto',
                maxWidth: `${IMAGE_SIZES[size]}px`,
                maxHeight: `${IMAGE_SIZES[size]}px`
              }}
              onClick={(e) => { e.stopPropagation(); onViewDetails?.(pokemon) }}
              onError={handleImageError}
              onLoad={handleImageLoad}
              unoptimized
            />
          </>
        ) : (
          <div className="w-12 h-12 bg-gray-200 dark:bg-muted rounded-lg flex items-center justify-center text-gray-400 text-xs">
            ?
          </div>
        )}
      </div>

      {/* Bottom info: name + types */}
      <div className="relative z-[1] px-2.5 pb-2 space-y-1">
        <h3 className={cn(
          "font-semibold text-gray-900 dark:text-gray-100 leading-tight truncate",
          size === 'sm' ? "text-xs" : "text-sm"
        )}>
          {pokemon.name}
        </h3>
        <div className="flex gap-1 flex-wrap">
          {pokemon.types.map((type) => (
            <Badge
              key={type.name}
              size={size !== 'sm' ? "sm" : undefined}
              className={cn(
                "text-white font-medium shadow-sm border-0",
                size === 'sm' && "text-[9px] px-1 py-0"
              )}
              style={{ backgroundColor: type.color }}
            >
              {type.name.toUpperCase()}
            </Badge>
          ))}
        </div>
      </div>

      {/* Quick Draft Button */}
      {showQuickDraft && !isDrafted && !isDisabled && !isUnaffordable && !isUnsafe && (
        <div className="absolute bottom-1.5 right-1.5 z-10">
          <Button
            variant="default"
            size="sm"
            onClick={handleQuickDraft}
            aria-label={`Quick draft ${pokemon.name}`}
            className={cn(
              "h-8 w-8 p-0 rounded-full transition-all duration-200",
              "shadow-md border border-white/20",
              "touch-manipulation active:scale-90",
              "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700",
              "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            )}
            title={`Draft ${pokemon.name}`}
          >
            <Zap className="h-3.5 w-3.5 fill-current" />
          </Button>
        </div>
      )}

      {/* Drafted label */}
      {isDrafted && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-1 z-20 pointer-events-none">
          <div className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold shadow",
            "bg-gray-900/85 text-white border border-gray-700",
            "max-w-[90%]"
          )}>
            <Lock className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="truncate">{draftedByTeamName || 'DRAFTED'}</span>
          </div>
        </div>
      )}
    </div>
  )
}

const arePropsEqual = (
  prevProps: Readonly<PokemonCardProps>,
  nextProps: Readonly<PokemonCardProps>
): boolean => {
  if (prevProps.pokemon.id !== nextProps.pokemon.id) return false
  if (prevProps.isDrafted !== nextProps.isDrafted) return false
  if (prevProps.isDisabled !== nextProps.isDisabled) return false
  if (prevProps.isInWishlist !== nextProps.isInWishlist) return false
  if (prevProps.isPreDrafted !== nextProps.isPreDrafted) return false
  if (prevProps.isUnaffordable !== nextProps.isUnaffordable) return false
  if (prevProps.isUnsafe !== nextProps.isUnsafe) return false
  if (prevProps.showCost !== nextProps.showCost) return false
  if (prevProps.showStats !== nextProps.showStats) return false
  if (prevProps.showWishlistButton !== nextProps.showWishlistButton) return false
  if (prevProps.showQuickDraft !== nextProps.showQuickDraft) return false
  if (prevProps.size !== nextProps.size) return false
  if (prevProps.className !== nextProps.className) return false
  if (prevProps.draftedByTeamName !== nextProps.draftedByTeamName) return false
  if (!!prevProps.onPreDraft !== !!nextProps.onPreDraft) return false
  if (!!prevProps.onClearPreDraft !== !!nextProps.onClearPreDraft) return false
  return true
}

const MemoizedPokemonCard = React.memo(PokemonCard, arePropsEqual)
MemoizedPokemonCard.displayName = 'PokemonCard'

export default MemoizedPokemonCard
