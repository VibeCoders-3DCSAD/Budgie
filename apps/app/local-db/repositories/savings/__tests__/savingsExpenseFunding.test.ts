import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type * as SQLite from "expo-sqlite";
import m012 from "../../../migrations/012_ledger_tables";
import m051 from "../../../migrations/051_savings_goals";
import m053 from "../../../migrations/053_savings_goal_model";
import m084 from "../../../migrations/084_savings_goal_account_link";
import m086 from "../../../migrations/086_expense_savings_funding";
import m087 from "../../../migrations/087_savings_goal_emergency_flag";
import m088 from "../../../migrations/088_settle_scheduled_payment_occurrence";
import m093 from "../../../migrations/093_remove_savings_goal_type";
import { createExpense, createSavingsGoalTransfer, updateTransaction, deleteTransaction, listSavingsAccountMovements } from "../../ledger/ledger";
import { listSavingsContributionGoals } from "../savingsGoalContributions";
import { readSavingsExpenseFunding } from "../savingsExpenseFunding";

let mockSqlite: DatabaseSync;
const mockDb = {
  execAsync: async (sql: string) => { mockSqlite.exec(sql); },
  runAsync: async (sql: string, ...args: SQLInputValue[]) => mockSqlite.prepare(sql).run(...args),
  getFirstAsync: async (sql: string, ...args: SQLInputValue[]) => mockSqlite.prepare(sql).get(...args) ?? null,
  getAllAsync: async (sql: string, ...args: SQLInputValue[]) => mockSqlite.prepare(sql).all(...args),
  withTransactionAsync: async (callback: () => Promise<void>) => {
    mockSqlite.exec("BEGIN");
    try { await callback(); mockSqlite.exec("COMMIT"); } catch (error) { mockSqlite.exec("ROLLBACK"); throw error; }
  },
};
jest.mock("../../../client", () => ({ initDatabase: async () => mockDb }));
const expense = { source_account_id: "account", amount_centavos: 700_000, subcategory_id: "food", transaction_date: "2026-10-21" };
const split = [
  { savings_goal_id: "emergency", amount_centavos: 120_000, id: "activity-1" },
  { savings_goal_id: "travel", amount_centavos: 80_000, id: "activity-2" },
] as const;
const funding = (amount = expense.amount_centavos, id?: string) => readSavingsExpenseFunding(mockDb as unknown as SQLite.SQLiteDatabase, "user", "account", amount, id);
function balance() { return mockSqlite.prepare("SELECT current_balance_centavos AS amount FROM financial_accounts WHERE id = 'account'").get()?.amount; }
function activities() { return mockSqlite.prepare("SELECT savings_goal_id, amount_centavos FROM savings_goal_activities WHERE deleted = 0 ORDER BY savings_goal_id").all(); }

