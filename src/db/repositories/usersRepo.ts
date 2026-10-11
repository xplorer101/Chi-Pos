import {
  generateRecoveryCode,
  generateSalt,
  hashPin,
  hashRecoveryCode,
  isValidPin,
  verifyPin,
  verifyRecoveryCode,
} from '@/lib/pin';
import { isLocked, nextLockoutUntil } from '@/lib/lockout';

import { recordAudit } from './auditRepo';
import { getDb } from '../index';
import { mapUser, type UserRow } from '../mappers';
import { newRowMeta } from '../meta';
import { bumpRevision } from '../store';
import type { ActingUser, User } from '../types';
import { assertPermission } from '@/features/auth/permissions';

export function toActingUser(user: User): ActingUser {
  return { id: user.id, name: user.name, role: user.role };
}

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'inactive' }
  | { ok: false; reason: 'locked'; lockedUntil: number }
  | { ok: false; reason: 'incorrect'; failedAttempts: number; lockedUntil: number | null };

async function loadUserRow(id: string): Promise<UserRow | null> {
  const db = getDb();
  return db.getFirstAsync<UserRow>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', id);
}

export async function getUser(id: string): Promise<User | null> {
  const row = await loadUserRow(id);
  return row ? mapUser(row) : null;
}

/** Every active user, owner first, for the switch-user screen. */
export async function listUsers(): Promise<User[]> {
  const db = getDb();
  const rows = await db.getAllAsync<UserRow>(
    `SELECT * FROM users
      WHERE deleted_at IS NULL AND is_active = 1
      ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, name COLLATE NOCASE`,
  );
  return rows.map(mapUser);
}

/** Every user including deactivated ones, for staff management. */
export async function listAllUsers(): Promise<User[]> {
  const db = getDb();
  const rows = await db.getAllAsync<UserRow>(
    `SELECT * FROM users
      WHERE deleted_at IS NULL
      ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, name COLLATE NOCASE`,
  );
  return rows.map(mapUser);
}

export async function getOwner(): Promise<User | null> {
  const db = getDb();
  const row = await db.getFirstAsync<UserRow>(
    "SELECT * FROM users WHERE role = 'owner' AND is_active = 1 AND deleted_at IS NULL LIMIT 1",
  );
  return row ? mapUser(row) : null;
}

export async function needsSetup(): Promise<boolean> {
  return (await getOwner()) === null;
}

export type CreateOwnerResult = {
  owner: User;
  recoveryCode: string;
};

/**
 * First-run setup: creates the owner and attributes every existing row (sold
 * before staff roles existed) to them, so old data is not orphaned.
 */
