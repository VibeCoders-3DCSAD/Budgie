import { jest } from "@jest/globals";
import { createSqliteHarness } from "../../../../local-db/repositories/__tests__/sqliteHarness";
import { applyPracticeSeed } from "../applyPracticeSeed";
import { buildPracticeSeed, PRACTICE_TABLE_ORDER } from "../seed";
import { ACCOUNT_IDS } from "../seed/accounts";
import { subcategoryLookup } from "../taxonomy";
import { PRACTICE_USER as USER, practiceTaxonomy as taxonomy } from "./practiceTaxonomy";

const mockInitDatabase = jest.fn<() => Promise<unknown>>();
jest.mock("../../../../local-db/client", () => ({ ...jest.requireActual<object>("../../../../local-db/client"), initDatabase: () => mockInitDatabase() }));

describe.each(["2026-11-09", "2026-03-01", "2026-02-28", "2026-12-31"])("practice data on %s", (today) => {
  let harness: ReturnType<typeof createSqliteHarness>;

  beforeEach(async () => {
    jest.resetModules();
    harness = createSqliteHarness();
    await harness.migrateAll();
    mockInitDatabase.mockResolvedValue(harness.db);
  });
  afterEach(() => harness.sqlite.close());

  it("writes every table without breaking a reference or leaving anything to sync", async () => {
    const tax = taxonomy();
    const seed = buildPracticeSeed({ userId: USER, today, subcategoryId: subcategoryLookup(tax) });
    await applyPracticeSeed(harness.db as never, USER, tax, seed);

    for (const table of PRACTICE_TABLE_ORDER) {
      const { count } = harness.sqlite.prepare(`SELECT COUNT(*) AS count FROM "${table}" WHERE user_id = ?`).get(USER) as { count: number };
      expect({ table, count }).toEqual({ table, count: seed[table].length });
    }
    expect(seed.transactions.every((row) => String(row.transaction_date) <= today)).toBe(true);
    expect(harness.sqlite.prepare("SELECT COUNT(*) AS count FROM sync_queue").get()).toEqual({ count: 0 });
    harness.sqlite.exec("PRAGMA foreign_keys = ON");
    expect(harness.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("reads back through the app's repositories with ledger-consistent balances", async () => {
    const tax = taxonomy();
    const seed = buildPracticeSeed({ userId: USER, today, subcategoryId: subcategoryLookup(tax) });
    await applyPracticeSeed(harness.db as never, USER, tax, seed);
    const { listFinancialAccounts } = await import("../../../../local-db/repositories/foundations/financialAccounts");
    const { listIncomeSources } = await import("../../../../local-db/repositories/foundations/incomeSources");

    const accounts = await listFinancialAccounts(USER);
    expect(accounts.map((account) => account.name)).toEqual(["Payroll Account", "GCash", "Emergency Fund", "House Deposit Savings", "Rewards Visa"]);
    for (const account of accounts.filter((row) => row.kind !== "credit_card")) expect(account.currentBalanceCentavos).toBeGreaterThanOrEqual(0);
    expect(accounts.find((row) => row.id === ACCOUNT_IDS.card)!.currentBalanceCentavos).toBeLessThanOrEqual(0);
    expect((await listIncomeSources(USER)).map((source) => source.name)).toEqual(expect.arrayContaining(["Salary — Andrea Cruz", "Freelance design"]));
  });

  it("gives each loan a repayment schedule its forecast can follow, on or ahead of its target", async () => {
    const tax = taxonomy();
    await applyPracticeSeed(harness.db as never, USER, tax, buildPracticeSeed({ userId: USER, today, subcategoryId: subcategoryLookup(tax) }));
    const { listDebtAccounts } = await import("../../../../local-db/repositories/debts/debtAccounts");
    const { listDebtPayments } = await import("../../../../local-db/repositories/debts/debtPayments");
    const { buildDebtForecast, getDebtRepaymentForecast } = await import("../../../debt-manager/forecast/helpers/debtForecast");

    const loans = await listDebtAccounts(USER);
    expect(loans).toHaveLength(2);
    for (const loan of loans) {
      const payments = (await listDebtPayments(USER, loan.id)).map((payment) => ({ paymentDate: payment.payment_date, amountCentavos: payment.amount_centavos }));
      const repayment = getDebtRepaymentForecast(loan);
      const forecast = buildDebtForecast(loan, today, payments);
      expect({ loan: loan.name, repayment: repayment.status, payoff: Boolean(repayment.estimatedPayoffDate), forecast: forecast.status })
        .toEqual({ loan: loan.name, repayment: expect.stringMatching(/^(advanced|on_track)$/), payoff: true, forecast: expect.stringMatching(/^(ahead|on_track)$/) });
    }
  });

  it("flags the air fryer as unusual spending waiting for an answer", async () => {
    const tax = taxonomy();
    await applyPracticeSeed(harness.db as never, USER, tax, buildPracticeSeed({ userId: USER, today, subcategoryId: subcategoryLookup(tax) }));
    const { listPersistedUnusualSpendings } = await import("../../../../local-db/repositories/alerts/unusualSpending");
    const insights = await listPersistedUnusualSpendings(USER);
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ amountCentavos: 950_000, recurrence: null });
    expect(insights[0]!.usualSpendingCentavos).toBeLessThan(100_000);
  });
});

it("is the same data every time for the same day", () => {
  const ctx = { userId: USER, today: "2026-11-09", subcategoryId: subcategoryLookup(taxonomy()) };
  expect(buildPracticeSeed(ctx)).toEqual(buildPracticeSeed(ctx));
});

it("names the missing subcategory instead of writing a broken reference", () => {
  expect(() => subcategoryLookup({ categories: [], subcategories: [] })("food_groceries")).toThrow('Practice data needs the "food_groceries" subcategory.');
});
