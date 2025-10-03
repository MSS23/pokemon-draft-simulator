/**
 * Utility functions for room management
 * Centralizes room code generation to avoid duplication
 */

export const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const ROOM_CODE_LENGTH = 6

/**
 * Generate a random room code
 * @param length - Length of the room code (default: 6)
 * @returns Random room code string
 */
export function generateRoomCode(length: number = ROOM_CODE_LENGTH): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += ROOM_CODE_CHARS.charAt(Math.floor(Math.random() * ROOM_CODE_CHARS.length))
  }
  return result
}

/**
 * Validate room code format
 * @param code - Room code to validate
 * @returns True if valid format
 */
export function isValidRoomCode(code: string): boolean {
  if (!code || code.length !== ROOM_CODE_LENGTH) return false
  return /^[A-Z0-9]+$/.test(code.toUpperCase())
}

/**
 * Normalize room code to uppercase
 * @param code - Room code to normalize
 * @returns Normalized room code
 */
export function normalizeRoomCode(code: string): string {
  return code.toUpperCase().trim()
}
