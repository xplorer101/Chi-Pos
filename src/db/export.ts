import { File, Paths } from 'expo-file-system';

import { getDb } from './index';
import { recordAudit } from './repositories/auditRepo';
import { bumpRevision } from './store';
import type { ActingUser } from './types';

const APP_NAME = 'ShopPOS';

export type ExportBundle = {
  app: string;
  schemaVersion: number;
  exportedAt: number;
  data: Record<string, unknown[]>;
};

export type ProgressFn = (label: string, current: number, total: number) => void;

/** Result-set queries every SQLite handle (expo or in-memory test) supports. */
export type DbQuery = {
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
};

/** A connection or transaction handle that can read and write. */
export type DbIo = DbQuery & {
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
  execAsync(sql: string): Promise<unknown>;
  withExclusiveTransactionAsync(fn: (txn: DbIo) => Promise<void>): Promise<unknown>;
};

const YIELD_EVERY = 200;

/** Let React paint on long exports/imports instead of blocking on awaits. */
async function yieldToUi(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export async function dumpAllTables(
  db: DbQuery,
  onProgress?: ProgressFn,
): Promise<Record<string, unknown[]>> {
  const tables = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name`,
  );
  const data: Record<string, unknown[]> = {};
  for (let index = 0; index < tables.length; index += 1) {
    const table = tables[index];
    data[table.name] = await db.getAllAsync(`SELECT * FROM "${table.name}"`);
    onProgress?.(`Exporting ${table.name}`, index, tables.length);
    if (table.name !== 'audit_log' && data[table.name].length > YIELD_EVERY) {
      await yieldToUi();
    }
  }
  return data;
}

/**
 * Empty every table and refill it from a backup inside one transaction.
 * Foreign keys are suspended for the swap because backups store rows
 * table-by-table. If anything fails mid-way the transaction rolls back, so the
 * app can never end up half-restored.
 */
export async function replaceDatabaseData(
  db: DbIo,
  data: Record<string, unknown[]>,
  onProgress?: ProgressFn,
): Promise<{ tables: number; rows: number }> {
  const tableRows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  );
  const known = new Set(tableRows.map((table) => table.name));

  let tables = 0;
  let rows = 0;

  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const name of known) await txn.runAsync(`DELETE FROM "${name}"`);

      const names = Object.keys(data);
      for (let tableIndex = 0; tableIndex < names.length; tableIndex += 1) {
        const name = names[tableIndex];
        const records = data[name];
        if (!known.has(name) || !Array.isArray(records)) continue;
        const columns = await txn.getAllAsync<{ name: string }>(`PRAGMA table_info("${name}")`);
        const valid = new Set(columns.map((column) => column.name));
        let wroteTable = false;
        for (let index = 0; index < records.length; index += 1) {
          const record = records[index];
          if (typeof record !== 'object' || record === null) continue;
          const fields = Object.entries(record as Record<string, unknown>).filter(
            ([key, value]) => valid.has(key) && value !== undefined,
          );
          if (fields.length === 0) continue;
          const columnList = fields.map(([key]) => `"${key}"`).join(', ');
          const placeholders = fields.map(() => '?').join(', ');
          await txn.runAsync(
            `INSERT INTO "${name}" (${columnList}) VALUES (${placeholders})`,
            ...fields.map(([, value]) => value as string | number | null),
          );
          rows += 1;
          wroteTable = true;
          if (rows % YIELD_EVERY === 0) {
            onProgress?.(`Restoring ${name}`, index, records.length);
            await yieldToUi();
          }
        }
        if (wroteTable || records.length === 0) tables += 1;
        onProgress?.(`Restored ${name}`, tableIndex, names.length);
      }
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }

  return { tables, rows };
}

/** `PRAGMA integrity_check` - 'ok' (case-insensitive) means the DB is sound. */
export async function integrityCheckOk(db: DbQuery): Promise<boolean> {
  const row = await db.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
  return typeof row?.integrity_check === 'string' && row.integrity_check.toUpperCase() === 'OK';
}

/** Dump every user table as JSON. Used for legacy backup and moving data. */
export async function exportToJson(): Promise<string> {
  const db = getDb();
  const data = await dumpAllTables(db);
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const bundle: ExportBundle = {
    app: APP_NAME,
    schemaVersion: version?.user_version ?? 0,
    exportedAt: Date.now(),
    data,
  };
  return JSON.stringify(bundle, null, 2);
}

function timestamp(ts: number): string {
  const date = new Date(ts);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** Write the legacy backup JSON to the cache directory, returning its URI. */
export async function writeBackupFile(
  actor: ActingUser,
  now: number = Date.now(),
): Promise<string> {
  const json = await exportToJson();
  const file = new File(Paths.cache, `shoppos-backup-${timestamp(now)}.json`);
  file.create({ overwrite: true, intermediates: true });
  file.write(json, { encoding: 'utf8' });
  await recordAudit({
    user: actor,
    action: 'backup',
    entityType: 'backup',
    summary: `Exported a full backup to ${file.name}`,
  });
  return file.uri;
}

export type RestoreResult = { tables: number; rows: number };

/**
 * Replace the whole database with the contents of a legacy backup bundle. The
 * bundle is validated first, then every table is emptied and re-filled inside
 * one transaction. See `replaceDatabaseData`.
 */
export async function restoreFromJson(actor: ActingUser, json: string): Promise<RestoreResult> {
  let bundle: ExportBundle;
  try {
    bundle = JSON.parse(json) as ExportBundle;
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!bundle || bundle.app !== APP_NAME || typeof bundle.data !== 'object' || bundle.data === null) {
    throw new Error('That is not a ShopPOS backup file.');
  }

  const db = getDb();
  const { tables, rows } = await replaceDatabaseData(db, bundle.data);

  await recordAudit({
    user: actor,
    action: 'restore',
    entityType: 'backup',
    summary: `Restored a backup: ${rows} rows across ${tables} tables`,
  });
  bumpRevision();
  return { tables, rows };
}