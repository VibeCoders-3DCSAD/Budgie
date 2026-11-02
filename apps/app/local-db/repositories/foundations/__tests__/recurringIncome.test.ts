import { jest } from "@jest/globals";
import { createSqliteHarness } from "../../__tests__/sqliteHarness";
import type { CreateIncomeSourceInput } from "../financialFoundations";

const mockInitDatabase = jest.fn<() => Promise<unknown>>();
jest.mock("../../../client", () => ({ initDatabase: () => mockInitDatabase() }));

const salary: CreateIncomeSourceInput = {
  name: "Salary", frequency: "semi_monthly", destinationAccountId: "acct-bank", subcategoryId: "sub-salary",
  expectedAmountCentavos: 2_500_000, paydayDayOfMonth: 15, paydaySecondDayOfMonth: 30, nextExpectedDate: "2026-11-01",
};

let harness: ReturnType<typeof createSqliteHarness>;

async function repos() {
  return { ...(await import("../recurringIncome")), ...(await import("../financialFoundations")) };
}

function balance() {
  return (harness.sqlite.prepare("SELECT current_balance_centavos AS balance FROM financial_accounts WHERE id = 'acct-bank'").get() as { balance: number }).balance;
}

function posts() {
  return harness.sqlite.prepare(`SELECT o.id AS occurrence_id, o.status, t.id AS transaction_id, t.transaction_date, t.amount_centavos, t.merchant_name, t.transaction_type, t.entry_source
    FROM recurring_transaction_occurrences o JOIN transactions t ON t.id = o.generated_transaction_id WHERE o.deleted = 0 ORDER BY o.scheduled_date`).all();
}

beforeEach(async () => {
  jest.resetModules();
  harness = createSqliteHarness();
  await harness.migrateAll();
  harness.sqlite.exec(`
    INSERT INTO subcategories (id, user_id, kind, slug, label, description, created_at, updated_at) VALUES ('sub-salary', 'user-1', 'income', 'salary', 'Salary', 'Salary', 'now', 'now');
    INSERT INTO financial_accounts (id, user_id, name, kind, opening_balance_centavos, current_balance_centavos, created_at, updated_at) VALUES ('acct-bank', 'user-1', 'Payroll', 'bank', 0, 0, 'now', 'now');
  `);
  mockInitDatabase.mockResolvedValue(harness.db);
});

afterEach(() => harness.sqlite.close());

describe("postDueRecurringIncome", () => {
  it("posts each payday since the schedule started, once, with the ids the server derives", async () => {
    const { createIncomeSource, postDueRecurringIncome, recurringIncomePostIds } = await repos();
    const { source } = await createIncomeSource("user-1", "device-1", salary);

    expect(await postDueRecurringIncome("user-1", "device-1", "2026-11-30")).toBe(2);
    expect(await postDueRecurringIncome("user-1", "device-1", "2026-11-30")).toBe(0);
    const ids = recurringIncomePostIds(source.recurringTemplateId!, "2026-11-15");
    expect(posts()).toEqual([
      { occurrence_id: ids.occurrenceId, status: "posted", transaction_id: ids.transactionId, transaction_date: "2026-11-15", amount_centavos: 2_500_000, merchant_name: "Salary", transaction_type: "income", entry_source: "recurring" },
      expect.objectContaining({ transaction_date: "2026-11-30" }),
    ]);
    expect(balance()).toBe(5_000_000);
    // The server job writes the same tag, so a payday looks the same whoever posts it.
    expect(harness.queued("transactions")[0]!.payload).toMatchObject({ entry_source: "recurring" });
    expect(harness.queued("recurring_transaction_occurrences").map((operation) => operation.payload)).toEqual([
      { recurring_template_id: source.recurringTemplateId, scheduled_date: "2026-11-15", generated_transaction_id: ids.transactionId },
      expect.objectContaining({ scheduled_date: "2026-11-30" }),
    ]);
  });

  it("skips a payday the retired engine posted or whose server transaction was pulled first", async () => {
    const { createIncomeSource, postDueRecurringIncome, recurringIncomePostIds } = await repos();
    const { source } = await createIncomeSource("user-1", "device-1", salary);
    const templateId = source.recurringTemplateId!;
    harness.sqlite.prepare(`INSERT INTO recurring_transaction_occurrences (id, recurring_template_id, user_id, scheduled_date, status, created_at, updated_at)
      VALUES ('legacy-occurrence', ?, 'user-1', '2026-11-15', 'posted', 'now', 'now')`).run(templateId);
    harness.sqlite.prepare(`INSERT INTO transactions (id, user_id, transaction_type, transaction_date, amount_centavos, destination_account_id, subcategory_id, created_at, updated_at)
      VALUES (?, 'user-1', 'income', '2026-11-30', 2500000, 'acct-bank', 'sub-salary', 'now', 'now')`).run(recurringIncomePostIds(templateId, "2026-11-30").transactionId);

    expect(await postDueRecurringIncome("user-1", "device-1", "2026-11-30")).toBe(0);
  });

  it("does not post a paused income source", async () => {
    const { createIncomeSource, postDueRecurringIncome } = await repos();
    await createIncomeSource("user-1", "device-1", { ...salary, isActive: false });

    expect(await postDueRecurringIncome("user-1", "device-1", "2026-11-30")).toBe(0);
  });
});
