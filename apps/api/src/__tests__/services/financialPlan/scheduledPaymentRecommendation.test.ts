import type { SupabaseClient } from "@supabase/supabase-js";
import { ForecastUpstreamError, getMlForecast } from "../../../services/forecast/forecastService.js";
import { recommendPlanCategories } from "../../../services/financialPlan/mlAdapter.js";
import { getFinancialPlanRecommendation } from "../../../services/financialPlan/recommendationService.js";
import { createFinancialConditionAssessment } from "../../../services/classification/financialConditionAssessmentService.js";

jest.mock("../../../lib/supabase.js", () => ({ getServiceRoleClient: () => ({}) }));
jest.mock("../../../services/forecast/forecastService.js", () => ({ ...jest.requireActual("../../../services/forecast/forecastService.js"), getMlForecast: jest.fn() }));
jest.mock("../../../services/financialPlan/mlAdapter.js", () => ({ recommendPlanCategories: jest.fn() }));
jest.mock("../../../services/classification/financialConditionAssessmentService.js", () => ({ createFinancialConditionAssessment: jest.fn() }));

function client(paid: number, fixed: number | null = null, months = 1, commitmentRows: Record<string, unknown> = {}): SupabaseClient {
  const rows: Record<string, unknown> = {
    subcategories: [{ id: "rent", category_id: "housing", label: "Rent", minimum_amount_centavos: null, fixed_amount_centavos: fixed }],
    categories: [{ id: "housing", slug: "housing_water_utilities", label: "Housing", minimum_amount_centavos: null, fixed_amount_centavos: null }],
    financial_accounts: [{ kind: "bank", current_balance_centavos: 200_000 }],
    transactions: [{ id: "past-rent", amount_centavos: 100_000, transaction_date: "2026-09-10", transaction_type: "expense", category_id: null, subcategory_id: "rent", anomaly_evaluations: [] }],
    scheduled_payments: [{ id: "monthly-rent", name: "Monthly rent", subcategory_id: "rent", amount_centavos: 30_000, frequency: "monthly", due_day_of_month: 20, due_second_day_of_month: null, due_day_of_week: null, due_month: null, starts_on: "2026-01-01", ends_on: null }],
    scheduled_payment_records: [{ scheduled_payment_id: "monthly-rent", occurrence_date: "2026-10-20", amount_centavos: paid }],
    financial_condition_assessments: null, onboarding_sessions: null, debt_strategy_preferences: null,
    ...commitmentRows,
  };
  if (months > 1) rows.transactions = [
    ...(rows.transactions as unknown[]),
    { id: "older-rent", amount_centavos: 100_000, transaction_date: "2026-08-10", transaction_type: "expense", category_id: null, subcategory_id: "rent", anomaly_evaluations: [] },
  ];
  return { from: (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "in", "limit", "order", "gte", "lte", "not", "maybeSingle"]) builder[name] = () => builder;
    builder.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve);
    return builder;
  } } as unknown as SupabaseClient;
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-15T03:00:00Z"));
  jest.mocked(createFinancialConditionAssessment).mockResolvedValue(null);
  jest.mocked(getMlForecast).mockRejectedValue(new ForecastUpstreamError(503, "offline"));
  jest.mocked(recommendPlanCategories).mockImplementation(async (_user, _period, _available, categories, forecast) => ({
    recommendation: { feasibility: "FEASIBLE", allocations: categories.map((category) => ({ category_id: category.id, amount: (forecast.categoryForecasts.find((point) => point.category === category.id)?.amountCentavos ?? 0) / 100 })) }, explanations: [],
  }));
});
afterEach(() => jest.useRealTimers());

it.each([0, 10_000, 30_000])("reserves the full amount after %i paid without deducting it from spending that is not a biller payment", async (paid) => {
  const plan = await getFinancialPlanRecommendation("user-1", client(paid), 200_000, ["rent"]);
  expect(recommendPlanCategories).toHaveBeenCalledWith("user-1", { start: "2026-10-01", end: "2026-10-31" }, 170_000,
    [expect.objectContaining({ id: "rent", forecastCentavos: 100_000 })], expect.objectContaining({ totalAmountCentavos: 100_000 }));
  expect(plan.recommendation.allocations[0]?.allocatedAmountCentavos).toBe(100_000);
  expect(plan.inputSnapshot.obligations.reservations).toEqual([{ scheduledPaymentId: "monthly-rent", subcategoryId: "rent", label: "Monthly rent", amountCentavos: 30_000, dueDate: "2026-10-20" }]);
});

