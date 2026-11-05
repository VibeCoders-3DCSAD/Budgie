import { jest } from "@jest/globals";
import { createSqliteHarness } from "../../__tests__/sqliteHarness";

const mockInitDatabase = jest.fn<(...args: any[]) => any>();
const mockEnqueueOperation = jest.fn<(...args: any[]) => any>();
const mockEnsureCurrentCreditCardCycles = jest.fn<(...args: any[]) => any>();
const mockRandomUUID = jest.fn(() => "transaction-1");

jest.mock("../../../client", () => ({ initDatabase: () => mockInitDatabase() }));
jest.mock("../../../helpers", () => ({
  LocalDbError: class LocalDbError extends Error {},
  enqueueOperation: (...args: any[]) => mockEnqueueOperation(...args),
}));
jest.mock("../../../uuid", () => ({ randomUUID: () => mockRandomUUID() }));
jest.mock("../../credit-cards/creditCardCycles", () => ({
  ensureCurrentCreditCardCycles: (...args: any[]) => mockEnsureCurrentCreditCardCycles(...args),
}));

describe("credit-card expense inserts", () => {
  beforeEach(() => {
    jest.resetModules();
    mockInitDatabase.mockReset();
    mockEnqueueOperation.mockReset().mockResolvedValue({ operation_id: "sync-1" });
    mockEnsureCurrentCreditCardCycles.mockReset();
  });

  test("binds every transaction column when creating an expense", async () => {
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes("kind = 'credit_card'")) return { id: "account-1", kind: "credit_card", current_balance_centavos: 0 };
        if (sql.includes("FROM credit_card_cycles")) return { id: "cycle-1" };
        if (sql.includes("FROM subcategories")) return { id: "subcategory-1" };
        if (sql.includes("FROM transactions")) return {
          id: "transaction-1", transaction_type: "expense", status: "posted", entry_source: "manual",
          transaction_date: "2026-09-07", posted_at: null, credit_card_posting_date: null,
          amount_centavos: 1000, subcategory_id: "subcategory-1", source_account_id: "account-1",
          destination_account_id: null, recurring_template_id: null, merchant_name: null,
          counterparty_name: null, notes: null, client_mutation_id: null,
        };
        return { id: "account-1", kind: "credit_card", current_balance_centavos: 0 };
      }),
      getAllAsync: jest.fn(async () => []),
      runAsync: jest.fn(async () => ({ changes: 1 })),
      withTransactionAsync: jest.fn(async (work: (tx: unknown) => Promise<void>) => work(db)),
    };
    mockInitDatabase.mockResolvedValue(db);

    const { createExpense } = await import("../ledger");
    await createExpense("user-1", "device-1", {
      amount_centavos: 1000,
      source_account_id: "account-1",
      subcategory_id: "subcategory-1",
      transaction_date: "2026-09-07",
      client_mutation_id: "mutation-1",
    });

    const runCalls = db.runAsync.mock.calls as unknown[][];
    const insert = runCalls.find(([sql]) => String(sql).includes("INSERT INTO transactions"));
    const sql = String(insert?.[0]);
    const columns = sql.match(/\(([^)]+)\)\s*VALUES/)?.[1]?.split(",").length;
    const values = sql.match(/VALUES\s*\(([^)]+)\)/)?.[1]?.split(",").length;
    expect(values).toBe(columns);
    expect(insert).toBeDefined();
    expect(insert!.length - 1).toBe((sql.match(/\?/g) ?? []).length);

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("SET available_credit_centavos = COALESCE(available_credit_centavos, credit_limit_centavos) - ?"),
      1000,
      expect.any(String),
      "account-1",
      "user-1",
    );

    const creditUpdate = runCalls.find(([sql]) => String(sql).includes("SET available_credit_centavos"));
    expect(creditUpdate?.[0]).not.toContain("available_credit_centavos, credit_limit_centavos) >= ?");
  });

  test("creates an installment before its linked credit-card relationship", async () => {
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes("kind = 'credit_card'")) return { id: "account-1", kind: "credit_card", current_balance_centavos: 0 };
        if (sql.includes("FROM credit_card_cycles")) return { id: "cycle-1" };
        if (sql.includes("FROM subcategories")) return { id: "subcategory-1" };
        if (sql.includes("FROM transactions")) return {
          id: "transaction-1", transaction_type: "expense", status: "posted", entry_source: "manual",
          transaction_date: "2026-09-07", posted_at: null, credit_card_posting_date: null,
          amount_centavos: 120000, subcategory_id: "subcategory-1", source_account_id: "account-1",
          destination_account_id: null, recurring_template_id: null, merchant_name: "Laptop",
          counterparty_name: null, notes: null, client_mutation_id: null,
        };
        if (sql.includes("FROM credit_card_installments")) return {
          id: "installment-1", user_id: "user-1", account_id: "account-1", transaction_id: "transaction-1",
          description: "Laptop", original_principal_centavos: 120000, remaining_principal_centavos: 120000,
          term_months: 12, remaining_months: 12, monthly_amortization_centavos: 10000,
          interest_rate_bps: 0, interest_type: "zero_interest", settlement_status: "active", version: 1,
          deleted: 0, created_at: "now", updated_at: "now",
        };
        return { id: "account-1", kind: "credit_card", current_balance_centavos: 0 };
      }),
      getAllAsync: jest.fn(async () => []),
      runAsync: jest.fn(async () => ({ changes: 1 })),
      withTransactionAsync: jest.fn(async (work: (tx: unknown) => Promise<void>) => work(db)),
    };
    mockRandomUUID.mockImplementationOnce(() => "transaction-1").mockImplementationOnce(() => "installment-1");
    mockInitDatabase.mockResolvedValue(db);

    const { createExpense } = await import("../ledger");
    await createExpense("user-1", "device-1", {
      amount_centavos: 120000, source_account_id: "account-1", subcategory_id: "subcategory-1", transaction_date: "2026-09-07",
      merchant_name: "Laptop",
      installment: {
        description: "Laptop", original_principal_centavos: 120000, remaining_principal_centavos: 120000,
        term_months: 12, remaining_months: 12, monthly_amortization_centavos: 10000,
        interest_type: "zero_interest", settlement_status: "active",
      },
    });

    const runCalls = db.runAsync.mock.calls as unknown[][];
    const insertIndex = runCalls.findIndex(([sql]) => String(sql).includes("INSERT INTO credit_card_installments"));
    const relationshipIndex = runCalls.findIndex(([sql]) => String(sql).includes("INSERT INTO credit_card_transactions"));
    expect(insertIndex).toBeGreaterThan(-1);
    expect(relationshipIndex).toBeGreaterThan(insertIndex);
    expect(runCalls[relationshipIndex]?.[1]).toBe("transaction-1");
    expect(runCalls[relationshipIndex]?.[5]).toBe("installment");
    expect(mockEnqueueOperation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entity: "credit_card_installments" }));
    expect(mockEnqueueOperation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity: "credit_card_transactions", payload: expect.objectContaining({ purchase_type: "installment", installment_id: "installment-1" }),
    }));
  });

  test("moves a credit-card purchase to the cycle containing its edited date", async () => {
    const transaction = {
      id: "transaction-1", transaction_type: "expense", status: "posted", entry_source: "manual",
      transaction_date: "2026-09-07", posted_at: null, credit_card_posting_date: null,
      amount_centavos: 1000, subcategory_id: "subcategory-1", source_account_id: "account-1",
      destination_account_id: null, recurring_template_id: null, merchant_name: null,
      counterparty_name: null, notes: null, client_mutation_id: null, version: 1,
    };
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes("FROM credit_card_payments")) return null;
        if (sql.includes("FROM debt_payments")) return null;
        if (sql.includes("FROM scheduled_payment_records")) return null;
        if (sql.includes("FROM credit_card_transactions")) return { account_id: "account-1", cycle_id: "cycle-september", version: 1 };
        if (sql.includes("FROM credit_card_cycles")) return { id: "cycle-august" };
        if (sql.includes("FROM transactions")) return transaction;
        return { id: "account-1", kind: "credit_card", current_balance_centavos: 0 };
      }),
      getAllAsync: jest.fn(async () => []),
      runAsync: jest.fn(async () => ({ changes: 1 })),
      withTransactionAsync: jest.fn(async (work: (tx: unknown) => Promise<void>) => work(db)),
    };
    mockInitDatabase.mockResolvedValue(db);

    const { updateTransaction } = await import("../ledger");
    await updateTransaction("user-1", "device-1", "transaction-1", {
      transaction_date: "2026-09-01",
    });

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE credit_card_transactions SET cycle_id = ?"),
      "cycle-august",
      expect.any(String),
      "transaction-1",
      "user-1",
    );
    expect(mockEnqueueOperation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity: "credit_card_transactions",
      recordId: "transaction-1",
      operationType: "update",
      baseVersion: 1,
      changedFields: ["cycle_id"],
      payload: { cycle_id: "cycle-august" },
    }));
  });
});

