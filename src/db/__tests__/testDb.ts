import { DatabaseSync } from 'node:sqlite';

import type { Migration } from '../migrations';

/**
 * Minimal async stand-in for expo-sqlite's API, backed by Node's built-in
 * synchronous SQLite. Only the methods the repositories actually use are
 * implemented, which keeps the integration tests dependency-free.
 */
export class TestDb {
  private readonly sqlite = new DatabaseSync(':memory:');

  /** Apply migrations, awaiting any async `after` hooks. */
  async apply(migrations: Migration[]): Promise<void> {
    for (const migration of migrations) {
      this.sqlite.exec(migration.sql);
      if (migration.after) await migration.after(this as never);
    }
  }

  exec(sql: string, ...params: unknown[]): void {
    this.sqlite.prepare(sql).run(...(params as never[]));
  }

  execAsync(sql: string): Promise<void> {
    this.sqlite.exec(sql);
    return Promise.resolve();
  }

  runAsync(sql: string, ...params: unknown[]): Promise<void> {
    this.sqlite.prepare(sql).run(...(params as never[]));
    return Promise.resolve();
  }

  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    const row = this.sqlite.prepare(sql).get(...(params as never[])) as T | undefined;
    return Promise.resolve(row ?? null);
  }

  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return Promise.resolve(this.sqlite.prepare(sql).all(...(params as never[])) as T[]);
  }

  async withExclusiveTransactionAsync(fn: (txn: TestDb) => Promise<void>): Promise<void> {
    this.sqlite.exec('BEGIN');
    try {
      await fn(this);
      this.sqlite.exec('COMMIT');
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}