it("uses the ML category forecast as is, since its history leaves out scheduled payments", async () => {
  jest.mocked(getMlForecast).mockResolvedValue({ status: "SUCCESS", modelVersion: "v1", forecasts: [], snapshot: { month: "2026-10", totalAmountCentavos: 120_000, categoryForecasts: [{ category: "housing_water_utilities", amountCentavos: 120_000 }], modelVersion: "v1", generatedAt: "2026-10-15T03:00:00Z", quality: "PERSONALIZED" } });
  const plan = await getFinancialPlanRecommendation("user-1", client(0), 200_000, [], ["housing"]);
  expect(getMlForecast).toHaveBeenCalled();
  expect(recommendPlanCategories).toHaveBeenCalledWith("user-1", expect.anything(), 170_000, [expect.objectContaining({ id: "housing", forecastCentavos: 120_000 })], expect.objectContaining({ totalAmountCentavos: 120_000 }));
  expect(plan.recommendation.allocations[0]?.allocatedAmountCentavos).toBe(120_000);
});

it("sends the Spending Forecast's history: twelve months, every category, no scheduled payments, one-offs, or payments in certain months", async () => {
  jest.mocked(getMlForecast).mockResolvedValue({ status: "SUCCESS", modelVersion: "v1", forecasts: [], snapshot: { month: "2026-10", totalAmountCentavos: 0, categoryForecasts: [], modelVersion: "v1", generatedAt: "2026-10-15T03:00:00Z", quality: "PERSONALIZED" } });
  const expense = { amount_centavos: 10_000, transaction_type: "expense", category_id: null, subcategory_id: "rent" };
  await getFinancialPlanRecommendation("user-1", client(0, null, 1, {
    transactions: [
      { ...expense, id: "bill", transaction_date: "2026-09-20", anomaly_evaluations: [] },
      { ...expense, id: "groceries", transaction_date: "2026-09-12", subcategory_id: "unplanned", anomaly_evaluations: [] },
      { ...expense, id: "one-off", transaction_date: "2026-09-05", anomaly_evaluations: [{ transaction_id: "one-off", is_anomaly: true, recurrence: "one_time" }] },
      { ...expense, id: "frequent", transaction_date: "2026-09-04", anomaly_evaluations: [{ transaction_id: "frequent", is_anomaly: true, recurrence: "frequent" }] },
      { ...expense, id: "tuition", transaction_date: "2026-06-10", anomaly_evaluations: [{ transaction_id: "tuition", is_anomaly: true, recurrence: "yearly" }] },
      { ...expense, id: "first-day", transaction_date: "2025-10-01", anomaly_evaluations: [] },
      { ...expense, id: "too-old", transaction_date: "2025-09-30", anomaly_evaluations: [] },
    ],
    scheduled_payment_records: [{ transaction_id: "bill" }],
  }), 200_000, ["rent"]);
  const sent = jest.mocked(getMlForecast).mock.calls[0]![1].historicalTransactions;
  expect(sent.map((transaction) => [transaction.transactionId, transaction.category])).toEqual([
    ["groceries", "Other"],
    ["frequent", "housing_water_utilities"],
    ["first-day", "housing_water_utilities"],
  ]);
});

it("adds payments the user said come back in certain months to the forecast of those months", async () => {
  jest.mocked(recommendPlanCategories).mockImplementation(async (_user, _period, _available, categories) => ({ recommendation: { feasibility: "FEASIBLE", allocations: categories.map((category) => ({ category_id: category.id, amount: category.floorCentavos / 100 })) } }));
  jest.mocked(getMlForecast).mockResolvedValue({ status: "SUCCESS", modelVersion: "v1", forecasts: [], snapshot: { month: "2026-10", totalAmountCentavos: 120_000, categoryForecasts: [{ category: "housing_water_utilities", amountCentavos: 120_000 }], modelVersion: "v1", generatedAt: "2026-10-15T03:00:00Z", quality: "PERSONALIZED" } });
  const expense = { amount_centavos: 10_000, transaction_type: "expense", category_id: null, subcategory_id: "rent" };
  await getFinancialPlanRecommendation("user-1", client(0, null, 1, {
    transactions: [
      { ...expense, id: "groceries", transaction_date: "2026-09-12", anomaly_evaluations: [] },
      { ...expense, id: "tuition", amount_centavos: 50_000, transaction_date: "2026-06-10", anomaly_evaluations: [{ transaction_id: "tuition", is_anomaly: true, recurrence: "yearly", recurrence_months: [6, 10] }] },
      { ...expense, id: "fee", amount_centavos: 7_000, transaction_date: "2026-03-10", anomaly_evaluations: [{ transaction_id: "fee", is_anomaly: true, recurrence: "yearly", recurrence_months: [3] }] },
    ],
    scheduled_payment_records: [],
  }), 200_000, ["rent"]);
  expect(jest.mocked(getMlForecast).mock.calls[0]![1].historicalTransactions.map((transaction) => transaction.transactionId)).toEqual(["groceries"]);
  expect(recommendPlanCategories).toHaveBeenCalledWith("user-1", expect.anything(), expect.any(Number), expect.anything(), expect.objectContaining({ categoryForecasts: [expect.objectContaining({ amountCentavos: 170_000 })] }));
});