describe("linked savings funding", () => {
  beforeEach(async () => {
    mockSqlite = new DatabaseSync(":memory:");
    mockSqlite.exec(`
      CREATE TABLE financial_accounts (id text PRIMARY KEY, user_id text, name text, kind text, status text, deleted integer DEFAULT 0, current_balance_centavos integer);
      INSERT INTO financial_accounts VALUES ('account', 'user', 'Bank', 'bank', 'active', 0, 2000000), ('second', 'user', 'Other bank', 'bank', 'active', 0, 1000000);
      CREATE TABLE subcategories (id text, user_id text, deleted integer, is_active integer, kind text);
      INSERT INTO subcategories VALUES ('food', 'user', 0, 1, 'expense');
      CREATE TABLE sync_queue (operation_id text, user_id text, device_id text, entity text, record_id text, operation_type text, base_version integer, changed_fields text, payload text, failure_message text, status text, attempts integer, created_at text);
      CREATE TABLE credit_card_payments (id text, user_id text, transaction_id text, deleted integer);
      CREATE TABLE debt_payments (id text, user_id text, transaction_id text, deleted integer);
      CREATE TABLE scheduled_payment_records (id text, user_id text, transaction_id text, deleted integer, scheduled_payment_id text, occurrence_date text, payment_date text, amount_centavos integer, source text, notes text, version integer);
      CREATE TABLE credit_card_transactions (transaction_id text, user_id text, account_id text, cycle_id text, purchase_type text, deleted integer, version integer);
    `);
    for (const migration of [m012, m051, m053, m084, m086, m087, m088, m093]) await migration.up(mockDb as unknown as SQLite.SQLiteDatabase);
    mockSqlite.exec(`
      ALTER TABLE transactions ADD COLUMN credit_card_posting_date text;
      INSERT INTO savings_goals (id, user_id, name, is_emergency_fund, target_amount_centavos, starting_amount_centavos, priority, status, created_at, updated_at, linked_account_id)
      VALUES ('emergency', 'user', 'Emergency', 1, 2000000, 1000000, 'high', 'active', 'now', 'now', 'account'),
        ('travel', 'user', 'Travel', 0, 1000000, 500000, 'high', 'active', 'now', 'now', 'account'),
        ('foreign', 'other-user', 'Foreign', 0, 1000000, 900000, 'high', 'active', 'now', 'now', 'account');
    `);
  });
  afterEach(() => mockSqlite.close());

  it("contributes unallocated money without reducing the linked account balance", async () => {
    const result = await createSavingsGoalTransfer("user", "device", { savings_goal_id: "travel", kind: "contribution", account_id: "account", amount_centavos: 100_000, transaction_date: "2026-10-21" });
    expect(result.transaction.destination_account_id).toBe("account");
    expect(result.transaction.source_account_id).toBe("account");
    expect(balance()).toBe(2_000_000);
    expect((await funding()).unallocatedCentavos).toBe(400_000);
  });

  it("transfers a contribution from another account into the fixed linked account", async () => {
    const result = await createSavingsGoalTransfer("user", "device", { savings_goal_id: "travel", kind: "contribution", account_id: "second", amount_centavos: 100_000, transaction_date: "2026-10-21" });
    expect(result.transaction.destination_account_id).toBe("account");
    expect(balance()).toBe(2_100_000);
    expect(mockSqlite.prepare("SELECT current_balance_centavos AS amount FROM financial_accounts WHERE id = 'second'").get()?.amount).toBe(900_000);
  });

  it("rejects contributions beyond unallocated funds or from another goal's reserved money", async () => {
    await expect(createSavingsGoalTransfer("user", "device", { savings_goal_id: "travel", kind: "contribution", account_id: "account", amount_centavos: 500_001, transaction_date: "2026-10-21" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    mockSqlite.exec("UPDATE savings_goals SET linked_account_id = 'second', starting_amount_centavos = 950000 WHERE id = 'emergency'");
    await expect(createSavingsGoalTransfer("user", "device", { savings_goal_id: "travel", kind: "contribution", account_id: "second", amount_centavos: 100_000, transaction_date: "2026-10-21" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(balance()).toBe(2_000_000);
    expect(mockSqlite.prepare("SELECT count(*) AS count FROM transactions").get()?.count).toBe(0);
  });

  it("keeps the destination fixed on edit and restores an allocation without changing cash on delete", async () => {
    const { transaction, operation } = await createSavingsGoalTransfer("user", "device", { savings_goal_id: "travel", kind: "contribution", account_id: "account", amount_centavos: 100_000, transaction_date: "2026-10-21" });
    expect(operation.payload.savings_goal_contribution).toEqual(expect.objectContaining({ savings_goal_id: "travel" }));
    expect(mockSqlite.prepare("SELECT count(*) AS count FROM sync_queue").get()?.count).toBe(1);
    expect(await listSavingsAccountMovements("user", "account")).toEqual([]);
    await expect(updateTransaction("user", "device", transaction.id, { destination_account_id: "second" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await updateTransaction("user", "device", transaction.id, { amount_centavos: 200_000 });
    expect(balance()).toBe(2_000_000);
    expect((await funding()).unallocatedCentavos).toBe(300_000);
    await deleteTransaction("user", "device", transaction.id);
    expect(balance()).toBe(2_000_000);
    expect((await funding()).unallocatedCentavos).toBe(500_000);
    expect(activities()).toEqual([]);
  });

  it("restores both cash balances when an external contribution is deleted", async () => {
    const { transaction } = await createSavingsGoalTransfer("user", "device", { savings_goal_id: "travel", kind: "contribution", account_id: "second", amount_centavos: 100_000, transaction_date: "2026-10-21" });
    await deleteTransaction("user", "device", transaction.id);
    expect(balance()).toBe(2_000_000);
    expect(mockSqlite.prepare("SELECT current_balance_centavos AS amount FROM financial_accounts WHERE id = 'second'").get()?.amount).toBe(1_000_000);
    expect(activities()).toEqual([]);
  });

  it.each(["foreign", "missing"])("rejects unavailable contribution goal %s", async (savings_goal_id) => {
    await expect(createSavingsGoalTransfer("user", "device", { savings_goal_id, kind: "contribution", account_id: "account", amount_centavos: 100_000, transaction_date: "2026-10-21" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(balance()).toBe(2_000_000);
    expect(activities()).toEqual([]);
  });

  it("shares one free pool across goals and ignores another user's money", async () => {
    expect(await funding()).toMatchObject({ unallocatedCentavos: 500_000, requiredWithdrawalCentavos: 200_000 });
    expect((await funding()).goals).toHaveLength(2);
    await createExpense("user", "device", { ...expense, amount_centavos: 300_000 });
    expect(balance()).toBe(1_700_000);
    expect(activities()).toEqual([]);
    expect((await funding(100_000)).unallocatedCentavos).toBe(200_000);
  });

  it("requires an explicit exact split and rolls back failures", async () => {
    await expect(createExpense("user", "device", expense)).rejects.toMatchObject({ code: "SAVINGS_FUNDING_REQUIRED" });
    expect(balance()).toBe(2_000_000);
    expect(mockSqlite.prepare("SELECT count(*) AS count FROM transactions").get()?.count).toBe(0);
    expect(mockSqlite.prepare("SELECT count(*) AS count FROM sync_queue").get()?.count).toBe(0);
  });

  it("withdraws only from selected goals and queues one atomic expense", async () => {
    const { operation } = await createExpense("user", "device", { ...expense, savings_goal_withdrawals: [...split] });
    expect(balance()).toBe(1_300_000);
    expect(activities()).toEqual(split.map(({ savings_goal_id, amount_centavos }) => ({ savings_goal_id, amount_centavos })));
    expect(operation.payload.savings_goal_withdrawals).toEqual(split);
    expect(mockSqlite.prepare("SELECT count(*) AS count FROM sync_queue").get()?.count).toBe(1);
  });

  it.each([
    [{ ...split[0], savings_goal_id: "foreign", amount_centavos: 200_000 }],
    [{ ...split[0], amount_centavos: -1 }],
    [{ ...split[0], amount_centavos: 100_000 }, { ...split[0], id: "duplicate-goal", amount_centavos: 100_000 }],
    [{ ...split[0], amount_centavos: 1_000_001 }],
    [{ ...split[0], amount_centavos: 200_001 }],
  ])("rejects invalid splits %#", async (...withdrawals) => {
    await expect(createExpense("user", "device", { ...expense, savings_goal_withdrawals: withdrawals })).rejects.toBeDefined();
    expect(balance()).toBe(2_000_000);
    expect(activities()).toEqual([]);
  });

  it("replaces the split on edit and restores every goal when deleted", async () => {
    const { transaction } = await createExpense("user", "device", { ...expense, savings_goal_withdrawals: [...split] });
    expect((await funding(600_000, transaction.id)).requiredWithdrawalCentavos).toBe(100_000);
    await updateTransaction("user", "device", transaction.id, { amount_centavos: 600_000, savings_goal_withdrawals: [{ ...split[1], amount_centavos: 100_000, id: "replacement" }] });
    expect(balance()).toBe(1_400_000);
    expect(activities()).toEqual([{ savings_goal_id: "travel", amount_centavos: 100_000 }]);
    const existingId = mockSqlite.prepare("SELECT id FROM savings_goal_activities WHERE savings_goal_id = 'travel' AND deleted = 0").get()?.id;
    await updateTransaction("user", "device", transaction.id, { amount_centavos: 300_000, savings_goal_withdrawals: [] });
    expect(activities()).toEqual([]);
    await updateTransaction("user", "device", transaction.id, { amount_centavos: 600_000, savings_goal_withdrawals: [{ ...split[1], amount_centavos: 100_000, id: "new-request-id" }] });
    expect(mockSqlite.prepare("SELECT id FROM savings_goal_activities WHERE savings_goal_id = 'travel' AND deleted = 0").get()?.id).toBe(existingId);
    await deleteTransaction("user", "device", transaction.id);
    expect(balance()).toBe(2_000_000);
    expect(activities()).toEqual([]);
  });

  it("can change just the selected goals without changing the expense amount", async () => {
    const { transaction } = await createExpense("user", "device", { ...expense, savings_goal_withdrawals: [...split] });
    const result = await updateTransaction("user", "device", transaction.id, { savings_goal_withdrawals: [{ ...split[1], amount_centavos: 200_000 }] });
    expect(balance()).toBe(1_300_000);
    expect(activities()).toEqual([{ savings_goal_id: "travel", amount_centavos: 200_000 }]);
    expect(result.operation.payload.notes).toBeNull();
    expect(result.operation.base_version).toBe(1);
    expect(mockSqlite.prepare("SELECT version FROM transactions WHERE id = ?").get(transaction.id)?.version).toBe(2);
  });

  it("clears withdrawals when reducing the expense to unallocated funds or moving accounts", async () => {
    const { transaction } = await createExpense("user", "device", { ...expense, savings_goal_withdrawals: [...split] });
    await updateTransaction("user", "device", transaction.id, { source_account_id: "second", savings_goal_withdrawals: [] });
    expect(balance()).toBe(2_000_000);
    expect(activities()).toEqual([]);
  });

  it("only lists this user's active goals linked to active eligible accounts", async () => {
    const options = await listSavingsContributionGoals("user");
    expect(options.map((goal) => goal.id).sort()).toEqual(["emergency", "travel"]);
    expect(await listSavingsContributionGoals("missing-user")).toEqual([]);
    mockSqlite.exec("UPDATE savings_goals SET status = 'archived' WHERE id = 'travel'");
    expect((await listSavingsContributionGoals("user")).map((goal) => goal.id)).toEqual(["emergency"]);
    mockSqlite.exec("UPDATE financial_accounts SET status = 'archived' WHERE id = 'account'");
    expect(await listSavingsContributionGoals("user")).toEqual([]);
  });

  it("reserves archived goals and reports an existing account shortfall", async () => {
    mockSqlite.exec("UPDATE savings_goals SET status = 'archived' WHERE id = 'travel'; UPDATE financial_accounts SET current_balance_centavos = 1400000 WHERE id = 'account'");
    expect(await funding(10_000)).toMatchObject({ existingShortfallCentavos: 100_000, requiredWithdrawalCentavos: 10_000 });
  });
});
