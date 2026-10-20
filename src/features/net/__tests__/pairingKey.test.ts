import {
  createPairingGuard,
  PAIR_FAILURE_LIMIT,
  PAIR_LOCKOUT_MS,
  PAIRING_KEY_TTL_MS,
} from '../pairingKey';

jest.mock('../tokens', () => {
  let n = 0;
  return { generatePairingKey: async () => `KEY-${n++}` };
});

describe('pairing key guard', () => {
  let clock = 1_700_000_000_000;
  const now = () => clock;

  beforeEach(() => {
    clock = 1_700_000_000_000;
  });

  it('issues a fresh key that stays valid for ten minutes', async () => {
    const guard = createPairingGuard(now);
    const state = await guard.issue();
    expect(state.key).toMatch(/^KEY-/);
    expect(state.used).toBe(false);
    expect(state.expiresAt).toBe(clock + PAIRING_KEY_TTL_MS);
    expect(guard.currentKey()).toBe(state.key);

    clock += PAIRING_KEY_TTL_MS - 1;
    expect(guard.currentKey()).toBe(state.key);

    clock += 1;
    expect(guard.currentKey()).toBeNull();
  });

  it('retires the key after one successful pairing', async () => {
    const guard = createPairingGuard(now);
    const first = await guard.issue();
    expect(guard.currentKey()).toBe(first.key);

    const after = guard.noteSuccess();
    expect(after.used).toBe(true);
    expect(guard.currentKey()).toBeNull();

    const next = await guard.issue();
    expect(next.key).not.toBe(first.key);
    expect(guard.currentKey()).toBe(next.key);
  });

  it('locks pairing for a minute after five wrong keys', async () => {
    const guard = createPairingGuard(now);
    await guard.issue();

    for (let attempt = 1; attempt < PAIR_FAILURE_LIMIT; attempt += 1) {
      const state = guard.noteFailure();
      expect(state.lockedUntil).toBeNull();
      expect(guard.lock().locked).toBe(false);
    }

    const locked = guard.noteFailure();
    expect(locked.lockedUntil).toBe(clock + PAIR_LOCKOUT_MS);
    expect(guard.lock()).toEqual({ locked: true, retryAfterMs: PAIR_LOCKOUT_MS });

    // Even the correct key is refused while the pause is on.
    clock += PAIR_LOCKOUT_MS - 1;
    expect(guard.lock().locked).toBe(true);

    clock += 1;
    expect(guard.lock()).toEqual({ locked: false, retryAfterMs: 0 });
    expect(guard.currentKey()).toBe(locked.key);
  });

  it('clears the key and the counters when hosting stops', async () => {
    const guard = createPairingGuard(now);
    await guard.issue();
    guard.noteFailure();
    guard.noteFailure();

    const cleared = guard.clear();
    expect(cleared).toEqual({ key: null, expiresAt: null, used: false, lockedUntil: null });
    expect(guard.currentKey()).toBeNull();
    expect(guard.lock().locked).toBe(false);

    // A new session starts with a clean slate, not two strikes.
    const fresh = await guard.issue();
    for (let attempt = 1; attempt < PAIR_FAILURE_LIMIT; attempt += 1) {
      expect(guard.noteFailure().lockedUntil).toBeNull();
    }
    expect(fresh.key).not.toBeNull();
  });
});
