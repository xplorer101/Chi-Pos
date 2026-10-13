import { getDb } from '@/db';
import { bumpRevision } from '@/db/store';

/**
 * Lightweight key-value meta about backups, stored in the `app_meta` table so
 * it survives restores of the *current* data (it is overwritten by a restore,
 * which is correct - the incoming backup's own history wins).
 */

const LAST_BACKUP_AT = 'last_backup_at';
const LAST_BACKUP_NAME = 'last_backup_name';
const REMINDER_DAYS = 'backup_reminder_days';

const DEFAULT_REMINDER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

async function getMeta(key: string): Promise<string | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM app_meta WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    Date.now(),
  );
}

export type BackupMeta = {
  /** Epoch ms of the last successful export, or null. */
  lastBackupAt: number | null;
  /** Configurable reminder threshold in whole days. */
  reminderDays: number;
  /** True when a backup is due (never pressed on a fresh install). */
  backupDue: boolean;
};

export async function getBackupMeta(): Promise<BackupMeta> {
  const [rawAt, rawDays] = await Promise.all([getMeta(LAST_BACKUP_AT), getMeta(REMINDER_DAYS)]);
  const lastBackupAt = rawAt != null ? Number(rawAt) : null;
  const at = Number.isFinite(lastBackupAt ?? NaN) ? lastBackupAt : null;
  const reminderDays = Number.isFinite(Number(rawDays)) ? Number(rawDays) : DEFAULT_REMINDER_DAYS;
  const due =
    at === null ||
    Date.now() - at >= Math.max(1, reminderDays) * DAY_MS;
  return { lastBackupAt: at, reminderDays, backupDue: due };
}

export async function recordBackupDone(actorName: string, name: string): Promise<void> {
  await Promise.all([
    setMeta(LAST_BACKUP_AT, String(Date.now())),
    setMeta(LAST_BACKUP_NAME, name),
  ]);
  bumpRevision();
  void actorName;
}

export async function setBackupReminderDays(days: number): Promise<void> {
  await setMeta(REMINDER_DAYS, String(days));
  bumpRevision();
}