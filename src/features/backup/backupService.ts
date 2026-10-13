import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from '@/db';
import {
  dumpAllTables,
  integrityCheckOk,
  replaceDatabaseData,
  type ProgressFn,
} from '@/db/export';
import { SCHEMA_VERSION } from '@/db/migrations';
import { recordAudit } from '@/db/repositories/auditRepo';
import { getSettings } from '@/db/repositories/settingsRepo';
import { authenticate, needsSetup } from '@/db/repositories/usersRepo';
import { bumpRevision } from '@/db/store';
import { assertPermission } from '@/features/auth/permissions';
import type { ActingUser } from '@/db/types';

import {
  backupFileName,
  BackupSchemaTooNewError,
  backupStamp,
  buildBackupFile,
  CONFIRM_WORD,
  openBackup,
  summarizeData,
  type BackupCounts,
  type BackupData,
  type BackupFile,
  parseBackupFile,
} from './backupFormat';

const SAFETY_DIR_NAME = 'safety';
const SAFETY_KEEP = 3;

function appVersion(): string {
  return String(Constants.expoConfig?.version ?? '1.1.0');
}

function randomBytes(length: number): Uint8Array {
  return Crypto.getRandomBytes(length);
}

/** Owner-only and PIN-gated, or a genuinely empty fresh install. */
async function verifyActorAndPin(actor: ActingUser | null, pin: string): Promise<void> {
  if (actor) {
    assertPermission(actor, 'backup_restore');
    if (actor.role !== 'owner') {
      throw new Error('Only the owner can back up or restore.');
    }
    const result = await authenticate(actor.id, pin);
    if (!result.ok) {
      if (result.reason === 'locked') {
        throw new Error(
          `Too many wrong PINs. Try again after ${new Date(result.lockedUntil).toLocaleTimeString()}.`,
        );
      }
      if (result.reason === 'inactive') throw new Error('That owner account is inactive.');
      throw new Error('The owner PIN is incorrect.');
    }
    return;
  }
  // Restoring onto a fresh install: no owner exists yet to verify.
  if (!(await needsSetup())) {
    throw new Error('Sign in as the owner to restore a backup.');
  }
}

async function auditFailed(
  actor: ActingUser | null,
  action: 'backup_failed' | 'restore_failed',
  reason: string,
): Promise<void> {
  try {
    if (!actor) return;
    await recordAudit({
      user: actor,
      action,
      entityType: 'backup',
      summary: `${action === 'backup_failed' ? 'Backup' : 'Restore'} failed: ${reason}`,
      detail: reason,
    });
  } catch {
    // Never let audit logging mask the original error.
  }
}

export type BuildBackupOptions = {
  pin: string;
  /** Optional encryption password. Empty means plain. */
  password?: string;
  now?: number;
  appVersionOverride?: string;
  onProgress?: ProgressFn;
};

export type PreparedBackup = {
  /** Text of the full .shoppos file. */
  text: string;
  /** File name, e.g. ShopPOS-backup-2026-10-13-1415.shoppos */
  name: string;
  createdAt: number;
  schemaVersion: number;
  encrypted: boolean;
  counts: BackupCounts;
};

/** Build a validated, checksummed, possibly encrypted backup in memory. */
export async function buildBackup(
  actor: ActingUser | null,
  options: BuildBackupOptions,
): Promise<PreparedBackup> {
  await verifyActorAndPin(actor, options.pin);

  const db = getDb();
  if (!(await integrityCheckOk(db))) {
    throw new Error(
      'The database failed its integrity check, so it cannot be backed up safely. ' +
        'Contact support before clearing the app.',
    );
  }

  const settings = await getSettings();
  const now = options.now ?? Date.now();
  const data = await dumpAllTables(db, options.onProgress);
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const schemaVersion = version?.user_version ?? 0;

  const file = await buildBackupFile({
    header: {
      app: 'ShopPOS',
      appVersion: options.appVersionOverride ?? appVersion(),
      schemaVersion,
      createdAt: now,
      businessName: settings.shopName.trim() || 'My Shop',
    },
    data,
    password: options.password?.trim() || undefined,
    randomBytes,
  });

  return {
    text: JSON.stringify(file),
    name: backupFileName(now),
    createdAt: now,
    schemaVersion,
    encrypted: file.header.encrypted,
    counts: summarizeData(data),
  };
}

