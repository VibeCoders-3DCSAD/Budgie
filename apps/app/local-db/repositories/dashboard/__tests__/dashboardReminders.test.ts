import { jest } from "@jest/globals";
import { createSqliteHarness } from "../../__tests__/sqliteHarness";

const mockInitDatabase = jest.fn<() => Promise<unknown>>();
jest.mock("../../../client", () => ({ initDatabase: () => mockInitDatabase() }));
let harness: ReturnType<typeof createSqliteHarness>;

beforeEach(async () => {
  jest.resetModules();
  harness = createSqliteHarness();
  await harness.migrateAll();
  mockInitDatabase.mockResolvedValue(harness.db);
  harness.sqlite.exec(`
    INSERT INTO financial_accounts (id, user_id, name, kind, current_balance_centavos, created_at, updated_at) VALUES
      ('bank', 'u1', 'Payroll', 'bank', 100, 'now', 'now'), ('foreign', 'u2', 'Private bank', 'bank', 0, 'now', 'now');
    INSERT INTO subcategories (id, user_id, kind, slug, label, description, created_at, updated_at)
      VALUES ('salary', 'u1', 'income', 'salary', 'Salary', 'Salary', 'now', 'now');
  `);
});
afterEach(() => harness.sqlite.close());

async function income(day: number, name = "Salary") {
  const { createIncomeSource } = await import("../../foundations/financialFoundations");
  return (await createIncomeSource("u1", "device", { name, frequency: "monthly", destinationAccountId: "bank", subcategoryId: "salary", expectedAmountCentavos: 50_000, paydayDayOfMonth: day, nextExpectedDate: "2026-10-01" })).source;
}
function bill(id = "bill", userId = "u1", account = "bank") {
  harness.sqlite.prepare(`INSERT INTO scheduled_payments (id, user_id, name, source_account_id, amount_centavos, frequency, due_day_of_month, starts_on, auto_post, auto_post_from, created_at, updated_at)
    VALUES (?, ?, 'Electricity', ?, 1000, 'monthly', 22, '2026-10-01', 1, '2026-10-01', 'now', 'now')`).run(id, userId, account);
}
function contribution(id: string, amount: number, date: string) {
  harness.sqlite.prepare(`INSERT INTO savings_goal_activities (id, user_id, savings_goal_id, transaction_id, activity_kind, amount_centavos, activity_date, created_at, updated_at)
    VALUES (?, 'u1', 'goal', ?, 'contribution', ?, ?, 'now', 'now')`).run(id, id, amount, date);
}
function savings() {
  harness.sqlite.exec(`INSERT INTO savings_goals (id, user_id, name, target_amount_centavos, starting_amount_centavos, target_date, planned_contribution_amount_centavos, contribution_frequency, next_contribution_date, linked_account_id, created_at, updated_at)
    VALUES ('goal', 'u1', 'Tuition', 10000, 0, '2027-10-22', 1000, 'weekly', '2026-10-22', 'bank', 'now', 'now')`);
}

it("shows dates today through day seven, excludes day eight and past income, without changing balances", async () => {
  await income(22, "Today"); await income(29, "Seven days"); await income(30, "Eight days"); await income(21, "Past");
  const { getDashboardReminders } = await import("../dashboardReminders");
  const result = await getDashboardReminders("u1", "2026-10-22");
  expect(result.upcoming.unavailable).toBe(false);
  expect(result.upcoming.items.map((item) => [item.title, item.date])).toEqual([["Today", "2026-10-22"], ["Seven days", "2026-10-29"]]);
  expect(result.upcoming.items[0]).toMatchObject({ detail: "Expected income · Payroll", amountCentavos: 50000, target: { kind: "income" } });
  expect(harness.sqlite.prepare("SELECT current_balance_centavos FROM financial_accounts WHERE id = 'bank'").get()).toEqual({ current_balance_centavos: 100 });
});

it("removes recorded income, including a transaction pulled before its occurrence", async () => {
  const source = await income(22);
  const { recurringIncomePostIds } = await import("../../foundations/recurringIncome");
  const ids = recurringIncomePostIds(source.recurringTemplateId!, "2026-10-22");
  harness.sqlite.prepare(`INSERT INTO transactions (id, user_id, transaction_type, transaction_date, amount_centavos, created_at, updated_at) VALUES (?, 'u1', 'income', '2026-10-22', 50000, 'now', 'now')`).run(ids.transactionId);
  const { getDashboardReminders } = await import("../dashboardReminders");
  expect((await getDashboardReminders("u1", "2026-10-22")).upcoming.items).toEqual([]);
});

