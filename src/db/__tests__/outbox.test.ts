/* eslint-disable import/first */
import { MIGRATIONS } from '../migrations';
import { TestDb } from './testDb';

jest.mock('@/lib/device', () => ({
  getDeviceId: async () => 'test-device',
  peekDeviceId: () => 'test-device',
}));

jest.mock('@/db/index', () => ({
  getDb: () => (globalThis as unknown as { __testDb?: unknown }).__testDb,
}));

import {
  enqueue,
  getOutboxEntry,
  listPending,
  markFailed,
  markSent,
  pendingCount,
  retryEntry,
} from '../repositories/outboxRepo';

describe('outbox', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = new TestDb();
    await db.apply(MIGRATIONS);
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = db;
  });

  afterEach(() => {
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = undefined;
  });

  it('is idempotent by id, so a re-enqueue never duplicates', async () => {
    await enqueue({ id: 'sale-1', kind: 'sale', payload: '{"a":1}' });
    await enqueue({ id: 'sale-1', kind: 'sale', payload: '{"a":2}' });
    expect(await pendingCount()).toBe(1);
  });

  it('marks an entry sent and drops it from the pending queue', async () => {
    await enqueue({ id: 'sale-1', kind: 'sale', payload: '{}' });
    await markSent('sale-1');
    expect(await pendingCount()).toBe(0);
    const entry = await getOutboxEntry('sale-1');
    expect(entry?.status).toBe('sent');
    expect(entry?.sentAt).not.toBeNull();
  });

  it('keeps a failed entry pending and retries it', async () => {
    await enqueue({ id: 'sale-1', kind: 'sale', payload: '{}' });
    await markFailed('sale-1', 'network down');

    let entry = await getOutboxEntry('sale-1');
    expect(entry?.status).toBe('failed');
    expect(entry?.attempts).toBe(1);
    expect(entry?.lastError).toBe('network down');
    expect(await pendingCount()).toBe(1); // still counts as waiting
    expect((await listPending()).map((e) => e.id)).toEqual(['sale-1']);

    await retryEntry('sale-1');
    entry = await getOutboxEntry('sale-1');
    expect(entry?.status).toBe('pending');
    expect(entry?.lastError).toBeNull();
  });

  it('drains oldest-first so sales sync in order', async () => {
    await enqueue({ id: 'sale-1', kind: 'sale', payload: '{}' });
    await enqueue({ id: 'sale-2', kind: 'sale', payload: '{}' });
    const ids = (await listPending()).map((entry) => entry.id);
    expect(ids).toEqual(['sale-1', 'sale-2']);
  });
});
