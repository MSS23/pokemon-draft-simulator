'use client'

import React, { useState } from 'react'
import { Pokemon, WishlistItem } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  Heart,
  X,
  GripVertical,
  Crown,
  Clock,
  AlertTriangle,
  Star,
  ChevronDown,
  ChevronUp,
  Zap
} from 'lucide-react'
import { useDraftStore } from '@/stores/draftStore'
import { selectUserWishlist, selectIsInWishlist } from '@/stores/selectors'
import { useDragAndDrop } from '@/hooks/useDragAndDrop'
import { useWishlistSync } from '@/hooks/useWishlistSync'
import { useBudgetValidation } from '@/hooks/useBudgetValidation'
import BudgetWarnings from './BudgetWarnings'

interface WishlistManagerProps {
  draftId: string
  participantId: string
  userTeam?: any
  currentBudget?: number
  usedBudget?: number
  className?: string
  isCompact?: boolean
}

export default function WishlistManager({
  draftId,
  participantId,
  userTeam,
  currentBudget = 100,
  usedBudget = 0,
  className,
  isCompact = false
}: WishlistManagerProps) {
  const [isExpanded, setIsExpanded] = useState(!isCompact)

  // Real-time wishlist synchronization
  const {
    userWishlist,
    removeFromWishlist,
    reorderWishlist: reorderWishlistItems,
    isConnected
  } = useWishlistSync({
    draftId,
    participantId
  })

  // Budget validation
  const budgetValidation = useBudgetValidation({
    wishlist: userWishlist,
    currentBudget,
    usedBudget
  })

  // Calculate wishlist stats
  const totalCost = budgetValidation.totalCost
  const availableItems = budgetValidation.affordableItems
  const nextPick = availableItems.length > 0 ? availableItems[0] : null
  const isOverBudget = budgetValidation.isOverBudget

  const handleRemoveItem = async (pokemonId: string) => {
    await removeFromWishlist(pokemonId)
  }

  const handleToggleAvailability = (itemId: string, isAvailable: boolean) => {
    // This is handled automatically by real-time sync when Pokemon are drafted
    console.log('Availability toggle not implemented - handled by real-time sync')
  }

  // Drag and drop functionality
  const {
    draggedItem,
    dragOverIndex,
    handleDragStart,
    handleDragEnd,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    isDragging
  } = useDragAndDrop<WishlistItem>({
    items: userWishlist,
    onReorder: (reorderedItems) => {
      reorderWishlistItems(reorderedItems)
    }
  })

  if (isCompact && !isExpanded) {
    return (
      <Card className={cn(
        "fixed bottom-4 right-4 w-16 h-16 z-50 cursor-pointer",
        "bg-gradient-to-br from-purple-500 to-blue-600 text-white",
        "border-2 border-white/20 shadow-xl hover:shadow-2xl",
        "transition-all duration-300 hover:scale-105",
        className
      )}>
        <CardContent
          className="p-0 h-full flex items-center justify-center relative"
          onClick={() => setIsExpanded(true)}
        >
          <Heart className="h-6 w-6" />
          {userWishlist.length > 0 && (
            <Badge className="absolute -top-2 -right-2 bg-yellow-500 text-yellow-900 text-xs h-5 w-5 rounded-full p-0 flex items-center justify-center">
              {userWishlist.length}
            </Badge>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(
      "fixed bottom-4 right-4 w-80 z-50",
      "bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm",
      "border-2 border-purple-200 dark:border-purple-700 shadow-2xl",
      isCompact && "max-h-96",
      className
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold text-purple-700 dark:text-purple-300 flex items-center gap-2">
            <Heart className="h-5 w-5" />
            Draft Wishlist
          </CardTitle>
          <div className="flex items-center gap-2">
            {isCompact && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-8 w-8 p-0"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* Wishlist Stats */}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={isConnected ? "default" : "destructive"} className="flex items-center gap-1">
            <div className={cn("h-2 w-2 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")} />
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <Star className="h-3 w-3" />
            {userWishlist.length} items
          </Badge>
          <Badge
            variant={isOverBudget ? "destructive" : "outline"}
            className="flex items-center gap-1"
          >
            {isOverBudget && <AlertTriangle className="h-3 w-3" />}
            {totalCost}/{budgetValidation.remainingBudget} pts
          </Badge>
          {nextPick && (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Next: {nextPick.pokemonName}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-0">
        {/* Budget Warnings */}
        {(budgetValidation.warnings.length > 0 || budgetValidation.suggestions.length > 0) && (
          <BudgetWarnings
            warnings={budgetValidation.warnings}
            suggestions={budgetValidation.suggestions}
            totalCost={budgetValidation.totalCost}
            remainingBudget={budgetValidation.remainingBudget}
            budgetEfficiency={budgetValidation.budgetEfficiency}
            className="mb-4"
            onApplySuggestion={(suggestion) => {
              // Handle suggestion application
              if (suggestion.type === 'remove' && suggestion.itemIds) {
                suggestion.itemIds.forEach(itemId => {
                  const item = userWishlist.find((w: WishlistItem) => w.id === itemId)
                  if (item) handleRemoveItem(item.pokemonId)
                })
              }
            }}
          />
        )}

        {userWishlist.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Heart className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1">No Pokémon in wishlist</p>
            <p className="text-xs">Click the ♡ on any Pokémon card to add them</p>
          </div>
        ) : (
          <ScrollArea className="h-64">
            <div className="space-y-2">
              {userWishlist.map((item: WishlistItem, index: number) => (
                <WishlistItemCard
                  key={item.id}
                  item={item}
                  index={index}
                  isNext={item.id === nextPick?.id}
                  isDragging={draggedItem?.id === item.id}
                  isDragOver={dragOverIndex === index}
                  onRemove={() => handleRemoveItem(item.pokemonId)}
                  onToggleAvailability={(available) =>
                    handleToggleAvailability(item.id, available)
                  }
                  onDragStart={(e) => handleDragStart(e, item, index)}
                  onDragEnd={handleDragEnd}
                  onDragEnter={(e) => handleDragEnter(e, index)}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Quick Actions */}
        {userWishlist.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => {
                  // Clear unavailable items
                  userWishlist.forEach((item: WishlistItem) => {
                    if (!item.isAvailable) {
                      handleRemoveItem(item.pokemonId)
                    }
                  })
                }}
                disabled={!userWishlist.some((item: WishlistItem) => !item.isAvailable)}
              >
                <X className="h-3 w-3 mr-1" />
                Clear Picked
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => {
                  // Clear all items
                  userWishlist.forEach((item: WishlistItem) => handleRemoveItem(item.pokemonId))
                }}
              >
                Clear All
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Individual wishlist item component
interface WishlistItemCardProps {
  item: WishlistItem
  index: number
  isNext: boolean
  isDragging?: boolean
  isDragOver?: boolean
  onRemove: () => void
  onToggleAvailability: (available: boolean) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

function WishlistItemCard({
  item,
  index,
  isNext,
  isDragging = false,
  isDragOver = false,
  onRemove,
  onToggleAvailability,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop
}: WishlistItemCardProps) {
  return (
    <div
      draggable
      className={cn(
        "relative flex items-center gap-3 p-2 rounded-lg border transition-all duration-200",
        "hover:shadow-md hover:scale-[1.02] cursor-move",
        isNext && "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700",
        !item.isAvailable && "opacity-75 bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700",
        item.isAvailable && !isNext && "bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700",
        isDragging && "opacity-50 scale-95 rotate-2 shadow-xl",
        isDragOver && "scale-105 border-purple-400 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/20"
      )}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Red X Overlay for Drafted Pokemon */}
      {!item.isAvailable && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-500/10 rounded-lg pointer-events-none">
          <div className="relative">
            <X className="h-12 w-12 text-red-500 opacity-40" strokeWidth={3} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold text-red-600 dark:text-red-400 bg-white/90 dark:bg-slate-900/90 px-2 py-0.5 rounded">
                PICKED
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Drag Handle */}
      <div className="cursor-move">
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>

      {/* Priority Number */}
      <div className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold z-10",
        isNext ? "bg-green-500 text-white" :
        !item.isAvailable ? "bg-red-500 text-white" :
        "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
      )}>
        {!item.isAvailable ? <X className="h-4 w-4" /> : index + 1}
      </div>

      {/* Pokemon Info */}
      <div className={cn(
        "flex-1 min-w-0",
        !item.isAvailable && "line-through opacity-60"
      )}>
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{item.pokemonName}</span>
          {isNext && <Crown className="h-3 w-3 text-yellow-500" />}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{item.cost} pts</span>
          {!item.isAvailable && (
            <Badge variant="destructive" className="text-xs px-1 py-0 font-bold">
              Already Picked
            </Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {!item.isAvailable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleAvailability(true)}
            className="h-6 w-6 p-0 text-green-600"
            title="Mark as available"
          >
            <Clock className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-6 w-6 p-0 text-red-600"
          title="Remove from wishlist"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}