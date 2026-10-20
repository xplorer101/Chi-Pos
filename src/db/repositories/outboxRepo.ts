import { getDb } from '../index';
import { bumpRevision } from '../store';

export type OutboxKind = 'sale' | 'debt_payment' | 'customer';
export type OutboxStatus = 'pending' | 'sent' | 'failed';

export type OutboxRow = {
  id: string;
  kind: string;
  payload: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
  sent_at: number | null;
};

export type OutboxRecord = {
  id: string;
  kind: OutboxKind;
  payload: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  sentAt: number | null;
};

function mapOutbox(row: OutboxRow): OutboxRecord {
  return {
    id: row.id,
    kind: row.kind as OutboxKind,
    payload: row.payload,
    status: row.status as OutboxStatus,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
  };
}

/** Queue an operation for delivery to the admin host. The id is the idempotency key. */
export async function enqueue(input: {
  id: string;
  kind: OutboxKind;
  payload: string;
}): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO outbox (id, kind, payload, status, attempts, last_error, created_at, updated_at, sent_at)
     VALUES (?, ?, ?, 'pending', 0, NULL, ?, ?, NULL)
     ON CONFLICT(id) DO NOTHING`,
    input.id,
    input.kind,
    input.payload,
    now,
    now,
  );
  bumpRevision();
}

/**
 * Queue a customer record. Unlike sales, a later edit of the same customer
 * replaces the payload and re-opens the entry, so the admin always ends up
 * with the newest version no matter how many times the cashier edits offline.
 */
export async function enqueueCustomer(input: { id: string; payload: string }): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO outbox (id, kind, payload, status, attempts, last_error, created_at, updated_at, sent_at)
     VALUES (?, 'customer', ?, 'pending', 0, NULL, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       payload = excluded.payload,
       status = 'pending',
       attempts = 0,
       last_error = NULL,
       updated_at = excluded.updated_at,
       sent_at = NULL`,
    input.id,
    input.payload,
    now,
    now,
  );
  bumpRevision();
}

/**
 * Oldest first, so sales sync in the order they were rung up. Customer records
 * always drain ahead of anything else: a sale that references a customer can
 * never reach the admin before that customer does.
 */
export async function listPending(): Promise<OutboxRecord[]> {
  const db = getDb();
  const rows = await db.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox
      WHERE status IN ('pending','failed')
      ORDER BY CASE WHEN kind = 'customer' THEN 0 ELSE 1 END, created_at ASC`,
  );
  return rows.map(mapOutbox);
}

/** Everything currently stuck, newest first. Shown in the sync queue UI. */
export async function listFailed(): Promise<OutboxRecord[]> {
  const db = getDb();
  const rows = await db.getAllAsync<OutboxRow>(
    "SELECT * FROM outbox WHERE status = 'failed' ORDER BY updated_at DESC",
  );
  return rows.map(mapOutbox);
}

export async function listOutbox(limit = 100): Promise<OutboxRecord[]> {
  const db = getDb();
  const rows = await db.getAllAsync<OutboxRow>('SELECT * FROM outbox ORDER BY created_at DESC LIMIT ?', limit);
  return rows.map(mapOutbox);
}

export async function getOutboxEntry(id: string): Promise<OutboxRecord | null> {
  const db = getDb();
  const row = await db.getFirstAsync<OutboxRow>('SELECT * FROM outbox WHERE id = ?', id);
  return row ? mapOutbox(row) : null;
}

export async function markSent(id: string): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.runAsync(
    "UPDATE outbox SET status = 'sent', sent_at = ?, last_error = NULL, updated_at = ? WHERE id = ?",
    now,
    now,
    id,
  );
  bumpRevision();
}

export async function markFailed(id: string, error: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE outbox SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?",
    error,
    Date.now(),
    id,
  );
  bumpRevision();
}

/** Return a failed item to the queue for another attempt. */
export async function retryEntry(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE outbox SET status = 'pending', last_error = NULL, updated_at = ? WHERE id = ? AND status = 'failed'",
    Date.now(),
    id,
  );
  bumpRevision();
}

export async function pendingCount(): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM outbox WHERE status IN ('pending','failed')",
  );
  return row?.c ?? 0;
}

/** How many queued entries are parked on an error (a subset of pendingCount). */
export async function failedCount(): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM outbox WHERE status = 'failed'",
  );
  return row?.c ?? 0;
}
