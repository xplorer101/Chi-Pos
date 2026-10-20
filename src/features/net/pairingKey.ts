import { isLocked, remainingLockMs } from '@/lib/lockout';

import { generatePairingKey } from './tokens';

/** A pairing key is only good for ten minutes and a single approval. */
export const PAIRING_KEY_TTL_MS = 10 * 60_000;
/** Wrong-key attempts before pairing is paused for a while. */
export const PAIR_FAILURE_LIMIT = 5;
export const PAIR_LOCKOUT_MS = 60_000;

export type PairingKeyState = {
  key: string | null;
  expiresAt: number | null;
  used: boolean;
  lockedUntil: number | null;
};

export type PairingGuard = {
  /** Mint a fresh key: unused, unexpired, counters cleared. */
  issue: () => Promise<PairingKeyState>;
  /** The key the host should accept right now, or null when it is spent. */
  currentKey: () => string | null;
  /** Brute-force state, checked before a key is even compared. */
  lock: () => { locked: boolean; retryAfterMs: number };
  /** Record a wrong key; five in a row pause pairing for a minute. */
  noteFailure: () => PairingKeyState;
  /** The key was accepted: retire it and clear the counters. */
  noteSuccess: () => PairingKeyState;
  /** Hosting stopped. */
  clear: () => PairingKeyState;
};

/**
 * The whole lifecycle of the key shown in the host QR, kept out of the store so
 * it can be exercised with a fake clock. A key is single-use by design: one
 * phone pairs per key, so a screenshot of the QR is worth very little.
 */
export function createPairingGuard(now: () => number = Date.now): PairingGuard {
  let key: string | null = null;
  let expiresAt: number | null = null;
  let used = false;
  let failures = 0;
  let lockedUntil: number | null = null;

  const state = (): PairingKeyState => ({ key, expiresAt, used, lockedUntil });

  const lock = () => {
    const at = now();
    if (lockedUntil !== null && !isLocked(lockedUntil, at)) {
      // The pause is over; start counting again from zero.
      lockedUntil = null;
      failures = 0;
    }
    return { locked: isLocked(lockedUntil, at), retryAfterMs: remainingLockMs(lockedUntil, at) };
  };

  return {
    issue: async () => {
      key = await generatePairingKey();
      expiresAt = now() + PAIRING_KEY_TTL_MS;
      used = false;
      failures = 0;
      lockedUntil = null;
      return state();
    },

    currentKey: () => {
      if (!key || used) return null;
      if (expiresAt !== null && expiresAt <= now()) return null;
      return key;
    },

    lock,

    noteFailure: () => {
      failures += 1;
      if (failures >= PAIR_FAILURE_LIMIT) lockedUntil = now() + PAIR_LOCKOUT_MS;
      return state();
    },

    noteSuccess: () => {
      used = true;
      failures = 0;
      lockedUntil = null;
      return state();
    },

    clear: () => {
      key = null;
      expiresAt = null;
      used = false;
      failures = 0;
      lockedUntil = null;
      return state();
    },
  };
}
