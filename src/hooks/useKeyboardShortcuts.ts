import { useEffect, useCallback } from 'react'

export interface KeyboardShortcutConfig {
  onSearchFocus?: () => void
  onWishlistToggle?: () => void
  onActivityHistoryToggle?: () => void
  onCloseModals?: () => void
  onAutoPickFromWishlist?: () => void
  onShowHelp?: () => void
  isUserTurn?: boolean
  enabled?: boolean
}

/**
 * Custom hook for managing keyboard shortcuts in draft view
 *
 * Shortcuts:
 * - Ctrl/Cmd + F: Focus search
 * - Ctrl/Cmd + W: Toggle wishlist
 * - Ctrl/Cmd + H: Toggle activity history
 * - Escape: Close all modals
 * - Space: Auto-pick from wishlist (only on user's turn)
 * - Ctrl/Cmd + ?: Show help overlay
 */
export function useKeyboardShortcuts({
  onSearchFocus,
  onWishlistToggle,
  onActivityHistoryToggle,
  onCloseModals,
  onAutoPickFromWishlist,
  onShowHelp,
  isUserTurn = false,
  enabled = true
}: KeyboardShortcutConfig) {
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs/textareas
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Allow Escape to blur inputs
      if (e.key === 'Escape') {
        target.blur()
        onCloseModals?.()
      }
      return
    }

    const isMod = e.ctrlKey || e.metaKey

    // Ctrl/Cmd + F - Focus search
    if (isMod && e.key === 'f') {
      e.preventDefault()
      onSearchFocus?.()
      const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]')
      if (searchInput) {
        searchInput.focus()
        searchInput.select()
      }
      return
    }

    // Ctrl/Cmd + W - Toggle wishlist
    if (isMod && e.key === 'w') {
      e.preventDefault()
      onWishlistToggle?.()
      return
    }

    // Ctrl/Cmd + H - Toggle activity history
    if (isMod && e.key === 'h') {
      e.preventDefault()
      onActivityHistoryToggle?.()
      return
    }

    // Ctrl/Cmd + ? - Show help
    if (isMod && e.key === '?') {
      e.preventDefault()
      onShowHelp?.()
      return
    }

    // Escape - Close modals
    if (e.key === 'Escape') {
      onCloseModals?.()
      return
    }

    // Space - Auto-pick from wishlist (only on user's turn)
    if (e.key === ' ' && isUserTurn) {
      e.preventDefault()
      onAutoPickFromWishlist?.()
      return
    }
  }, [
    onSearchFocus,
    onWishlistToggle,
    onActivityHistoryToggle,
    onCloseModals,
    onAutoPickFromWishlist,
    onShowHelp,
    isUserTurn
  ])

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [handleKeyPress, enabled])

  return {
    // Return shortcuts list for help display
    shortcuts: [
      { key: 'Ctrl/Cmd + F', description: 'Focus search', enabled: true },
      { key: 'Ctrl/Cmd + W', description: 'Toggle wishlist', enabled: true },
      { key: 'Ctrl/Cmd + H', description: 'Toggle activity history', enabled: true },
      { key: 'Ctrl/Cmd + ?', description: 'Show this help', enabled: true },
      { key: 'Escape', description: 'Close modals', enabled: true },
      { key: 'Space', description: 'Auto-pick from wishlist', enabled: isUserTurn }
    ]
  }
}
