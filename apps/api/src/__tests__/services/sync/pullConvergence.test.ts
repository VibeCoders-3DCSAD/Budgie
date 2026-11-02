import { jest } from "@jest/globals";

jest.mock("expo-sqlite", () => ({}), { virtual: true });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { normalizePullRow, applyPullRow } = require("../../../../../app/local-db/sync/pullConvergence");

const validUserId = "00000000-0000-0000-0000-000000000001";

// Mock db interface for applyPullRow tests
function mockDb(existing?: { version: number } | null) {
  return {
    getFirstAsync: jest.fn<() => Promise<{ version: number } | null>>()
      .mockResolvedValue(existing ?? null),
    runAsync: jest.fn(() => Promise.resolve({ lastInsertRowId: 0, changes: 1 })),
  };
}

// ---------------------------------------------------------------------------
// normalizePullRow
// ---------------------------------------------------------------------------

describe("normalizePullRow", () => {
  it("normalizes booleans to 0/1 for financial_accounts", () => {
    const row = {
      id: "acct-1", user_id: null, name: "BPI Savings", kind: "bank",
      status: "active", opening_balance_centavos: 500000, current_balance_centavos: 500000,
      include_in_dashboard_balance: true,
      institution_name: "BPI", opened_on: "2026-01-15", archived_at: null,
      deleted_at: null, sort_order: 0, metadata: { notes: "primary" },
      version: 1, deleted: true,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
      last_synced_at: null,
    };

    const result = normalizePullRow("financial_accounts", row, validUserId);
    expect(result.user_id).toBe(validUserId);
    expect(result.include_in_dashboard_balance).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.metadata).toBe('{"notes":"primary"}');
  });

  it("normalizes booleans for income_sources", () => {
    const row = {
      id: "inc-1", user_id: null, name: "Salary",
      frequency: "monthly", expected_amount_centavos: null,
      payday_day_of_month: null, payday_second_day_of_month: null,
      payday_day_of_week: null, next_expected_date: null, is_active: false,
      notes: null, metadata: {}, version: 1, deleted: false,
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
      last_synced_at: null,
    };
    const result = normalizePullRow("income_sources", row, validUserId);
    expect(result.is_active).toBe(0);
    expect(result.deleted).toBe(0);
  });

  it("returns row unchanged for unknown table", () => {
    const row = { id: "x", version: 1, deleted: true };
    expect(normalizePullRow("unknown_table", row, validUserId)).toBe(row);
  });
});

// ---------------------------------------------------------------------------
// applyPullRow
// ---------------------------------------------------------------------------

describe("applyPullRow — convergence", () => {
  it("inserts new row when it does not exist", async () => {
    const db = mockDb(null);
    const row = { id: "acct-1", user_id: validUserId, name: "BPI", kind: "bank", version: 1, deleted: 0 };
    await applyPullRow(db, "financial_accounts", row);
    expect(db.runAsync).toHaveBeenCalled();
    expect((db.runAsync as jest.Mock).mock.calls[0][0]).toContain("INSERT");
  });

  it("skips insert when row does not exist and is deleted", async () => {
    const db = mockDb(null);
    const row = { id: "acct-1", user_id: validUserId, name: "BPI", kind: "bank", version: 1, deleted: 1 };
    await applyPullRow(db, "financial_accounts", row);
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it("applies newer remote version", async () => {
    const db = mockDb({ version: 2 });
    const row = { id: "acct-1", user_id: validUserId, name: "Updated", kind: "bank", version: 3, deleted: 0 };
    await applyPullRow(db, "financial_accounts", row);
    expect(db.runAsync).toHaveBeenCalled();
    // "Updated" is a parameterized value, not in the SQL string itself
    const params = (db.runAsync as jest.Mock).mock.calls[0];
    expect(params).toContain("Updated");
  });

  it("ignores stale remote version (local newer)", async () => {
    const db = mockDb({ version: 5 });
    const row = { id: "acct-1", user_id: validUserId, name: "Stale", kind: "bank", version: 3, deleted: 0 };
    await applyPullRow(db, "financial_accounts", row);
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it("applies tombstone with status='deleted' for financial_accounts", async () => {
    const db = mockDb({ version: 1 });
    await applyPullRow(db, "financial_accounts", { id: "acct-1", user_id: validUserId, version: 2, deleted: 1 });
    expect((db.runAsync as jest.Mock).mock.calls[0][0]).toContain("status = 'deleted'");
  });

  it("applies tombstones to scheduled payments without touching their status", async () => {
    const db = mockDb({ version: 1 });
    await applyPullRow(db, "scheduled_payments", { id: "payment-1", user_id: validUserId, version: 2, deleted: true });
    const sql = (db.runAsync as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain("deleted = 1");
    expect(sql).not.toContain("status");
    expect(sql).not.toContain("is_active");
  });

  it("applies tombstone with is_active=0 for taxonomy tables", async () => {
    const db = mockDb({ version: 1 });
    await applyPullRow(db, "categories", { id: "cat-1", user_id: validUserId, version: 2, deleted: 1 });
    expect((db.runAsync as jest.Mock).mock.calls[0][0]).toContain("is_active = 0");
  });

  it("treats deleted:true and deleted:1 the same", async () => {
    const db1 = mockDb({ version: 1 });
    await applyPullRow(db1, "categories", { id: "cat-1", user_id: validUserId, version: 2, deleted: true });
    expect((db1.runAsync as jest.Mock).mock.calls[0][0]).toContain("is_active = 0");

    const db2 = mockDb({ version: 1 });
    await applyPullRow(db2, "categories", { id: "cat-2", user_id: validUserId, version: 2, deleted: 1 });
    expect((db2.runAsync as jest.Mock).mock.calls[0][0]).toContain("is_active = 0");
  });
});