describe("transaction list pagination", () => {
  beforeEach(() => {
    jest.resetModules();
    mockInitDatabase.mockReset();
  });

  test.each([null, "Monthly savings"])("names savings contributions after their goal with notes %s", async (notes) => {
    const harness = createSqliteHarness();
    try {
      await harness.migrateAll();
      mockInitDatabase.mockResolvedValue(harness.db);
      harness.sqlite.exec(`
        INSERT INTO savings_goals (id, user_id, name, target_amount_centavos, created_at, updated_at)
        VALUES ('goal-1', 'user-1', 'Emergency Fund', 100000, 'now', 'now');
      `);
      harness.sqlite.prepare(`INSERT INTO transactions
        (id, user_id, transaction_type, transaction_date, amount_centavos, destination_savings_goal_id, notes, created_at, updated_at)
        VALUES ('contribution-1', 'user-1', 'transfer', '2026-10-22', 1000, 'goal-1', ?, 'now', 'now')`).run(notes);
      const { listTransactions } = await import("../ledger");

      expect(await listTransactions("user-1")).toEqual([
        expect.objectContaining({ id: "contribution-1", name: "Contribution to Emergency Fund" }),
      ]);
      expect(await listTransactions("user-2")).toEqual([]);

      harness.sqlite.exec("UPDATE savings_goals SET name = 'Vacation', status = 'archived' WHERE id = 'goal-1'");
      expect((await listTransactions("user-1"))[0]?.name).toBe("Contribution to Vacation");

      harness.sqlite.exec("UPDATE savings_goals SET user_id = 'user-2' WHERE id = 'goal-1'");
      expect((await listTransactions("user-1"))[0]?.name).not.toContain("Vacation");
    } finally {
      harness.sqlite.close();
    }
  });

  test("returns only list fields with joined display labels", async () => {
    const db = { getAllAsync: jest.fn(async () => []) };
    mockInitDatabase.mockResolvedValue(db);

    const { listTransactions } = await import("../ledger");
    await listTransactions("user-1", { limit: 50, offset: 100, sort_by: "transaction_date", sort_dir: "desc" });

    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("COALESCE('Contribution to ' || g.name, NULLIF(t.merchant_name, ''), NULLIF(t.counterparty_name, ''), NULLIF(t.notes, ''), s.label, 'Transaction') AS name"),
      "user-1",
    );
    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("LEFT JOIN subcategories s"),
      "user-1",
    );
    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("LEFT JOIN financial_accounts a"),
      "user-1",
    );
    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY t.transaction_date desc, t.created_at desc, t.rowid desc LIMIT 50 OFFSET 100"),
      "user-1",
    );
  });

  test("seeks past the previous page's last row instead of using an offset", async () => {
    const db = { getAllAsync: jest.fn(async () => []) };
    mockInitDatabase.mockResolvedValue(db);

    const { listTransactions } = await import("../ledger");
    await listTransactions("user-1", {
      limit: 25,
      offset: 100,
      sort_by: "amount_centavos",
      sort_dir: "asc",
      after: { transaction_date: "2026-10-01", amount_centavos: 5000, created_at: "2026-10-01T00:00:00Z", row_id: 42 },
    });

    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("AND (t.amount_centavos, t.created_at, t.rowid) > (?, ?, ?) ORDER BY t.amount_centavos asc, t.created_at asc, t.rowid asc LIMIT 25 OFFSET 0"),
      "user-1",
      5000,
      "2026-10-01T00:00:00Z",
      42,
    );
  });

  test("returns category icon and color, falling back to the parent category", async () => {
    const db = { getAllAsync: jest.fn(async () => []) };
    mockInitDatabase.mockResolvedValue(db);

    const { listTransactions } = await import("../ledger");
    await listTransactions("user-1");

    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("COALESCE(s.icon_key, c.icon_key) AS icon_key"),
      "user-1",
    );
    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("LEFT JOIN categories c ON c.id = COALESCE(t.category_id, s.category_id)"),
      "user-1",
    );
  });

  test("totals every matching row with the same filters as the list", async () => {
    const db = { getFirstAsync: jest.fn(async () => ({ income_centavos: 1000, expense_centavos: 400 })) };
    mockInitDatabase.mockResolvedValue(db);

    const { getTransactionTotals } = await import("../ledger");
    const totals = await getTransactionTotals("user-1", { category_id: "category-1", from_date: "2026-10-01", limit: 25 });

    expect(totals).toEqual({ income_centavos: 1000, expense_centavos: 400 });
    const [sql, ...params] = (db.getFirstAsync.mock.calls[0] as unknown[]);
    expect(sql).toContain("category_filter.category_id = ? AND");
    expect(sql).toContain("AND t.transaction_date >= ?");
    expect(sql).not.toContain("LIMIT");
    expect(params).toEqual(["user-1", "category-1", "2026-10-01"]);
  });

  test("filters transactions by their parent category", async () => {
    const db = { getAllAsync: jest.fn(async () => []) };
    mockInitDatabase.mockResolvedValue(db);

    const { listTransactions } = await import("../ledger");
    await listTransactions("user-1", { category_id: "category-1" });

    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("category_filter.category_id = ?"),
      "user-1",
      "category-1",
    );
  });
});
