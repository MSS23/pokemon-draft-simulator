/**
 * Draft Error Codes
 * Standardized error codes for all draft operations
 */
export enum DraftErrorCode {
  // Draft State Errors
  DRAFT_NOT_FOUND = 'DRAFT_NOT_FOUND',
  DRAFT_NOT_ACTIVE = 'DRAFT_NOT_ACTIVE',
  DRAFT_ALREADY_STARTED = 'DRAFT_ALREADY_STARTED',
  DRAFT_COMPLETED = 'DRAFT_COMPLETED',
  DRAFT_PAUSED = 'DRAFT_PAUSED',
  INVALID_DRAFT_STATE = 'INVALID_DRAFT_STATE',

  // Turn/Pick Errors
  NOT_YOUR_TURN = 'NOT_YOUR_TURN',
  WRONG_TURN = 'WRONG_TURN',
  TURN_EXPIRED = 'TURN_EXPIRED',
  PICK_ALREADY_MADE = 'PICK_ALREADY_MADE',
  MAX_PICKS_REACHED = 'MAX_PICKS_REACHED',
  INVALID_TURN = 'INVALID_TURN',

  // Team/User Errors
  TEAM_NOT_FOUND = 'TEAM_NOT_FOUND',
  USER_NOT_IN_DRAFT = 'USER_NOT_IN_DRAFT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  HOST_ONLY = 'HOST_ONLY',
  DUPLICATE_TEAM_NAME = 'DUPLICATE_TEAM_NAME',

  // Budget Errors
  INSUFFICIENT_BUDGET = 'INSUFFICIENT_BUDGET',
  INVALID_BUDGET = 'INVALID_BUDGET',
  BUDGET_NEGATIVE = 'BUDGET_NEGATIVE',

  // Pokemon Errors
  POKEMON_NOT_LEGAL = 'POKEMON_NOT_LEGAL',
  POKEMON_ALREADY_DRAFTED = 'POKEMON_ALREADY_DRAFTED',
  POKEMON_NOT_FOUND = 'POKEMON_NOT_FOUND',
  INVALID_POKEMON_COST = 'INVALID_POKEMON_COST',

  // Auction Errors
  AUCTION_NOT_FOUND = 'AUCTION_NOT_FOUND',
  AUCTION_NOT_ACTIVE = 'AUCTION_NOT_ACTIVE',
  AUCTION_EXPIRED = 'AUCTION_EXPIRED',
  BID_TOO_LOW = 'BID_TOO_LOW',
  CANNOT_NOMINATE = 'CANNOT_NOMINATE',
  ACTIVE_AUCTION_EXISTS = 'ACTIVE_AUCTION_EXISTS',

  // Validation Errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // System Errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  SUPABASE_NOT_AVAILABLE = 'SUPABASE_NOT_AVAILABLE',

  // Feature Errors
  UNDO_NOT_ENABLED = 'UNDO_NOT_ENABLED',
  UNDO_NO_PICKS = 'UNDO_NO_PICKS',
  UNDO_NOT_RECENT = 'UNDO_NOT_RECENT',
  PAUSE_NOT_ALLOWED = 'PAUSE_NOT_ALLOWED',
  RESUME_NOT_ALLOWED = 'RESUME_NOT_ALLOWED',
}

/**
 * Structured error context for debugging
 */
export interface DraftErrorContext {
  draftId?: string
  userId?: string
  teamId?: string
  pokemonId?: string
  auctionId?: string
  currentTurn?: number
  expectedTurn?: number
  budgetRequired?: number
  budgetAvailable?: number
  [key: string]: any
}

/**
 * Custom error class for draft operations
 * Provides structured error handling with codes and context
 */
export class DraftError extends Error {
  public readonly code: DraftErrorCode
  public readonly context: DraftErrorContext
  public readonly timestamp: string
  public readonly isOperational: boolean

  constructor(
    message: string,
    code: DraftErrorCode = DraftErrorCode.UNKNOWN_ERROR,
    context: DraftErrorContext = {},
    isOperational: boolean = true
  ) {
    super(message)
    this.name = 'DraftError'
    this.code = code
    this.context = context
    this.timestamp = new Date().toISOString()
    this.isOperational = isOperational

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DraftError)
    }
  }

  /**
   * Convert error to JSON for logging/API responses
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    }
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    return getUserFriendlyMessage(this.code, this.message, this.context)
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    const retryableCodes = [
      DraftErrorCode.NETWORK_ERROR,
      DraftErrorCode.DATABASE_ERROR,
      DraftErrorCode.SUPABASE_NOT_AVAILABLE
    ]
    return retryableCodes.includes(this.code)
  }

  /**
   * Check if error should be reported to error tracking
   */
  shouldReport(): boolean {
    const nonReportableCodes = [
      DraftErrorCode.NOT_YOUR_TURN,
      DraftErrorCode.INSUFFICIENT_BUDGET,
      DraftErrorCode.POKEMON_ALREADY_DRAFTED,
      DraftErrorCode.VALIDATION_FAILED,
      DraftErrorCode.INVALID_INPUT
    ]
    return !nonReportableCodes.includes(this.code) && !this.isOperational
  }
}

