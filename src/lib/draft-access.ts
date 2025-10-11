/**
 * Draft Access Control
 * Manages which drafts a user has verified access to
 * Prevents unauthorized access to private/password-protected drafts
 */

const STORAGE_KEY = 'verified_draft_access'

export interface DraftAccess {
  roomCode: string
  accessedAt: number
  isHost: boolean
}

/**
 * Get all verified draft accesses for the current user
 */
export function getVerifiedDrafts(): DraftAccess[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []

    const drafts: DraftAccess[] = JSON.parse(stored)

    // Filter out expired accesses (older than 24 hours)
    const now = Date.now()
    const validDrafts = drafts.filter(draft => {
      const hoursSinceAccess = (now - draft.accessedAt) / (1000 * 60 * 60)
      return hoursSinceAccess < 24
    })

    // Update storage with only valid drafts
    if (validDrafts.length !== drafts.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validDrafts))
    }

    return validDrafts
  } catch (error) {
    console.error('Error reading draft access:', error)
    return []
  }
}

/**
 * Check if user has verified access to a specific draft
 */
export function hasVerifiedAccess(roomCode: string): boolean {
  const verifiedDrafts = getVerifiedDrafts()
  return verifiedDrafts.some(draft =>
    draft.roomCode.toLowerCase() === roomCode.toLowerCase()
  )
}

/**
 * Grant access to a draft (after password verification or joining)
 */
export function grantDraftAccess(roomCode: string, isHost: boolean = false): void {
  if (typeof window === 'undefined') return

  try {
    const verifiedDrafts = getVerifiedDrafts()

    // Remove existing access for this draft if present
    const filtered = verifiedDrafts.filter(
      draft => draft.roomCode.toLowerCase() !== roomCode.toLowerCase()
    )

    // Add new access
    filtered.push({
      roomCode: roomCode.toLowerCase(),
      accessedAt: Date.now(),
      isHost
    })

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch (error) {
    console.error('Error granting draft access:', error)
  }
}

/**
 * Revoke access to a draft
 */
export function revokeDraftAccess(roomCode: string): void {
  if (typeof window === 'undefined') return

  try {
    const verifiedDrafts = getVerifiedDrafts()
    const filtered = verifiedDrafts.filter(
      draft => draft.roomCode.toLowerCase() !== roomCode.toLowerCase()
    )

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch (error) {
    console.error('Error revoking draft access:', error)
  }
}

/**
 * Clear all draft accesses
 */
export function clearAllDraftAccess(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Error clearing draft access:', error)
  }
}
