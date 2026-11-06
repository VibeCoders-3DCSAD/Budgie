import { jest } from "@jest/globals";
import { applyPullRow, normalizePullRow, SYNCED_TABLES } from "../pullConvergence";
import { createSqliteHarness } from "../../repositories/__tests__/sqliteHarness";

describe("recurring spending confirmation pull convergence", () => {
  it.each([null, 1])("maps server IQR fields when the local evaluation version is %s", async (version) => {
    const confirmedAt = "2026-10-21T14:30:00.000Z";
    const row = normalizePullRow("anomaly_evaluations", {
      id: "evaluation-1", user_id: "user-1", transaction_id: "groceries-1",
      subcategory_id: "groceries", amount_centavos: 244037,
      history_days: 24, raw_anomaly_score: 2.5,
      feature_vector: { usual_spending_centavos: 140000, lower_bound_centavos: 90000, upper_bound_centavos: 210000 },
      baseline_snapshot: { scope: "category_iqr" },
      model_version: "personal-transaction-iqr-local-v2.4.0",
      evaluated_at: confirmedAt, confirmed_recurring_at: confirmedAt,
      version: 2, deleted: false, created_at: confirmedAt, updated_at: confirmedAt,
    }, "user-1");

    // A server row from before the recurrence column still reads as a frequent answer.
    expect(row).toMatchObject({
      confirmed_recurring_at: confirmedAt, recurrence: "frequent", usable_history_count: 24,
      usual_spending_centavos: 140000, lower_bound_centavos: 90000,
      upper_bound_centavos: 210000, severity: 2.5,
    });
    const db = { getFirstAsync: jest.fn(async () => version === null ? null : { version, user_id: "user-1" }), runAsync: jest.fn<(...args: any[]) => any>(async () => ({ changes: 1 })) };
    await applyPullRow(db as never, "anomaly_evaluations", row);
    expect(db.runAsync.mock.calls[0]).not.toContain(undefined);
    expect(db.runAsync.mock.calls[0]).toContain(confirmedAt);
    expect(db.runAsync.mock.calls[0]).toContain("frequent");
  });

  it("keeps a yearly answer, which has no frequent confirmation", () => {
    const row = normalizePullRow("anomaly_evaluations", {
      id: "evaluation-2", user_id: "user-1", transaction_id: "tuition-1", subcategory_id: "tuition",
      amount_centavos: 3_000_000, recurrence: "yearly", confirmed_recurring_at: null,
      version: 2, deleted: false,
    }, "user-1");

    expect(row).toMatchObject({ recurrence: "yearly", confirmed_recurring_at: null, recurrence_months: null });
  });

  it("stores the months a yearly answer comes back in as JSON", () => {
    const row = normalizePullRow("anomaly_evaluations", {
      id: "evaluation-3", user_id: "user-1", transaction_id: "tuition-2", subcategory_id: "tuition",
      amount_centavos: 3_000_000, recurrence: "yearly", recurrence_months: [6, 11], confirmed_recurring_at: null,
      version: 2, deleted: false,
    }, "user-1");

    expect(row).toMatchObject({ recurrence: "yearly", recurrence_months: "[6,11]" });
  });
});

describe("credit-card cycle pull convergence", () => {
  it("does not update immutable dates on a recorded cycle", async () => {
    const db = {
      getFirstAsync: jest.fn(async () => ({ version: 1, user_id: "user-1", statement_date: "2026-02-01" })),
      runAsync: jest.fn<(...args: any[]) => any>(async () => ({ changes: 1 })),
    };

    await applyPullRow(db as never, "credit_card_cycles", {
      id: "cycle-1", user_id: "user-1", account_id: "card-1",
      cycle_start_date: "2026-01-01", cutoff_date: "2026-01-31", statement_date: "2026-02-02",
      version: 2, deleted: 0, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-02-02T00:00:00.000Z",
      last_synced_at: "2026-02-02T00:00:00.000Z",
    });

    const sql = String(db.runAsync.mock.calls[0]?.[0]);
    expect(sql).not.toContain('"cycle_start_date" = ?');
    expect(sql).not.toContain('"cutoff_date" = ?');
    expect(sql).toContain('"statement_date" = ?');
  });
});