it("shows partial failed auto-posts with their source and removes resolved and archived items", async () => {
  bill(); bill("other", "u2", "foreign"); bill("bad-reference", "u1", "foreign");
  harness.sqlite.exec(`INSERT INTO scheduled_payment_records (id, user_id, scheduled_payment_id, transaction_id, occurrence_date, payment_date, amount_centavos, source, created_at, updated_at)
    VALUES ('partial', 'u1', 'bill', 'expense', '2026-10-22', '2026-10-22', 300, 'manual', 'now', 'now')`);
  const { getDashboardReminders } = await import("../dashboardReminders");
  const result = await getDashboardReminders("u1", "2026-10-22");
  expect(result.attention.unavailable).toBe(false);
  expect(result.attention.items).toMatchObject([{ amountCentavos: 700, detail: "Auto-post failed · Payroll has insufficient funds", target: { kind: "biller", id: "bill" } }]);
  harness.sqlite.exec("UPDATE financial_accounts SET current_balance_centavos = 1000 WHERE id = 'bank'");
  expect((await getDashboardReminders("u1", "2026-10-22")).attention.items).toEqual([]);
  harness.sqlite.exec("UPDATE financial_accounts SET current_balance_centavos = 0 WHERE id = 'bank'; UPDATE scheduled_payments SET status = 'archived' WHERE id = 'bill'");
  expect((await getDashboardReminders("u1", "2026-10-22")).attention.items).toEqual([]);
});

it("retains partial savings contributions and removes completed occurrences", async () => {
  savings(); contribution("partial", 300, "2026-10-22");
  const { getDashboardReminders } = await import("../dashboardReminders");
  const result = await getDashboardReminders("u1", "2026-10-22");
  expect(result.upcoming.unavailable).toBe(false);
  expect(result.upcoming.items).toMatchObject([{ date: "2026-10-22", amountCentavos: 700 }, { date: "2026-10-29", amountCentavos: 1000 }]);
  contribution("rest", 700, "2026-10-22");
  expect((await getDashboardReminders("u1", "2026-10-22")).upcoming.items).toMatchObject([{ date: "2026-10-29", amountCentavos: 1000 }]);
});

it("keeps available items while reporting a failed source", async () => {
  await income(22);
  const getAll = harness.db.getAllAsync;
  jest.spyOn(harness.db, "getAllAsync").mockImplementation(async (sql, ...values) => {
    if (sql.includes("FROM savings_goals")) throw new Error("database unavailable");
    return getAll(sql, ...values);
  });
  const { getDashboardReminders } = await import("../dashboardReminders");
  const result = await getDashboardReminders("u1", "2026-10-22");
  expect(result.upcoming.unavailable).toBe(true);
  expect(result.upcoming.items).toHaveLength(1);
  expect(result.attention).toEqual({ items: [], unavailable: false });
});

it("handles debt across a month boundary without applying this month's payment to next month", async () => {
  harness.sqlite.exec(`INSERT INTO debt_accounts (id, user_id, name, current_balance_centavos, minimum_payment_centavos, payment_frequency, next_due_date, created_at, updated_at)
    VALUES ('loan', 'u1', 'Loan', 9700, 1000, 'monthly', '2026-10-02', 'now', 'now');
    INSERT INTO transactions (id, user_id, transaction_type, transaction_date, amount_centavos, created_at, updated_at) VALUES ('debit', 'u1', 'expense', '2026-10-02', 300, 'now', 'now');
    INSERT INTO debt_payments (id, debt_account_id, user_id, transaction_id, source, payment_date, amount_centavos, principal_centavos, interest_centavos, created_at, updated_at)
    VALUES ('paid', 'loan', 'u1', 'debit', 'transaction', '2026-10-02', 300, 300, 0, 'now', 'now')`);
  const { getDashboardReminders } = await import("../dashboardReminders");
  expect((await getDashboardReminders("u1", "2026-10-02")).upcoming.items).toMatchObject([{ title: "Loan", date: "2026-10-02", amountCentavos: 700, target: { kind: "debt", id: "loan" } }]);
  expect((await getDashboardReminders("u1", "2026-10-28")).upcoming.items).toMatchObject([{ title: "Loan", date: "2026-11-02", amountCentavos: 1000 }]);
});