export async function createOwner(input: { name: string; pin: string }): Promise<CreateOwnerResult> {
  const name = input.name.trim();
  if (!name) throw new Error('Enter a name.');
  if (!isValidPin(input.pin)) throw new Error('PIN must be 4 to 6 digits.');

  const db = getDb();
  const meta = await newRowMeta();
  const pinSalt = await generateSalt();
  const pinHash = await hashPin(input.pin, pinSalt);
  const recoveryCode = await generateRecoveryCode();
  const recoverySalt = await generateSalt();
  const recoveryHash = await hashRecoveryCode(recoveryCode, recoverySalt);

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO users
         (id, name, role, pin_hash, pin_salt, recovery_hash, recovery_salt,
          is_active, failed_attempts, locked_until, last_login_at,
          created_at, updated_at, deleted_at, device_id)
       VALUES (?, ?, 'owner', ?, ?, ?, ?, 1, 0, NULL, NULL, ?, ?, NULL, ?)`,
      meta.id,
      name,
      pinHash,
      pinSalt,
      recoveryHash,
      recoverySalt,
      meta.now,
      meta.now,
      meta.deviceId,
    );
    await txn.runAsync('UPDATE sales SET user_id = ? WHERE user_id IS NULL', meta.id);
    await txn.runAsync('UPDATE payments SET user_id = ? WHERE user_id IS NULL', meta.id);
    await txn.runAsync('UPDATE stock_movements SET user_id = ? WHERE user_id IS NULL', meta.id);
  });

  await recordAudit({
    user: { id: meta.id, name, role: 'owner' },
    action: 'staff_add',
    entityType: 'user',
    entityId: meta.id,
    summary: `Created owner account "${name}"`,
  });
  bumpRevision();

  const owner = await getUser(meta.id);
  return { owner: owner!, recoveryCode };
}

export async function createCashier(
  actor: ActingUser,
  input: { name: string; pin: string },
): Promise<User> {
  assertPermission(actor, 'manage_staff');
  const name = input.name.trim();
  if (!name) throw new Error('Enter the staff name.');
  if (!isValidPin(input.pin)) throw new Error('PIN must be 4 to 6 digits.');

  const db = getDb();
  const meta = await newRowMeta();
  const pinSalt = await generateSalt();
  const pinHash = await hashPin(input.pin, pinSalt);

  await db.runAsync(
    `INSERT INTO users
       (id, name, role, pin_hash, pin_salt, recovery_hash, recovery_salt,
        is_active, failed_attempts, locked_until, last_login_at,
        created_at, updated_at, deleted_at, device_id)
     VALUES (?, ?, 'cashier', ?, ?, NULL, NULL, 1, 0, NULL, NULL, ?, ?, NULL, ?)`,
    meta.id,
    name,
    pinHash,
    pinSalt,
    meta.now,
    meta.now,
    meta.deviceId,
  );

  await recordAudit({
    user: actor,
    action: 'staff_add',
    entityType: 'user',
    entityId: meta.id,
    summary: `Added cashier "${name}"`,
  });
  bumpRevision();
  const user = await getUser(meta.id);
  return user!;
}

export async function renameUser(actor: ActingUser, userId: string, name: string): Promise<User> {
  assertPermission(actor, 'manage_staff');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter the staff name.');
  const target = await getUser(userId);
  if (!target) throw new Error('That user no longer exists.');

  const db = getDb();
  await db.runAsync(
    'UPDATE users SET name = ?, updated_at = ? WHERE id = ?',
    trimmed,
    Date.now(),
    userId,
  );
  await recordAudit({
    user: actor,
    action: 'role_change',
    entityType: 'user',
    entityId: userId,
    summary: `Renamed "${target.name}" to "${trimmed}"`,
  });
  bumpRevision();
  const user = await getUser(userId);
  return user!;
}

export async function setUserActive(
  actor: ActingUser,
  userId: string,
  active: boolean,
): Promise<User> {
  assertPermission(actor, 'manage_staff');
  const target = await getUser(userId);
  if (!target) throw new Error('That user no longer exists.');
  if (target.role === 'owner') throw new Error('The owner account cannot be deactivated.');

  const db = getDb();
  await db.runAsync(
    'UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?',
    active ? 1 : 0,
    Date.now(),
    userId,
  );
  await recordAudit({
    user: actor,
    action: 'role_change',
    entityType: 'user',
    entityId: userId,
    summary: `${active ? 'Reactivated' : 'Deactivated'} "${target.name}"`,
  });
  bumpRevision();
  const user = await getUser(userId);
  return user!;
}

/** Soft-delete a cashier. Their sales and payments stay attributed to them. */
export async function deleteUser(actor: ActingUser, userId: string): Promise<void> {
  assertPermission(actor, 'manage_staff');
  const target = await getUser(userId);
  if (!target) throw new Error('That user no longer exists.');
  if (target.role === 'owner') throw new Error('The owner account cannot be deleted.');

  const db = getDb();
  const now = Date.now();
  await db.runAsync(
    'UPDATE users SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ?',
    now,
    now,
    userId,
  );
  await recordAudit({
    user: actor,
    action: 'staff_delete',
    entityType: 'user',
    entityId: userId,
    summary: `Deleted cashier "${target.name}"`,
  });
  bumpRevision();
}

/** Owner resets any user's PIN. */
export async function adminSetPin(actor: ActingUser, userId: string, pin: string): Promise<void> {
  assertPermission(actor, 'manage_staff');
  if (!isValidPin(pin)) throw new Error('PIN must be 4 to 6 digits.');
  const target = await getUser(userId);
  if (!target) throw new Error('That user no longer exists.');

  const db = getDb();
  const salt = await generateSalt();
  const hash = await hashPin(pin, salt);
  await db.runAsync(
    `UPDATE users SET pin_hash = ?, pin_salt = ?, failed_attempts = 0, locked_until = NULL, updated_at = ?
      WHERE id = ?`,
    hash,
    salt,
    Date.now(),
    userId,
  );
  await recordAudit({
    user: actor,
    action: 'pin_reset',
    entityType: 'user',
    entityId: userId,
    summary: `Reset PIN for "${target.name}"`,
  });
  bumpRevision();
}

/** A signed-in user changes their own PIN, proving the current one first. */
export async function changeOwnPin(
  actor: ActingUser,
  currentPin: string,
  newPin: string,
): Promise<void> {
  if (!isValidPin(newPin)) throw new Error('New PIN must be 4 to 6 digits.');
  const row = await loadUserRow(actor.id);
  if (!row) throw new Error('That user no longer exists.');
  const user = mapUser(row);
  if (!(await verifyPin(currentPin, user.pinHash, user.pinSalt))) {
    throw new Error('Current PIN is incorrect.');
  }
  const db = getDb();
  const salt = await generateSalt();
  const hash = await hashPin(newPin, salt);
  await db.runAsync(
    'UPDATE users SET pin_hash = ?, pin_salt = ?, updated_at = ? WHERE id = ?',
    hash,
    salt,
    Date.now(),
    actor.id,
  );
  await recordAudit({
    user: actor,
    action: 'pin_reset',
    entityType: 'user',
    entityId: actor.id,
    summary: `${actor.name} changed their PIN`,
  });
  bumpRevision();
}

/**
 * Check a PIN and apply the lockout policy. Wrong attempts increment a stored
 * counter and, from the threshold on, set an exponentially longer `locked_until`.
 */
export async function authenticate(userId: string, pin: string): Promise<AuthResult> {
  const row = await loadUserRow(userId);
  if (!row) return { ok: false, reason: 'inactive' };
  const user = mapUser(row);
  const now = Date.now();

  if (!user.isActive) return { ok: false, reason: 'inactive' };
  if (isLocked(user.lockedUntil, now)) {
    return { ok: false, reason: 'locked', lockedUntil: user.lockedUntil! };
  }

  const db = getDb();
  if (await verifyPin(pin, user.pinHash, user.pinSalt)) {
    await db.runAsync(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?',
      now,
      now,
      userId,
    );
    const fresh = await getUser(userId);
    return { ok: true, user: fresh! };
  }

  const failedAttempts = user.failedAttempts + 1;
  const lockedUntil = nextLockoutUntil(failedAttempts, now);
  await db.runAsync(
    'UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?',
    failedAttempts,
    lockedUntil,
    now,
    userId,
  );
  return { ok: false, reason: 'incorrect', failedAttempts, lockedUntil };
}

export type RecoveryResult = { recoveryCode: string };

/**
 * Owner recovery: verify the one-time code, set a new PIN and rotate the code
 * so the owner can write down a fresh one.
 */
export async function recoverOwnerPin(
  code: string,
  newPin: string,
): Promise<RecoveryResult> {
  if (!isValidPin(newPin)) throw new Error('New PIN must be 4 to 6 digits.');
  const owner = await getOwner();
  if (!owner) throw new Error('No owner account found.');
  if (!(await verifyRecoveryCode(code, owner.recoveryHash, owner.recoverySalt))) {
    throw new Error('That recovery code is not correct.');
  }

  const db = getDb();
  const pinSalt = await generateSalt();
  const pinHash = await hashPin(newPin, pinSalt);
  const recoveryCode = await generateRecoveryCode();
  const recoverySalt = await generateSalt();
  const recoveryHash = await hashRecoveryCode(recoveryCode, recoverySalt);

  await db.runAsync(
    `UPDATE users
        SET pin_hash = ?, pin_salt = ?, recovery_hash = ?, recovery_salt = ?,
            failed_attempts = 0, locked_until = NULL, updated_at = ?
      WHERE id = ?`,
    pinHash,
    pinSalt,
    recoveryHash,
    recoverySalt,
    Date.now(),
    owner.id,
  );
  await recordAudit({
    user: null,
    action: 'pin_reset',
    entityType: 'user',
    entityId: owner.id,
    summary: `Owner PIN recovered with recovery code`,
  });
  bumpRevision();
  return { recoveryCode };
}
