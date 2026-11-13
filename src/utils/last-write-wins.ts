/** Tolerated clock drift of a client before its date is considered in the future. */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

/**
 * A client date in the future (misconfigured device clock) is brought back to
 * the reception time, so it cannot block the entity for later writes.
 */
export function clampFutureDate(date: Date, now: Date = new Date()): Date {
  return date.getTime() > now.getTime() + FUTURE_TOLERANCE_MS ? now : date
}

/**
 * - `apply`: the incoming write is more recent (or the entity is new): store it;
 * - `unchanged`: same `updatedAt`, already applied (idempotent replay);
 * - `conflict`: the server version is more recent: ignore the write.
 */
export type LwwDecision = 'apply' | 'unchanged' | 'conflict'

export function resolveLastWriteWins(
  incomingUpdatedAt: Date,
  storedUpdatedAt: Date | null,
): LwwDecision {
  if (storedUpdatedAt === null) return 'apply'
  const incoming = incomingUpdatedAt.getTime()
  const stored = storedUpdatedAt.getTime()
  if (incoming > stored) return 'apply'
  return incoming === stored ? 'unchanged' : 'conflict'
}