/**
 * Get user-friendly error messages
 */
function getUserFriendlyMessage(
  code: DraftErrorCode,
  originalMessage: string,
  context: DraftErrorContext
): string {
  const messages: Record<DraftErrorCode, string> = {
    // Draft State
    [DraftErrorCode.DRAFT_NOT_FOUND]: 'Draft room not found. Please check the room code.',
    [DraftErrorCode.DRAFT_NOT_ACTIVE]: 'This draft is not currently active.',
    [DraftErrorCode.DRAFT_ALREADY_STARTED]: 'This draft has already started.',
    [DraftErrorCode.DRAFT_COMPLETED]: 'This draft has already been completed.',
    [DraftErrorCode.DRAFT_PAUSED]: 'This draft is currently paused.',
    [DraftErrorCode.INVALID_DRAFT_STATE]: 'Draft is in an invalid state.',

    // Turn/Pick
    [DraftErrorCode.NOT_YOUR_TURN]: `It's not your turn. Wait for ${context.currentTeamName || 'the current team'} to pick.`,
    [DraftErrorCode.WRONG_TURN]: `It's ${context.currentTeamName || 'another team'}'s turn to pick.`,
    [DraftErrorCode.TURN_EXPIRED]: 'Your turn has expired. The draft has moved on.',
    [DraftErrorCode.PICK_ALREADY_MADE]: 'This pick has already been made.',
    [DraftErrorCode.MAX_PICKS_REACHED]: `You've reached the maximum number of picks (${context.maxPicks || 'limit'}).`,
    [DraftErrorCode.INVALID_TURN]: 'Invalid turn number.',

    // Team/User
    [DraftErrorCode.TEAM_NOT_FOUND]: 'Team not found in this draft.',
    [DraftErrorCode.USER_NOT_IN_DRAFT]: 'You are not participating in this draft.',
    [DraftErrorCode.UNAUTHORIZED]: 'You do not have permission to perform this action.',
    [DraftErrorCode.HOST_ONLY]: 'Only the draft host can perform this action.',
    [DraftErrorCode.DUPLICATE_TEAM_NAME]: `Team name "${context.teamName}" is already taken.`,

    // Budget
    [DraftErrorCode.INSUFFICIENT_BUDGET]: `Insufficient budget. You need ${context.budgetRequired} points but only have ${context.budgetAvailable} remaining.`,
    [DraftErrorCode.INVALID_BUDGET]: 'Invalid budget amount.',
    [DraftErrorCode.BUDGET_NEGATIVE]: 'Budget cannot be negative.',

    // Pokemon
    [DraftErrorCode.POKEMON_NOT_LEGAL]: `${context.pokemonName || 'This Pokemon'} is not legal in this format.`,
    [DraftErrorCode.POKEMON_ALREADY_DRAFTED]: `${context.pokemonName || 'This Pokemon'} has already been drafted.`,
    [DraftErrorCode.POKEMON_NOT_FOUND]: 'Pokemon not found.',
    [DraftErrorCode.INVALID_POKEMON_COST]: 'Invalid Pokemon cost.',

    // Auction
    [DraftErrorCode.AUCTION_NOT_FOUND]: 'Auction not found.',
    [DraftErrorCode.AUCTION_NOT_ACTIVE]: 'This auction is not currently active.',
    [DraftErrorCode.AUCTION_EXPIRED]: 'This auction has expired.',
    [DraftErrorCode.BID_TOO_LOW]: `Bid must be higher than the current bid of ${context.currentBid || 0}.`,
    [DraftErrorCode.CANNOT_NOMINATE]: 'You cannot nominate a Pokemon right now.',
    [DraftErrorCode.ACTIVE_AUCTION_EXISTS]: 'There is already an active auction. Wait for it to complete.',

    // Validation
    [DraftErrorCode.VALIDATION_FAILED]: originalMessage || 'Validation failed.',
    [DraftErrorCode.INVALID_INPUT]: 'Invalid input provided.',
    [DraftErrorCode.MISSING_REQUIRED_FIELD]: 'Required field is missing.',

    // System
    [DraftErrorCode.DATABASE_ERROR]: 'Database error occurred. Please try again.',
    [DraftErrorCode.NETWORK_ERROR]: 'Network error. Please check your connection.',
    [DraftErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred.',
    [DraftErrorCode.SUPABASE_NOT_AVAILABLE]: 'Database connection is unavailable.',

    // Features
    [DraftErrorCode.UNDO_NOT_ENABLED]: 'Undo is not enabled for this draft.',
    [DraftErrorCode.UNDO_NO_PICKS]: 'No picks to undo.',
    [DraftErrorCode.UNDO_NOT_RECENT]: 'Can only undo the most recent pick.',
    [DraftErrorCode.PAUSE_NOT_ALLOWED]: 'Draft cannot be paused in its current state.',
    [DraftErrorCode.RESUME_NOT_ALLOWED]: 'Draft cannot be resumed.'
  }

  return messages[code] || originalMessage || 'An error occurred.'
}

/**
 * Factory functions for common errors
 */
export const DraftErrors = {
  draftNotFound: (draftId: string) =>
    new DraftError(
      'Draft not found',
      DraftErrorCode.DRAFT_NOT_FOUND,
      { draftId }
    ),

  draftNotActive: (draftId: string, currentStatus: string) =>
    new DraftError(
      `Draft is ${currentStatus}, not active`,
      DraftErrorCode.DRAFT_NOT_ACTIVE,
      { draftId, currentStatus }
    ),

  notYourTurn: (userId: string, currentTeamId: string, currentTeamName: string) =>
    new DraftError(
      `It's ${currentTeamName}'s turn`,
      DraftErrorCode.NOT_YOUR_TURN,
      { userId, currentTeamId, currentTeamName }
    ),

  insufficientBudget: (budgetRequired: number, budgetAvailable: number, teamId: string) =>
    new DraftError(
      `Insufficient budget: need ${budgetRequired}, have ${budgetAvailable}`,
      DraftErrorCode.INSUFFICIENT_BUDGET,
      { budgetRequired, budgetAvailable, teamId }
    ),

  pokemonNotLegal: (pokemonId: string, pokemonName: string, reason: string) =>
    new DraftError(
      `${pokemonName} is not legal: ${reason}`,
      DraftErrorCode.POKEMON_NOT_LEGAL,
      { pokemonId, pokemonName, reason }
    ),

  maxPicksReached: (teamId: string, maxPicks: number) =>
    new DraftError(
      `Team has reached maximum picks (${maxPicks})`,
      DraftErrorCode.MAX_PICKS_REACHED,
      { teamId, maxPicks }
    ),

  hostOnly: (userId: string, action: string) =>
    new DraftError(
      `Only the host can ${action}`,
      DraftErrorCode.HOST_ONLY,
      { userId, action }
    ),

  undoNotEnabled: (draftId: string) =>
    new DraftError(
      'Undo is not enabled for this draft',
      DraftErrorCode.UNDO_NOT_ENABLED,
      { draftId }
    ),

  auctionNotActive: (auctionId: string) =>
    new DraftError(
      'Auction is not active',
      DraftErrorCode.AUCTION_NOT_ACTIVE,
      { auctionId }
    ),

  bidTooLow: (bidAmount: number, currentBid: number, auctionId: string) =>
    new DraftError(
      `Bid of ${bidAmount} is too low (current: ${currentBid})`,
      DraftErrorCode.BID_TOO_LOW,
      { bidAmount, currentBid, auctionId }
    ),

  supabaseNotAvailable: () =>
    new DraftError(
      'Supabase is not configured',
      DraftErrorCode.SUPABASE_NOT_AVAILABLE,
      {},
      false
    )
}

/**
 * Type guard to check if an error is a DraftError
 */
export function isDraftError(error: any): error is DraftError {
  return error instanceof DraftError
}

/**
 * Convert any error to DraftError
 */
export function toDraftError(error: any): DraftError {
  if (isDraftError(error)) {
    return error
  }

  if (error instanceof Error) {
    return new DraftError(
      error.message,
      DraftErrorCode.UNKNOWN_ERROR,
      { originalError: error.name },
      false
    )
  }

  return new DraftError(
    String(error),
    DraftErrorCode.UNKNOWN_ERROR,
    {},
    false
  )
}
