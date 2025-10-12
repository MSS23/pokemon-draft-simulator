'use client'

import React, { useState } from 'react'
import { WishlistItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  Heart,
  X,
  GripVertical,
  Crown,
  AlertTriangle,
  Star,
  ChevronUp,
  ChevronDown,
  Zap,
  DollarSign
} from 'lucide-react'

interface MobileWishlistSheetProps {
  wishlist: WishlistItem[]
  isConnected: boolean
  totalCost: number
  currentBudget: number
  nextPick?: WishlistItem | null
  isOpen: boolean
  onToggle: () => void
  onRemove: (pokemonId: string) => void
  onReorder: (reorderedItems: WishlistItem[]) => void
  className?: string
}

export default function MobileWishlistSheet({
  wishlist,
  isConnected,
  totalCost,
  currentBudget,
  nextPick,
  isOpen,
  onToggle,
  onRemove,
  onReorder,
  className
}: MobileWishlistSheetProps) {
  const availableItems = wishlist.filter(item => item.isAvailable)
  const isOverBudget = totalCost > currentBudget

  const handleClearDrafted = () => {
    wishlist.forEach(item => {
      if (!item.isAvailable) {
        onRemove(item.pokemonId)
      }
    })
  }

  const handleClearAll = () => {
    wishlist.forEach(item => onRemove(item.pokemonId))
  }

  return (
    <div className={cn(
      "fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-slate-900",
      "border-t-2 border-purple-200 dark:border-purple-700 shadow-2xl",
      "transition-transform duration-300 ease-out",
      isOpen ? "translate-y-0" : "translate-y-full",
      className
    )}>
      {/* Handle Bar */}
      <div className="flex justify-center pt-2 pb-1">
        <div className="w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-8 w-8 p-0"
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <div>
            <h3 className="font-bold text-lg text-purple-700 dark:text-purple-300 flex items-center gap-2">
              <Heart className="h-5 w-5" />
              Wishlist ({wishlist.length})
            </h3>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? "default" : "destructive"} className="flex items-center gap-1 text-xs">
            <div className={cn("h-2 w-2 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")} />
            {isConnected ? "Live" : "Offline"}
          </Badge>
          <Badge
            variant={isOverBudget ? "destructive" : "outline"}
            className="flex items-center gap-1 text-xs"
          >
            <DollarSign className="h-3 w-3" />
            {totalCost}/{currentBudget}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className={cn(
        "transition-all duration-300",
        isOpen ? "max-h-96" : "max-h-0 overflow-hidden"
      )}>
        {/* Next Pick Banner */}
        {nextPick && (
          <div className="mx-4 mt-3 p-3 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-lg border border-green-200 dark:border-green-700">
            <div className="flex items-center gap-3">
              <Crown className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div className="flex-1">
                <div className="font-semibold text-green-800 dark:text-green-200 text-sm">
                  Next Auto-Pick
                </div>
                <div className="text-green-700 dark:text-green-300 text-xs">
                  {nextPick.pokemonName} • {nextPick.cost} pts
                </div>
              </div>
              <Zap className="h-4 w-4 text-green-500" />
            </div>
          </div>
        )}

        {/* Wishlist Items */}
        <div className="p-4">
          {wishlist.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Heart className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium mb-1">No Pokémon in wishlist</p>
              <p className="text-xs">Tap ♡ on cards to add them</p>
            </div>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {wishlist.map((item, index) => (
                  <MobileWishlistItem
                    key={item.id}
                    item={item}
                    index={index}
                    isNext={item.id === nextPick?.id}
                    onRemove={() => onRemove(item.pokemonId)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Actions */}
          {wishlist.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={handleClearDrafted}
              >
                Clear Drafted
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleClearAll}
              >
                Clear All
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Collapsed State Info */}
      {!isOpen && wishlist.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>{availableItems.length} available</span>
            {nextPick && (
              <span className="text-green-600 dark:text-green-400 font-medium">
                Next: {nextPick.pokemonName}
              </span>
            )}
            <span className={cn(
              "font-medium",
              isOverBudget ? "text-red-600" : "text-gray-600"
            )}>
              {totalCost}/{currentBudget} pts
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// Mobile-optimized wishlist item
interface MobileWishlistItemProps {
  item: WishlistItem
  index: number
  isNext: boolean
  onRemove: () => void
}

function MobileWishlistItem({
  item,
  index,
  isNext,
  onRemove
}: MobileWishlistItemProps) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border transition-all duration-200",
      "active:scale-98 touch-manipulation",
      isNext && "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700",
      !item.isAvailable && "opacity-60 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700",
      item.isAvailable && !isNext && "bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700"
    )}>
      {/* Drag Handle - Hidden for now, can be enabled later */}
      <div className="opacity-30">
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>

      {/* Priority */}
      <div className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
        isNext ? "bg-green-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
      )}>
        {index + 1}
      </div>

      {/* Pokemon Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{item.pokemonName}</span>
          {isNext && <Crown className="h-3 w-3 text-yellow-500 flex-shrink-0" />}
          {!item.isAvailable && <X className="h-3 w-3 text-red-500 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{item.cost} pts</span>
          {!item.isAvailable && (
            <Badge variant="destructive" className="text-xs px-1 py-0">
              Drafted
            </Badge>
          )}
        </div>
      </div>

      {/* Remove Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 active:bg-red-100 flex-shrink-0"
        title="Remove from wishlist"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}