it("excludes other users' income schedules and invalid account references", async () => {
  await income(22);
  harness.sqlite.exec("UPDATE financial_accounts SET user_id = 'u2' WHERE id = 'bank'");
  const { getDashboardReminders } = await import("../dashboardReminders");
  expect((await getDashboardReminders("u1", "2026-10-22")).upcoming.items).toEqual([]);
});

it("surfaces saved observations, removes confirmed ones, and rejects foreign taxonomy", async () => {
  harness.sqlite.exec(`
    INSERT INTO subcategories (id, user_id, kind, slug, label, description, created_at, updated_at)
      VALUES ('foreign-category', 'u2', 'expense', 'private', 'Private category', 'Private', 'now', 'now');
    INSERT INTO transactions (id, user_id, transaction_type, transaction_date, amount_centavos, subcategory_id, created_at, updated_at) VALUES
      ('expense', 'u1', 'expense', '2026-10-21', 2000, 'salary', 'now', 'now'),
      ('foreign-taxonomy', 'u1', 'expense', '2026-10-21', 3000, 'foreign-category', 'now', 'now');
    INSERT INTO anomaly_evaluations (id, user_id, transaction_id, subcategory_id, amount_centavos, usable_history_count, usual_spending_centavos, lower_bound_centavos, upper_bound_centavos, severity, model_version, evaluated_at, version, created_at, updated_at) VALUES
      ('alert', 'u1', 'expense', 'salary', 2000, 10, 100, 50, 150, 2, 'v1', 'now', 1, 'now', 'now'),
      ('foreign-alert', 'u1', 'foreign-taxonomy', 'foreign-category', 3000, 10, 100, 50, 150, 2, 'v1', 'now', 1, 'now', 'now');
  `);
  const { getDashboardReminders } = await import("../dashboardReminders");
  expect((await getDashboardReminders("u1", "2026-10-22")).attention.items).toMatchObject([{ amountCentavos: 2000, detail: "Will this be a frequent expense?", target: { kind: "observation", id: "expense" } }]);
  const { answerUnusualSpending } = await import("../../alerts/unusualSpending");
  // Any answer settles the question, including "one time only".
  await answerUnusualSpending("u1", "device", "expense", "one_time");
  expect((await getDashboardReminders("u1", "2026-10-22")).attention.items).toEqual([]);
});

it("does not resurrect a deleted auto-post as a failed obligation", async () => {
  bill();
  const { scheduledPaymentPostIds } = await import("../../scheduled-payments/scheduledPayments");
  const ids = scheduledPaymentPostIds("bill", "2026-10-22");
  harness.sqlite.prepare(`INSERT INTO transactions (id, user_id, transaction_type, transaction_date, amount_centavos, client_mutation_id, deleted, created_at, updated_at)
    VALUES (?, 'u1', 'expense', '2026-10-22', 1000, 'scheduled-payment:bill:2026-10-22', 1, 'now', 'now')`).run(ids.transactionId);
  const { getDashboardReminders } = await import("../dashboardReminders");
  expect((await getDashboardReminders("u1", "2026-10-22")).attention.items).toEqual([]);
});

it("keeps an insufficient-funds auto-post unpaid and clears attention after a funded retry", async () => {
  bill();
  const { postDueScheduledPayments } = await import("../../scheduled-payments/scheduledPayments");
  const { getDashboardReminders } = await import("../dashboardReminders");
  const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(await postDueScheduledPayments("u1", "device", "2026-10-22")).toBe(0);
    expect((await getDashboardReminders("u1", "2026-10-22")).attention.items).toHaveLength(1);
    harness.sqlite.exec("UPDATE financial_accounts SET current_balance_centavos = 2000 WHERE id = 'bank'");
    expect(await postDueScheduledPayments("u1", "device", "2026-10-22")).toBe(1);
    expect((await getDashboardReminders("u1", "2026-10-22")).attention.items).toEqual([]);
    expect(harness.sqlite.prepare("SELECT current_balance_centavos FROM financial_accounts WHERE id = 'bank'").get()).toEqual({ current_balance_centavos: 1000 });
  } finally { warning.mockRestore(); }
});

