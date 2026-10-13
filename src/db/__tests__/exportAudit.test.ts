/* eslint-disable import/first */
jest.mock('expo-file-system', () => {
  class File {
    name: string;
    uri: string;
    contents = '';
    constructor(_directory: unknown, name: string) {
      this.name = name;
      this.uri = `file:///cache/${name}`;
    }
    create() {}
    write(contents: string) {
      this.contents = contents;
    }
  }
  return { File, Paths: { cache: '/cache' } };
});

jest.mock('@/lib/device', () => ({
  getDeviceId: async () => 'test-device',
  peekDeviceId: () => 'test-device',
}));

jest.mock('@/lib/id', () => {
  let n = 0;
  return { newId: () => `test-id-${n++}` };
});

jest.mock('@/db/index', () => ({
  getDb: () => (globalThis as unknown as { __testDb?: unknown }).__testDb,
}));

import { MIGRATIONS } from '../migrations';
import { TestDb } from './testDb';
import { exportToJson, restoreFromJson, writeBackupFile } from '../export';
import type { ActingUser } from '../types';

const OWNER: ActingUser = { id: 'u-owner', name: 'Owner', role: 'owner' };
const NOW = new Date(2026, 9, 11, 12, 0, 0, 0).getTime();

describe('backup and restore are recorded in the audit log', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = new TestDb();
    await db.apply(MIGRATIONS);
    db.exec(
      `INSERT INTO items (id, name, category, tracks_stock, low_stock_level, cost_price,
          selling_price, created_at, updated_at, device_id)
       VALUES ('i1', 'Bag of rice', 'Staples', 1, 2, 100, 200, ?, ?, 'test')`,
      NOW,
      NOW,
    );
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = db;
  });

  afterEach(() => {
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = undefined;
  });

  it('logs a backup when one is exported', async () => {
    await writeBackupFile(OWNER, NOW);

    const entry = await db.getFirstAsync<{ action: string; user_name: string }>(
      "SELECT action, user_name FROM audit_log WHERE action = 'backup'",
    );
    expect(entry).toEqual({ action: 'backup', user_name: 'Owner' });
  });

  it('logs a restore and puts the exported rows back', async () => {
    await writeBackupFile(OWNER, NOW);
    const json = await exportToJson();

    db.exec("DELETE FROM items WHERE id = 'i1'");
    expect(
      await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) AS c FROM items WHERE id = 'i1'"),
    ).toEqual({ c: 0 });

    const result = await restoreFromJson(OWNER, json);
    expect(result.rows).toBeGreaterThan(0);

    const restored = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM items WHERE id = 'i1'",
    );
    expect(restored).toEqual({ name: 'Bag of rice' });

    const actions = await db.getAllAsync<{ action: string }>(
      'SELECT action FROM audit_log ORDER BY created_at ASC, rowid ASC',
    );
    expect(actions.map((row) => row.action)).toEqual(['backup', 'restore']);
  });

  it('rejects files that are not ShopPOS backups', async () => {
    await expect(restoreFromJson(OWNER, 'not json')).rejects.toThrow('not valid JSON');
    await expect(restoreFromJson(OWNER, '{"app":"Other"}')).rejects.toThrow(
      'not a ShopPOS backup',
    );
  });
});
