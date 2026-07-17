export interface PickTimerInput {
  turnStartedAt?: string
  timeLimitSeconds: number
  nowMs?: number
  serverClockOffsetMs?: number
}

export interface DeadlineTimerInput {
  deadline?: string | null
  nowMs?: number
  serverClockOffsetMs?: number
}

export function calculateDeadlineTimeRemaining({
  deadline,
  nowMs = Date.now(),
  serverClockOffsetMs = 0,
}: DeadlineTimerInput): number {
  if (!deadline) return 0
  const deadlineMs = new Date(deadline).getTime()
  if (!Number.isFinite(deadlineMs)) return 0
  return Math.max(0, Math.ceil((deadlineMs - (nowMs + serverClockOffsetMs)) / 1000))
}

/** Calculate the visible clock against estimated server time. */
export function calculatePickTimeRemaining({
  turnStartedAt,
  timeLimitSeconds,
  nowMs = Date.now(),
  serverClockOffsetMs = 0,
}: PickTimerInput): number {
  if (!turnStartedAt || timeLimitSeconds <= 0) return 0

  const startedAtMs = new Date(turnStartedAt).getTime()
  if (!Number.isFinite(startedAtMs)) return 0

  return calculateDeadlineTimeRemaining({
    deadline: new Date(startedAtMs + (timeLimitSeconds * 1000)).toISOString(),
    nowMs,
    serverClockOffsetMs,
  })
}

/** Estimate clock offset while accounting for round-trip request latency. */
export function estimateServerClockOffset(
  requestStartedAtMs: number,
  responseReceivedAtMs: number,
  serverTimeMs: number,
): number {
  const localMidpoint = requestStartedAtMs + ((responseReceivedAtMs - requestStartedAtMs) / 2)
  return serverTimeMs - localMidpoint
}
