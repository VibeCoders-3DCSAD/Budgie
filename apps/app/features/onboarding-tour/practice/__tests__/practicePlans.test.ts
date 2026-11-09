import { jest } from "@jest/globals";
import { createSqliteHarness } from "../../../../local-db/repositories/__tests__/sqliteHarness";
import { applyPracticeSeed } from "../applyPracticeSeed";
import { practiceRecommendation } from "../fixtures/recommendation";
import { withPastPlans } from "../pastPlans";
import { buildPracticeSeed } from "../seed";
import { subcategoryLookup } from "../taxonomy";
import { PRACTICE_USER, practiceTaxonomy } from "./practiceTaxonomy";

const mockInitDatabase = jest.fn<() => Promise<unknown>>();
jest.mock("../../../../local-db/client", () => ({ ...jest.requireActual<object>("../../../../local-db/client"), initDatabase: () => mockInitDatabase() }));

const today = "2026-11-09";
const taxonomy = practiceTaxonomy();
const ctx = { userId: PRACTICE_USER, today, subcategoryId: subcategoryLookup(taxonomy) };
let harness: ReturnType<typeof createSqliteHarness>;

beforeEach(async () => {
  jest.resetModules();
  harness = createSqliteHarness();
  await harness.migrateAll();
  mockInitDatabase.mockResolvedValue(harness.db);
});
afterEach(() => harness.sqlite.close());

async function seeded() {
  const seed = withPastPlans(buildPracticeSeed(ctx), taxonomy, ctx);
  await applyPracticeSeed(harness.db as never, PRACTICE_USER, taxonomy, seed);
  return seed;
}

it("saves the tour's plan the way Accept and save plan does", async () => {
  const seed = await seeded();
  const plan = practiceRecommendation({ today, seed, taxonomy }, {
    includedSubcategoryIds: [], includedCategoryIds: ["cat-food", "cat-transport"], plannedAmountCentavos: 8_100_000,
    manualAllocations: [], skipDebtRepayments: false, skipSavingsContributions: false, skipScheduledPayments: false,
  });
  const { createFinancialPlan, getFinancialPlan } = await import("../../../../local-db/repositories/financial-plans/financialPlans");
  const allocations = plan.recommendation.allocations.map(({ label: _label, ...allocation }) => allocation);
  const debtReservations = plan.recommendation.debtReservations.map(({ debtAccountId, creditCardStatementId, amountCentavos, dueDate }) => ({ debtAccountId, creditCardStatementId, amountCentavos, dueDate }));
  const savingsReservations = plan.recommendation.savingsReservations.map(({ savingsGoalId, amountCentavos, dueDate }) => ({ savingsGoalId: savingsGoalId!, amountCentavos, dueDate }));
  const { id } = await createFinancialPlan(PRACTICE_USER, "device-1", {
    periodStart: plan.period.start, periodEnd: plan.period.end, inputSnapshot: plan.inputSnapshot,
    recommendation: { ...plan.recommendation, allocations, debtReservations, savingsReservations }, allocations, debtReservations, savingsReservations,
  } as never);
  expect(await getFinancialPlan(PRACTICE_USER, id)).toMatchObject({ id });
});

it("lists two past accepted plans in plan history, each with its category budgets", async () => {
  const seed = await seeded();
  expect(seed.financial_plans.map((row) => row.period_start)).toEqual(["2026-09-01", "2026-10-01"]);
  const { listCompletedFinancialPlans } = await import("../../../../local-db/repositories/financial-plans/financialPlans");
  const history = await listCompletedFinancialPlans(PRACTICE_USER, today);
  expect(history.map((plan) => plan.periodStart)).toEqual(["2026-10-01", "2026-09-01"]);
  expect(history.every((plan) => plan.plannedTotalCentavos > 0)).toBe(true);
  // Each month reserves both loan payments and that month's card statement.
  expect(harness.sqlite.prepare("SELECT COUNT(debt_account_id) AS loans, COUNT(credit_card_statement_id) AS statements FROM financial_plan_debt_reservations").get()).toEqual({ loans: 4, statements: 2 });
});
