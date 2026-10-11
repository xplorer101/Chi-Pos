import {
  attemptsBeforeLock,
  isLocked,
  lockoutDelayMs,
  MAX_ATTEMPTS,
  nextLockoutUntil,
  remainingLockMs,
} from '../lockout';

describe('lockoutDelayMs', () => {
  it('is zero before the threshold is reached', () => {
    expect(lockoutDelayMs(0)).toBe(0);
    expect(lockoutDelayMs(MAX_ATTEMPTS - 1)).toBe(0);
  });

  it('starts at 30s at the threshold and doubles', () => {
    expect(lockoutDelayMs(MAX_ATTEMPTS)).toBe(30_000);
    expect(lockoutDelayMs(MAX_ATTEMPTS + 1)).toBe(60_000);
    expect(lockoutDelayMs(MAX_ATTEMPTS + 2)).toBe(120_000);
  });

  it('caps at 15 minutes', () => {
    expect(lockoutDelayMs(MAX_ATTEMPTS + 10)).toBe(15 * 60_000);
    expect(lockoutDelayMs(999)).toBe(15 * 60_000);
  });
});

describe('nextLockoutUntil', () => {
  it('returns null when allowed now, else now + delay', () => {
    expect(nextLockoutUntil(0, 1000)).toBeNull();
    expect(nextLockoutUntil(MAX_ATTEMPTS, 1000)).toBe(1_000 + 30_000);
  });
});

describe('isLocked / remainingLockMs', () => {
  it('locks only while the window is in the future', () => {
    expect(isLocked(2_000, 1_000)).toBe(true);
    expect(isLocked(1_000, 1_000)).toBe(false);
    expect(isLocked(500, 1_000)).toBe(false);
    expect(isLocked(null, 1_000)).toBe(false);
    expect(isLocked(undefined, 1_000)).toBe(false);
  });

  it('reports remaining time, floored at zero', () => {
    expect(remainingLockMs(2_000, 1_000)).toBe(1_000);
    expect(remainingLockMs(0, 1_000)).toBe(0);
    expect(remainingLockMs(null, 1_000)).toBe(0);
    expect(remainingLockMs(undefined, 1_000)).toBe(0);
  });
});

describe('attemptsBeforeLock', () => {
  it('counts down from the threshold', () => {
    expect(attemptsBeforeLock(0)).toBe(MAX_ATTEMPTS);
    expect(attemptsBeforeLock(2)).toBe(3);
    expect(attemptsBeforeLock(MAX_ATTEMPTS)).toBe(0);
    expect(attemptsBeforeLock(10)).toBe(0);
  });
});