it("counts the scheduled portion toward a Fixed category instead of reserving it twice", async () => {
  // Optimizer honors the residual Fixed amount, independently of its spending forecast.
  jest.mocked(recommendPlanCategories).mockImplementation(async (_user, _period, _available, categories) => ({ recommendation: { feasibility: "FEASIBLE", allocations: categories.map((category) => ({ category_id: category.id, amount: category.floorCentavos / 100 })) } }));
  const plan = await getFinancialPlanRecommendation("user-1", client(0, 50_000), 200_000);
  expect(plan.recommendation.allocations[0]).toMatchObject({ allocationRule: "FIXED", allocatedAmountCentavos: 20_000, floorAmountCentavos: 20_000, ceilingAmountCentavos: 20_000 });
});

it("explains the forecast change with the ML baseline and amount unchanged", async () => {
  jest.mocked(getMlForecast).mockResolvedValue({ status: "SUCCESS", modelVersion: "v1", forecasts: [{ category: "housing_water_utilities", month: "2026-10", quarter: "Q4", amountCentavos: 120_000, userBaselineCentavos: 100_000, hfceMultiplier: 1.2, hfceForecastAmountMillionPhp: 1, explanation: "" }], snapshot: { month: "2026-10", totalAmountCentavos: 120_000, categoryForecasts: [{ category: "housing_water_utilities", amountCentavos: 120_000 }], modelVersion: "v1", generatedAt: "2026-10-15T03:00:00Z", quality: "PERSONALIZED" } });
  const plan = await getFinancialPlanRecommendation("user-1", client(0), 200_000, ["rent"]);
  expect(plan.recommendation.allocations[0]?.forecastAmountCentavos).toBe(120_000);
  expect(plan.explanationRequest.evidence.forecastChanges).toEqual([expect.objectContaining({ baselineCentavos: 100_000, forecastCentavos: 120_000 })]);
});

it("reports a shortfall using only the residual Fixed requirement plus the scheduled reservation", async () => {
  const plan = await getFinancialPlanRecommendation("user-1", client(0, 50_000), 15_000);
  expect(plan.status).toBe("INFEASIBLE");
  expect(plan.recommendation).toMatchObject({ requiredFundsCentavos: 50_000, shortfallCentavos: 35_000 });
});

it("averages a multi-month fallback baseline without biller payments", async () => {
  const plan = await getFinancialPlanRecommendation("user-1", client(0, null, 2, {
    scheduled_payment_records: [{ scheduled_payment_id: "monthly-rent", transaction_id: "older-rent", occurrence_date: "2026-08-20", amount_centavos: 100_000 }],
  }), 200_000, ["rent"]);
  expect(plan.recommendation.allocations[0]?.forecastAmountCentavos).toBe(50_000);
});

it("keeps a quarterly biller's past payments out of its category budget in a month it is not due", async () => {
  jest.mocked(getMlForecast).mockResolvedValue({ status: "SUCCESS", modelVersion: "v1", forecasts: [], snapshot: { month: "2026-10", totalAmountCentavos: 50_000, categoryForecasts: [{ category: "health", amountCentavos: 50_000 }], modelVersion: "v1", generatedAt: "2026-10-15T03:00:00Z", quality: "PERSONALIZED" } });
  const expense = { transaction_type: "expense", category_id: null, anomaly_evaluations: [] };
  await getFinancialPlanRecommendation("user-1", client(0, null, 1, {
    subcategories: [
      { id: "insurance", category_id: "health", label: "Health Insurance", minimum_amount_centavos: null, fixed_amount_centavos: null },
      { id: "medicine", category_id: "health", label: "Medicine", minimum_amount_centavos: null, fixed_amount_centavos: null },
    ],
    categories: [{ id: "health", slug: "health", label: "Health", minimum_amount_centavos: null, fixed_amount_centavos: null }],
    transactions: [
      { ...expense, id: "hmo-sep", amount_centavos: 360_000, transaction_date: "2026-09-20", subcategory_id: "insurance" },
      { ...expense, id: "hmo-jun", amount_centavos: 360_000, transaction_date: "2026-06-20", subcategory_id: "insurance" },
      { ...expense, id: "pills", amount_centavos: 50_000, transaction_date: "2026-09-12", subcategory_id: "medicine" },
    ],
    scheduled_payments: [{ id: "hmo", name: "Maxicare HMO", subcategory_id: "insurance", amount_centavos: 360_000, frequency: "quarterly", due_day_of_month: 20, due_second_day_of_month: null, due_day_of_week: null, due_month: null, starts_on: "2025-09-01", ends_on: null }],
    scheduled_payment_records: [{ transaction_id: "hmo-sep" }, { transaction_id: "hmo-jun" }],
  }), 200_000, ["insurance", "medicine"]);
  expect(recommendPlanCategories).toHaveBeenCalledWith("user-1", expect.anything(), 200_000, [
    expect.objectContaining({ id: "insurance", forecastCentavos: 0, priorityWeight: 0 }),
    expect.objectContaining({ id: "medicine", forecastCentavos: 50_000, priorityWeight: 1 }),
  ], expect.anything());
});

