/**
 * Pure lockout policy for PIN sign-in.
 *
 * The first few wrong attempts are free. From the threshold onward each
 * further wrong attempt locks sign-in for an exponentially longer window,
 * computed from the stored attempt count and timestamps so it survives app
 * restarts.
 */
export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60_000;

/** Lock duration that begins after `failedAttempts` wrong tries. Zero when unlocked. */
export function lockoutDelayMs(failedAttempts: number): number {
  if (failedAttempts < MAX_ATTEMPTS) return 0;
  const steps = failedAttempts - MAX_ATTEMPTS;
  const delay = BASE_DELAY_MS * 2 ** steps;
  return Math.min(delay, MAX_DELAY_MS);
}

/** Epoch ms until which sign-in is refused, or null when allowed now. */
export function nextLockoutUntil(failedAttempts: number, now: number): number | null {
  const delay = lockoutDelayMs(failedAttempts);
  return delay > 0 ? now + delay : null;
}

export function isLocked(lockedUntil: number | null | undefined, now: number): boolean {
  return typeof lockedUntil === 'number' && lockedUntil > now;
}

export function remainingLockMs(lockedUntil: number | null | undefined, now: number): number {
  if (typeof lockedUntil !== 'number') return 0;
  return Math.max(0, lockedUntil - now);
}

/** How many wrong tries remain before the first lock kicks in. */
export function attemptsBeforeLock(failedAttempts: number): number {
  return Math.max(0, MAX_ATTEMPTS - failedAttempts);
}