describe("legacy taxonomy pull convergence", () => {
  it("retains a category's non-essential classification", async () => {
    const row = normalizePullRow("categories", {
      id: "alcohol-tobacco",
      user_id: "user-1",
      slug: "alcohol_tobacco",
      label: "Alcoholic Beverages and Tobacco",
      short_label: "Alcohol/Tobacco",
      description: "Alcohol and tobacco products.",
      classification: "non_essential",
      is_system: false,
      is_filipino_context: false,
      minimum_amount_centavos: null,
      always_in_budget: false,
      fixed_amount_centavos: null,
      sort_order: 110,
      is_active: true,
      metadata: {},
      version: 2,
      deleted: false,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    }, "user-1");
    expect(row.classification).toBe("non_essential");

    const db = { getFirstAsync: jest.fn(async () => null), runAsync: jest.fn<(...args: any[]) => any>(async () => ({ changes: 1 })) };
    await applyPullRow(db as never, "categories", row);

    expect(String(db.runAsync.mock.calls[0]?.[0])).toContain("classification");
    expect(db.runAsync.mock.calls[0]).toContain("non_essential");
  });
});

describe("debt account pull convergence", () => {
  it("serializes debt JSON fields before inserting the remote record", async () => {
    const row = normalizePullRow("debt_accounts", {
      id: "debt-1", user_id: "user-1", linked_account_id: null, name: "Car loan", lender_name: "Bank",
      preset_key: "auto_loan", status: "active", original_balance_centavos: 500000,
      current_balance_centavos: 450000, annual_interest_rate_bps: 650, minimum_payment_centavos: 15000,
      payment_frequency: "monthly", next_due_date: "2026-10-01", maturity_date: null,
      target_payoff_date: null, interest_period: "annual", interest_method: "diminishing_balance",
      preset_data: { startDate: "2026-01-01" }, payment_schedule: { termMonths: 48 }, notes: null,
      paid_off_at: null, archived_at: null, version: 1, deleted: false,
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    }, "user-1");
    expect(row.allows_extra_payments).toBe(0);
    const db = { getFirstAsync: jest.fn(async () => null), runAsync: jest.fn<(...args: any[]) => any>(async () => ({ changes: 1 })) };

    await applyPullRow(db as never, "debt_accounts", row);

    const args = db.runAsync.mock.calls[0] ?? [];
    expect(String(args[0])).toContain('INSERT INTO "debt_accounts"');
    expect(args).toContain("{\"startDate\":\"2026-01-01\"}");
    expect(args).toContain("{\"termMonths\":48}");
  });

  it("soft-deletes a pulled debt without writing an unrelated is_active column", async () => {
    const db = { getFirstAsync: jest.fn(async () => ({ version: 1, user_id: "user-1" })), runAsync: jest.fn<(...args: any[]) => any>(async () => ({ changes: 1 })) };
    await applyPullRow(db as never, "debt_accounts", { id: "debt-1", user_id: "user-1", version: 2, deleted: true });
    expect(String(db.runAsync.mock.calls[0]?.[0])).toContain("status = 'deleted'");
    expect(String(db.runAsync.mock.calls[0]?.[0])).not.toContain("is_active");
  });
});

describe("credit-card payment pull convergence", () => {
  it("soft-deletes a payment without writing an unrelated is_active column", async () => {
    const db = { getFirstAsync: jest.fn(async () => ({ version: 1, user_id: "user-1" })), runAsync: jest.fn<(...args: any[]) => any>(async () => ({ changes: 1 })) };
    await applyPullRow(db as never, "credit_card_payments", { id: "payment-1", user_id: "user-1", version: 2, deleted: true });
    const sql = String(db.runAsync.mock.calls[0]?.[0]);
    expect(sql).toContain("deleted = 1");
    expect(sql).not.toContain("is_active");
  });
});

it("serializes optional savings interest reference metadata without changing calculation fields", () => {
  const interest_reference = { balanceBasis: "daily_balance", method: "compound", rateStructure: "tiered", notes: null };
  const row = normalizePullRow("savings_account_details", { account_id: "account-1", user_id: "user-1", interest_reference, interest_calculation_basis: null }, "user-1");
  expect(row.interest_reference_json).toBe(JSON.stringify(interest_reference));
  expect(row.interest_calculation_basis).toBeNull();
  expect(normalizePullRow("savings_account_details", { account_id: "account-1", user_id: "user-1", interest_reference: null }, "user-1").interest_reference_json).toBeNull();
});

describe("pull column lists", () => {
  it("only write columns that exist in the local schema", async () => {
    const harness = createSqliteHarness();
    await harness.migrateAll();
    const missing = SYNCED_TABLES.flatMap((table) => {
      const local = new Set((harness.sqlite.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[]).map((column) => column.name));
      return Object.keys(normalizePullRow(table, {}, "user-1")).filter((column) => !local.has(column)).map((column) => `${table}.${column}`);
    });
    expect(missing).toEqual([]);
  });
});