export type ExportBackupOptions = BuildBackupOptions;

/** Build a backup, write it to the cache, record it, and return the file URI. */
export async function exportBackup(
  actor: ActingUser | null,
  options: ExportBackupOptions,
): Promise<PreparedBackup & { uri: string }> {
  try {
    const prepared = await buildBackup(actor, options);
    const file = new File(Paths.cache, prepared.name);
    file.create({ overwrite: true, intermediates: true });
    file.write(prepared.text, { encoding: 'utf8' });
    await recordAudit({
      user: actor,
      action: 'backup',
      entityType: 'backup',
      entityId: prepared.name,
      summary: `Backed up the whole database to ${prepared.name}` +
        (prepared.encrypted ? ' (password-protected)' : ''),
    });
    await import('./backupMeta').then(({ recordBackupDone }) =>
      recordBackupDone(actor?.name ?? '', prepared.name),
    );
    return { ...prepared, uri: file.uri };
  } catch (error) {
    await auditFailed(actor, 'backup_failed', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export type InspectedBackup = {
  file: BackupFile;
  counts: BackupCounts;
  text: string;
};

/**
 * Read, format-check, checksum-check and (if needed) decrypt a backup file.
 * Throws `BackupSchemaTooNewError` when this app is too old for the file.
 */
export async function inspectBackup(
  text: string,
  password?: string,
): Promise<InspectedBackup> {
  const { file, data } = await openBackup(text, { password, randomBytes });
  if (file.header.schemaVersion > SCHEMA_VERSION) {
    throw new BackupSchemaTooNewError(file.header.schemaVersion, SCHEMA_VERSION);
  }
  return { file, counts: summarizeData(data), text };
}

/** Keep large backup text out of module scope: re-serialize on demand. */
export function backupText(file: BackupFile): string {
  return JSON.stringify(file);
}

export type RestoreBackupOptions = {
  pin: string;
  text: string;
  password?: string;
  confirmWord: string;
  onProgress?: ProgressFn;
};

export type RestoreBackupResult = {
  tables: number;
  rows: number;
  counts: BackupCounts;
  fileSchemaVersion: number;
};

/** Replace the books with a backup, atomically, after a safety copy. */
export async function restoreBackup(
  actor: ActingUser | null,
  options: RestoreBackupOptions,
): Promise<RestoreBackupResult> {
  try {
    const file = parseBackupFile(options.text);
    if (file.header.schemaVersion > SCHEMA_VERSION) {
      throw new BackupSchemaTooNewError(file.header.schemaVersion, SCHEMA_VERSION);
    }
    if ((options.confirmWord ?? '').toUpperCase() !== CONFIRM_WORD) {
      throw new Error(`Type ${CONFIRM_WORD} to confirm you want to replace all data.`);
    }
    await verifyActorAndPin(actor, options.pin);

    const { data } = await openBackup(options.text, {
      password: options.password,
      randomBytes,
    });

    const db = getDb();
    await validateTablesPresent(db, data);

    await createSafetyCopy(db, options.onProgress);

    const replaced = await replaceDatabaseData(db, data, options.onProgress);
    if (file.header.schemaVersion < SCHEMA_VERSION) {
      await migrateRestoredData(db, file.header.schemaVersion);
    }
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);

    await recordAudit({
      user: actor,
      action: 'restore',
      entityType: 'backup',
      summary: `Restored ${replaced.rows} rows across ${replaced.tables} tables` +
        ` (schema ${file.header.schemaVersion}${file.header.encrypted ? ', encrypted' : ''})`,
      detail: JSON.stringify({
        counts: summarizeData(data),
        businessName: file.header.businessName,
      }),
    });
    bumpRevision();

    return {
      tables: replaced.tables,
      rows: replaced.rows,
      counts: summarizeData(data),
      fileSchemaVersion: file.header.schemaVersion,
    };
  } catch (error) {
    await auditFailed(actor, 'restore_failed', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/** Fail fast if the backup is missing a table the app needs. */
async function validateTablesPresent(
  db: Parameters<typeof dumpAllTables>[0],
  data: BackupData,
): Promise<void> {
  const tables = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
  );
  const present = new Set(tables.map((table) => table.name));
  const missing = ['settings', 'items', 'customers', 'sales', 'payments', 'users', 'audit_log'].filter(
    (name) => !present.has(name),
  );
  if (missing.length > 0) {
    throw new Error(`That backup is missing core data tables (${missing.join(', ')}).`);
  }
}

/**
 * Older backups carry fewer columns than the current schema. Physical tables
 * already match the current version (the app just migrated them), so here we
 * run the data-only steps that the newer migrations would have applied.
 */
async function migrateRestoredData(db: SQLiteDatabase, fromVersion: number): Promise<void> {
  if (fromVersion < 7) {
    await db.execAsync(`
      UPDATE sale_lines SET cost_estimated = 1
       WHERE deleted_at IS NULL AND unit_cost = 0;

      UPDATE sale_lines
         SET unit_cost = COALESCE(
           (SELECT i.cost_price FROM items i WHERE i.id = sale_lines.item_id), 0)
       WHERE deleted_at IS NULL AND unit_cost = 0
         AND EXISTS (
           SELECT 1 FROM items i
            WHERE i.id = sale_lines.item_id AND i.cost_price > 0
         );
    `);
    const row = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM sale_lines WHERE cost_estimated = 1',
    );
    await db.runAsync(
      `INSERT INTO app_meta (key, value, updated_at)
       VALUES ('cost_backfill_count', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      String(row?.c ?? 0),
      Date.now(),
    );
  }
}

export type SafetyCopySummary = {
  name: string;
  uri: string;
  createdAt: number | null;
  size: number;
};

function safetyDirectory(): Directory {
  return new Directory(Paths.document, SAFETY_DIR_NAME);
}

function safetyPath(name: string): File {
  return new File(safetyDirectory(), name);
}

/**
 * Full, unencrypted backup of the *current* data, kept on-device so a restore
 * can always be undone. Prunes down to the newest SAFETY_KEEP copies. Must
 * succeed before a restore touches anything.
 */
export async function createSafetyCopy(
  db: Parameters<typeof dumpAllTables>[0],
  onProgress?: ProgressFn,
): Promise<string> {
  const data = await dumpAllTables(db, onProgress);
  const now = Date.now();
  const file = await buildBackupFile({
    header: {
      app: 'ShopPOS',
      appVersion: appVersion(),
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      businessName: 'Safety copy',
    },
    data,
  });
  const stamp = backupStamp(now);
  const name = `Safety-${stamp}-${String(data.sales.length).slice(-8)}.shoppos`;

  const dir = safetyDirectory();
  dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, name);
  target.create({ overwrite: true, intermediates: true });
  target.write(JSON.stringify(file), { encoding: 'utf8' });

  const existing = dir
    .list()
    .filter(
      (entry): entry is File =>
        entry instanceof File && entry.name.startsWith('Safety-') && entry.name.endsWith('.shoppos'),
    )
    .sort((a, b) => b.name.localeCompare(a.name));
  for (const stale of existing.slice(SAFETY_KEEP)) {
    try {
      if (stale.exists) stale.delete();
    } catch {
      // A stale safety copy that can't be removed is harmless; keep going.
    }
  }

  return name;
}

export async function listSafetyCopies(): Promise<SafetyCopySummary[]> {
  const dir = safetyDirectory();
  if (!dir.exists) return [];
  const entries = dir.list().filter(
    (entry): entry is File & { lastModified: number | null } => {
      if (!(entry instanceof File)) return false;
      const name = entry.name;
      return name.startsWith('Safety-') && name.endsWith('.shoppos');
    },
  );
  const copies = await Promise.all(
    entries.map(async (entry) => ({
      name: entry.name,
      uri: entry.uri,
      createdAt: entry.lastModified,
      size: entry.size,
    })),
  );
  copies.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return copies;
}

export async function restoreSafetyCopy(
  actor: ActingUser | null,
  options: { pin: string; name: string; confirmWord: string; onProgress?: ProgressFn },
): Promise<RestoreBackupResult> {
  const file = safetyPath(options.name);
  if (!file.exists) throw new Error('That safety copy no longer exists.');
  const text = await file.text();
  return restoreBackup(actor, {
    pin: options.pin,
    text,
    confirmWord: options.confirmWord,
    onProgress: options.onProgress,
  });
}

export { CONFIRM_WORD } from './backupFormat';