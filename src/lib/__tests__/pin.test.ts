/* eslint-disable import/first */
import { createHash as mockCreateHash, randomBytes as mockRandomBytes } from 'crypto';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_algorithm: unknown, data: string) =>
    mockCreateHash('sha256').update(data).digest('hex'),
  ),
  getRandomBytesAsync: jest.fn(async (length: number) =>
    new Uint8Array(mockRandomBytes(length)),
  ),
}));

import {
  generateRecoveryCode,
  generateSalt,
  hashPin,
  hashRecoveryCode,
  isValidPin,
  normalizeRecoveryCode,
  verifyPin,
  verifyRecoveryCode,
} from '../pin';

function digestHex(data: string): string {
  return mockCreateHash('sha256').update(data).digest('hex');
}

describe('isValidPin', () => {
  it('accepts 4 to 6 digit PINs', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('000000')).toBe(true);
  });

  it('rejects non-digits and wrong lengths', () => {
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('')).toBe(false);
  });
});

describe('hashPin / verifyPin', () => {
  it('produces a salted 64-hex digest', async () => {
    const salt = await generateSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    const hash = await hashPin('1234', salt);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs across salts for the same PIN', async () => {
    const a = await hashPin('1234', await generateSalt());
    const b = await hashPin('1234', await generateSalt());
    expect(a).not.toBe(b);
  });

  it('matches the pepper+value digest shape', async () => {
    const salt = 'a'.repeat(32);
    const hash = await hashPin('4321', salt);
    expect(hash).toBe(digestHex('shoppos.v2:' + salt + ':4321'));
  });

  it('verifies correct and wrong PINs', async () => {
    const salt = await generateSalt();
    const hash = await hashPin('7777', salt);
    expect(await verifyPin('7777', hash, salt)).toBe(true);
    expect(await verifyPin('7778', hash, salt)).toBe(false);
  });

  it('never verifies against missing digest or salt', async () => {
    expect(await verifyPin('7777', null, 'salt')).toBe(false);
    expect(await verifyPin('7777', 'hash', null)).toBe(false);
    expect(await verifyPin('7777', null, null)).toBe(false);
  });
});

describe('recovery code', () => {
  it('normalises spacing and case', () => {
    expect(normalizeRecoveryCode('k7qf-3m2p-9wrt-xb4h')).toBe('K7QF3M2P9WRTXB4H');
    expect(normalizeRecoveryCode('  k7qf 3m2p ')).toBe('K7QF3M2P');
  });

  it('generates 4 groups of 4 from the unambiguous alphabet', async () => {
    const code = await generateRecoveryCode();
    expect(code).toMatch(/^([A-Z2-9]{4}-){3}[A-Z2-9]{4}$/);
    expect(code).not.toMatch(/[01ILO]/);
  });

  it('round-trips through hash and verify', async () => {
    const code = await generateRecoveryCode();
    const salt = await generateSalt();
    const hash = await hashRecoveryCode(code, salt);
    expect(hash).toBe(digestHex('shoppos.v2:' + salt + ':' + normalizeRecoveryCode(code)));
    expect(await verifyRecoveryCode(code, hash, salt)).toBe(true);
    expect(await verifyRecoveryCode('ZZZZZZZZZZZZZZZZ', hash, salt)).toBe(false);
  });
});