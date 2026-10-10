import { File, Paths } from 'expo-file-system';

import { getDb } from './index';

const APP_NAME = 'ShopPOS';

export type ExportBundle = {
  app: string;
  schemaVersion: number;
  exportedAt: number;
  data: Record<string, unknown[]>;
};

/** Dump every user table as JSON. Used for backup and for moving data between devices. */
export async function exportToJson(): Promise<string> {
  const db = getDb();
  const tables = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name`,
  );
  const data: Record<string, unknown[]> = {};
  for (const table of tables) {
    data[table.name] = await db.getAllAsync(`SELECT * FROM "${table.name}"`);
  }
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

/** Write the backup JSON to the cache directory and return a shareable file URI. */
export async function writeBackupFile(now: number = Date.now()): Promise<string> {
  const json = await exportToJson();
  const file = new File(Paths.cache, `shoppos-backup-${timestamp(now)}.json`);
  file.create({ overwrite: true, intermediates: true });
  file.write(json, { encoding: 'utf8' });
  return file.uri;
}
