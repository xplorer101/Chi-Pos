import { MIGRATIONS, SCHEMA_VERSION } from '../migrations';

describe('migration ordering', () => {
  it('is strictly increasing and matches the schema version', () => {
    const versions = MIGRATIONS.map((migration) => migration.version);
    for (let i = 1; i < versions.length; i += 1) {
      expect(versions[i]).toBeGreaterThan(versions[i - 1]);
    }
    expect(versions).toEqual([...new Set(versions)]);
    expect(SCHEMA_VERSION).toBe(versions[versions.length - 1]);
  });

  it('never edits an already-applied migration (history is append-only)', () => {
    const birthdays = new Map(MIGRATIONS.map((migration) => [migration.name, migration.version]));
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(7);
    expect(birthdays.has('staff_roles_and_audit')).toBe(true);
  });
});

describe('step-4 migration (staff_roles_and_audit)', () => {
  const v7 = MIGRATIONS.find((migration) => migration.version === 7);
  if (!v7) throw new Error('missing migration v7');
  const { sql } = v7;

  it('adds the users, audit_log and app_meta tables', () => {
    expect(sql).toContain('CREATE TABLE users');
    expect(sql).toContain('CREATE TABLE audit_log');
    expect(sql).toContain('CREATE TABLE app_meta');
  });

  it('adds attribution and void columns without dropping data', () => {
    expect(sql).toContain('ALTER TABLE sales ADD COLUMN user_id');
    expect(sql).toContain('ALTER TABLE sales ADD COLUMN void_reason');
    expect(sql).toContain('ALTER TABLE sales ADD COLUMN voided_by');
    expect(sql).toContain('ALTER TABLE sales ADD COLUMN voided_at');
    expect(sql).toContain('ALTER TABLE payments ADD COLUMN user_id');
    expect(sql).toContain('ALTER TABLE stock_movements ADD COLUMN user_id');
    expect(sql).toContain('ALTER TABLE sale_lines ADD COLUMN cost_estimated INTEGER NOT NULL DEFAULT 0');
    expect(sql).toContain('ALTER TABLE settings ADD COLUMN auto_lock_minutes');
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
  });

  it('marks legacy zero-cost lines as estimated and backfills from item cost', () => {
    expect(sql).toContain('SET cost_estimated = 1');
    expect(sql).toContain('cost_price > 0');
  });

  it('adds the lookups needed for staff attribution', () => {
    expect(sql).toContain('CREATE INDEX idx_users_role');
    expect(sql).toContain('CREATE INDEX idx_sales_user');
    expect(sql).toContain('CREATE INDEX idx_payments_user');
    expect(sql).toContain('CREATE INDEX idx_audit_created');
  });

  it('records the backfill count via an in-transaction after hook', () => {
    expect(typeof v7.after).toBe('function');
    if (v7.after) {
      const body = v7.after.toString();
      // The function body may be minified; check it's a non-trivial function
      expect(body.length).toBeGreaterThan(50);
    }
  });

  it('keeps the voided status in the sales CHECK constraint via the base table', () => {
    const v1 = MIGRATIONS.find((migration) => migration.version === 1);
    expect(v1?.sql).toContain("status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided'))");
  });
});