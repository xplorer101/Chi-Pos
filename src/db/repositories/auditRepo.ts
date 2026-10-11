import { newId } from '@/lib/id';

import { getDb } from '../index';
import { mapAuditEntry, type AuditRow } from '../mappers';
import type { ActingUser, AuditAction, AuditEntry } from '../types';

export type AuditInput = {
  user: ActingUser | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string | null;
  summary: string;
  detail?: string | null;
};

/** Append-only record of privileged actions. Never throws into callers' way. */
export async function recordAudit(input: AuditInput): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO audit_log
       (id, user_id, user_name, user_role, action, entity_type, entity_id, summary, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    input.user?.id ?? null,
    input.user?.name ?? 'Unknown',
    input.user?.role ?? '',
    input.action,
    input.entityType ?? '',
    input.entityId ?? null,
    input.summary,
    input.detail ?? null,
    Date.now(),
  );
}

export async function listAuditEntries(options: { limit?: number } = {}): Promise<AuditEntry[]> {
  const db = getDb();
  const rows = await db.getAllAsync<AuditRow>(
    'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?',
    options.limit ?? 200,
  );
  return rows.map(mapAuditEntry);
}

export async function getCostBackfillCount(): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    "SELECT value FROM app_meta WHERE key = 'cost_backfill_count'",
  );
  const parsed = Number(row?.value ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}
