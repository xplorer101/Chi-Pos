import * as SQLite from 'expo-sqlite';

import { migrate } from './migrations';

const DB_NAME = 'shoppos.db';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Open (once) and migrate the local database. Safe to call from anywhere -
 * the promise is memoised so concurrent callers share one connection.
 */
export async function initDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (!initPromise) {
    initPromise = (async () => {
      const handle = await SQLite.openDatabaseAsync(DB_NAME);
      await migrate(handle);
      db = handle;
      return handle;
    })();
  }
  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

/** Synchronous accessor - only valid after `initDb()` has resolved. */
export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database has not been initialised. Call initDb() first.');
  }
  return db;
}

export function isDbReady(): boolean {
  return db !== null;
}
