'use client'

import React, { useState, useEffect } from 'react'
import { WishlistItem } from '@/types'
import WishlistManager from './WishlistManager'
import MobileWishlistSheet from './MobileWishlistSheet'
import { useWishlistSync } from '@/hooks/useWishlistSync'

interface ResponsiveWishlistInterfaceProps {
  draftId: string
  participantId: string
  userTeam?: any
  currentBudget?: number
  className?: string
}

export default function ResponsiveWishlistInterface({
  draftId,
  participantId,
  userTeam,
  currentBudget = 100,
  className
}: ResponsiveWishlistInterfaceProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false)

  // Real-time wishlist synchronization
  const {
    userWishlist,
    removeFromWishlist,
    reorderWishlist,
    isConnected
  } = useWishlistSync({
    draftId,
    participantId
  })

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768) // md breakpoint
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Calculate wishlist stats
  const totalCost = userWishlist.reduce((sum, item) => sum + item.cost, 0)
  const availableItems = userWishlist.filter(item => item.isAvailable)
  const nextPick = availableItems.length > 0 ? availableItems[0] : null

  const handleRemove = async (pokemonId: string) => {
    await removeFromWishlist(pokemonId)
  }

  const handleReorder = async (reorderedItems: WishlistItem[]) => {
    await reorderWishlist(reorderedItems)
  }

  if (isMobile) {
    return (
      <>
        {/* Mobile: Floating Action Button */}
        {!isMobileSheetOpen && (
          <div
            className="fixed bottom-4 right-4 z-40"
            onClick={() => setIsMobileSheetOpen(true)}
          >
            <div className="relative">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-blue-600 text-white rounded-full flex items-center justify-center shadow-xl border-2 border-white/20 active:scale-95 transition-transform cursor-pointer">
                <span className="text-xl">♡</span>
              </div>
              {userWishlist.length > 0 && (
                <div className="absolute -top-2 -right-2 bg-yellow-500 text-yellow-900 text-xs font-bold h-6 w-6 rounded-full flex items-center justify-center border-2 border-white">
                  {userWishlist.length}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile: Bottom Sheet */}
        <MobileWishlistSheet
          wishlist={userWishlist}
          isConnected={isConnected}
          totalCost={totalCost}
          currentBudget={currentBudget}
          nextPick={nextPick}
          isOpen={isMobileSheetOpen}
          onToggle={() => setIsMobileSheetOpen(!isMobileSheetOpen)}
          onRemove={handleRemove}
          onReorder={handleReorder}
          className={className}
        />

        {/* Mobile: Backdrop */}
        {isMobileSheetOpen && (
          <div
            className="fixed inset-0 bg-black/20 z-30"
            onClick={() => setIsMobileSheetOpen(false)}
          />
        )}
      </>
    )
  }

  // Desktop: Use original WishlistManager
  return (
    <WishlistManager
      draftId={draftId}
      participantId={participantId}
      userTeam={userTeam}
      currentBudget={currentBudget}
      className={className}
    />
  )
}