it("shows one credit-card deadline with its unpaid amount and removes a paid statement", async () => {
  harness.sqlite.exec(`
    INSERT INTO financial_accounts (id, user_id, name, kind, created_at, updated_at) VALUES ('card', 'u1', 'Visa', 'credit_card', 'now', 'now');
    INSERT INTO credit_card_cycles (id, user_id, account_id, cycle_start_date, cutoff_date, statement_date, created_at, updated_at)
      VALUES ('cycle', 'u1', 'card', '2026-09-20', '2026-10-19', '2026-10-20', 'now', 'now');
    INSERT INTO credit_card_statements (id, user_id, cycle_id, statement_date, statement_balance_centavos, minimum_due_centavos, due_date, created_at, updated_at)
      VALUES ('statement', 'u1', 'cycle', '2026-10-20', 1000, 100, '2026-10-29', 'now', 'now');
    INSERT INTO transactions (id, user_id, transaction_type, transaction_date, amount_centavos, source_account_id, created_at, updated_at)
      VALUES ('card-debit', 'u1', 'expense', '2026-10-21', 300, 'bank', 'now', 'now');
    INSERT INTO credit_card_payments (id, user_id, cycle_id, statement_id, transaction_id, amount_centavos, payment_date, source_account_id, client_mutation_id, created_at, updated_at)
      VALUES ('card-payment', 'u1', 'cycle', 'statement', 'card-debit', 300, '2026-10-21', 'bank', 'card-payment', 'now', 'now');
  `);
  const { getDashboardReminders } = await import("../dashboardReminders");
  const result = await getDashboardReminders("u1", "2026-10-22");
  expect(result.upcoming.unavailable).toBe(false);
  expect(result.upcoming.items).toMatchObject([{ title: "Visa", amountCentavos: 700, date: "2026-10-29", target: { kind: "credit_card", id: "card" } }]);
  harness.sqlite.exec("UPDATE transactions SET amount_centavos = 1000 WHERE id = 'card-debit'; UPDATE credit_card_payments SET amount_centavos = 1000 WHERE id = 'card-payment'");
  expect((await getDashboardReminders("u1", "2026-10-22")).upcoming.items).toEqual([]);
});

it("leaves an archived card's unpaid statement out of upcoming debt", async () => {
  harness.sqlite.exec(`
    INSERT INTO financial_accounts (id, user_id, name, kind, status, created_at, updated_at) VALUES
      ('card', 'u1', 'Visa', 'credit_card', 'active', 'now', 'now'), ('old-card', 'u1', 'Old Mastercard', 'credit_card', 'archived', 'now', 'now');
    INSERT INTO credit_card_cycles (id, user_id, account_id, cycle_start_date, cutoff_date, statement_date, created_at, updated_at) VALUES
      ('cycle', 'u1', 'card', '2026-09-20', '2026-10-19', '2026-10-20', 'now', 'now'),
      ('old-cycle', 'u1', 'old-card', '2026-09-20', '2026-10-19', '2026-10-20', 'now', 'now');
    INSERT INTO credit_card_statements (id, user_id, cycle_id, statement_date, statement_balance_centavos, minimum_due_centavos, due_date, created_at, updated_at) VALUES
      ('statement', 'u1', 'cycle', '2026-10-20', 1000, 100, '2026-10-29', 'now', 'now'),
      ('old-statement', 'u1', 'old-cycle', '2026-10-20', 5000, 500, '2026-10-28', 'now', 'now');
  `);
  const { getDashboardReminders } = await import("../dashboardReminders");
  const result = await getDashboardReminders("u1", "2026-10-22");
  expect(result.upcoming.unavailable).toBe(false);
  expect(result.upcoming.items).toMatchObject([{ title: "Visa", amountCentavos: 1000, date: "2026-10-29", target: { kind: "credit_card", id: "card" } }]);
});

it("does not overdraw a shared account or report rolled-back auto-posts as successful", async () => {
  bill("a"); bill("b");
  harness.sqlite.exec("UPDATE financial_accounts SET current_balance_centavos = 1500 WHERE id = 'bank'");
  const { postDueScheduledPayments } = await import("../../scheduled-payments/scheduledPayments");
  const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(await postDueScheduledPayments("u1", "device", "2026-10-22")).toBe(1);
    expect(harness.sqlite.prepare("SELECT current_balance_centavos FROM financial_accounts WHERE id = 'bank'").get()).toEqual({ current_balance_centavos: 500 });
    const { getDashboardReminders } = await import("../dashboardReminders");
    expect((await getDashboardReminders("u1", "2026-10-22")).attention.items).toMatchObject([{ target: { id: "b" } }]);
  } finally { warning.mockRestore(); }
});
