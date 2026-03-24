'use client'

import React, { useState } from 'react'
import { WishlistItem } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Heart,
  X,
  GripVertical,
  Crown,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import {
  useDragAndDrop,
  DndContext,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@/hooks/useDragAndDrop'
import { CSS } from '@dnd-kit/utilities'
import { useWishlistSync } from '@/hooks/useWishlistSync'
import { useBudgetValidation } from '@/hooks/useBudgetValidation'
import BudgetWarnings from './BudgetWarnings'

interface WishlistManagerProps {
  draftId: string
  participantId: string
  userTeam?: { id: string; name: string; picks: string[]; budget_remaining?: number } | null
  currentBudget?: number
  usedBudget?: number
  className?: string
  isCompact?: boolean
}

export default function WishlistManager({
  draftId,
  participantId,
  userTeam: _userTeam,
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
    isConnected: _isConnected
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
  const availableItems = budgetValidation.affordableItems
  const nextPick = availableItems.length > 0 ? availableItems[0] : null
  const isOverBudget = budgetValidation.isOverBudget

  const handleRemoveItem = async (pokemonId: string) => {
    await removeFromWishlist(pokemonId)
  }

  const handleToggleAvailability = (_itemId: string, _isAvailable: boolean) => {
    // Handled automatically by real-time sync when Pokemon are drafted
  }

  // Drag and drop functionality via dnd-kit
  const {
    sensors,
    itemIds,
    handleDragStart,
    handleDragEnd,
    collisionDetection,
    activeId,
  } = useDragAndDrop<WishlistItem>({
    items: userWishlist,
    onReorder: (reorderedItems) => {
      reorderWishlistItems(reorderedItems)
    }
  })

  // Collapsed state - just a clickable bar
  if (isCompact && !isExpanded) {
    return (
      <div
        className={cn(
          "bg-card rounded-lg border shadow-sm cursor-pointer hover:bg-muted/50 transition-colors",
          className
        )}
        onClick={() => setIsExpanded(true)}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <Heart className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Wishlist</span>
            {userWishlist.length > 0 && (
              <Badge variant="secondary" className="text-xs h-5 px-1.5">
                {userWishlist.length}
              </Badge>
            )}
            {nextPick && (
              <span className="text-xs text-muted-foreground">
                Next: <span className="font-medium text-foreground capitalize">{nextPick.pokemonName}</span>
              </span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <Card className={cn(
      "bg-card border shadow-sm",
      className
    )}>
      <CardHeader className="px-4 py-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Heart className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Wishlist</CardTitle>
            <span className="text-xs text-muted-foreground tabular-nums">
              {userWishlist.length} items
            </span>
            {isOverBudget && (
              <Badge variant="destructive" size="sm" className="h-4 flex items-center gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />
                Over budget
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {userWishlist.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => {
                    userWishlist.forEach((item: WishlistItem) => {
                      if (!item.isAvailable) handleRemoveItem(item.pokemonId)
                    })
                  }}
                  disabled={!userWishlist.some((item: WishlistItem) => !item.isAvailable)}
                >
                  Clear Picked
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => {
                    userWishlist.forEach((item: WishlistItem) => handleRemoveItem(item.pokemonId))
                  }}
                >
                  Clear All
                </Button>
              </>
            )}
            {isCompact && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded(false)}
                className="h-7 w-7"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 pt-0">
        {/* Budget Warnings */}
        {(budgetValidation.warnings.length > 0 || budgetValidation.suggestions.length > 0) && (
          <BudgetWarnings
            warnings={budgetValidation.warnings}
            suggestions={budgetValidation.suggestions}
            totalCost={budgetValidation.totalCost}
            remainingBudget={budgetValidation.remainingBudget}
            budgetEfficiency={budgetValidation.budgetEfficiency}
            className="mb-3"
            onApplySuggestion={(suggestion) => {
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
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">No Pokemon in wishlist</p>
            <p className="text-xs mt-0.5">Click the heart on any Pokemon card to add them</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {userWishlist.map((item: WishlistItem, index: number) => (
                  <SortableWishlistItemCard
                    key={item.id}
                    item={item}
                    index={index}
                    isNext={item.id === nextPick?.id}
                    isDragging={activeId === item.id}
                    onRemove={() => handleRemoveItem(item.pokemonId)}
                    onToggleAvailability={(available) =>
                      handleToggleAvailability(item.id, available)
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  )
}

// Sortable wrapper for individual wishlist items
interface SortableWishlistItemCardProps {
  item: WishlistItem
  index: number
  isNext: boolean
  isDragging?: boolean
  onRemove: () => void
  onToggleAvailability: (available: boolean) => void
}

function SortableWishlistItemCard({
  item,
  index,
  isNext,
  isDragging = false,
  onRemove,
  onToggleAvailability,
}: SortableWishlistItemCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: item.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const dragging = isDragging || isSortableDragging

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex items-center gap-3 p-2 rounded-lg border transition-all duration-200",
        "hover:shadow-md hover:scale-[1.02]",
        isNext && "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700",
        !item.isAvailable && "opacity-75 bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700",
        item.isAvailable && !isNext && "bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700",
        dragging && "opacity-50 scale-95 shadow-xl z-50",
      )}
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

      {/* Drag Handle - only this element activates drag */}
      <button
        className="cursor-grab active:cursor-grabbing touch-none"
        aria-label={`Reorder ${item.pokemonName}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-gray-400" />
      </button>

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