it("reserves the user's budget for a biller while keeping its full amount due as the requirement", async () => {
  const plan = await getFinancialPlanRecommendation("user-1", client(0), 200_000, ["rent"], [], [], { commitmentBudgets: [{ key: "scheduled:monthly-rent:2026-10-20", amountCentavos: 12_000 }] });
  expect(recommendPlanCategories).toHaveBeenCalledWith("user-1", expect.anything(), 188_000, expect.anything(), expect.anything());
  expect(plan.inputSnapshot.obligations.reservations).toEqual([expect.objectContaining({ scheduledPaymentId: "monthly-rent", amountCentavos: 12_000 })]);
  expect(plan.inputSnapshot.obligations.requirements).toEqual([expect.objectContaining({ scheduledPaymentId: "monthly-rent", amountCentavos: 30_000 })]);
});

it("keeps full debt, statement and savings requirements when their budgets are lower", async () => {
  const supabase = client(0, null, 1, {
    debt_accounts: [{ id: "loan", current_balance_centavos: 100_000, minimum_payment_centavos: 20_000, payment_frequency: "monthly", next_due_date: "2026-10-20", payment_schedule: null }],
    credit_card_statements: [{ id: "statement", minimum_due_centavos: 10_000, due_date: "2026-10-25" }],
    savings_goals: [{ id: "goal", planned_contribution_amount_centavos: 8_000, contribution_frequency: "monthly", contribution_day_of_month: 15, next_contribution_date: "2026-10-15" }],
  });
  const plan = await getFinancialPlanRecommendation("user-1", supabase, 200_000, ["rent"], [], [], {
    skipDebtRepayments: false, skipSavingsContributions: false,
    commitmentBudgets: [
      { key: "debt:loan:2026-10-20", amountCentavos: 5_000 },
      { key: "statement:statement:2026-10-25", amountCentavos: 2_000 },
      { key: "savings:goal:2026-10-15", amountCentavos: 1_000 },
    ],
  });
  expect(plan.status).toBe("RECOMMENDATION_READY");
  expect(plan.recommendation.debtReservations).toEqual([
    expect.objectContaining({ debtAccountId: "loan", amountCentavos: 5_000 }),
    expect.objectContaining({ creditCardStatementId: "statement", amountCentavos: 2_000 }),
  ]);
  expect(plan.recommendation.savingsReservations).toEqual([expect.objectContaining({ savingsGoalId: "goal", amountCentavos: 1_000 })]);
  expect(plan.inputSnapshot.debtRequirements.reservations).toEqual([
    expect.objectContaining({ debtAccountId: "loan", amountCentavos: 20_000 }),
    expect.objectContaining({ creditCardStatementId: "statement", amountCentavos: 10_000 }),
  ]);
  expect(plan.inputSnapshot.savingsRequirements.reservations).toEqual([expect.objectContaining({ savingsGoalId: "goal", amountCentavos: 8_000 })]);
});

it("rejects a biller budget for a payment the user does not have", async () => {
  await expect(getFinancialPlanRecommendation("user-1", client(0), 200_000, ["rent"], [], [], { commitmentBudgets: [{ key: "scheduled:someone-else:2026-10-20", amountCentavos: 1_000 }] })).rejects.toThrow("Commitment changed or is unavailable");
});

it("reserves nothing for billers when the user excludes them", async () => {
  const plan = await getFinancialPlanRecommendation("user-1", client(0), 200_000, ["rent"], [], [], { skipScheduledPayments: true });
  expect(recommendPlanCategories).toHaveBeenCalledWith("user-1", expect.anything(), 200_000, expect.anything(), expect.anything());
  expect(plan.inputSnapshot.obligations.reservations).toEqual([]);
  expect(plan.inputSnapshot.commitmentSelection).toMatchObject({ scheduledPayments: false });
});
