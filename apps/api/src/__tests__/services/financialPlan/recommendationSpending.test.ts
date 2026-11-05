import type { SupabaseClient } from "@supabase/supabase-js";

jest.mock("../../../services/forecast/forecastService.js", () => ({
  ...jest.requireActual("../../../services/forecast/forecastService.js"),
  getMlForecast: jest.fn(),
}));
jest.mock("../../../services/financialPlan/mlAdapter.js", () => ({ recommendPlanCategories: jest.fn() }));
jest.mock("../../../services/classification/financialConditionAssessmentService.js", () => ({ createFinancialConditionAssessment: jest.fn() }));
jest.mock("../../../lib/supabase.js", () => ({ getServiceRoleClient: jest.fn() }));

import { getMlForecast } from "../../../services/forecast/forecastService.js";
import { createFinancialConditionAssessment } from "../../../services/classification/financialConditionAssessmentService.js";
import { recommendPlanCategories } from "../../../services/financialPlan/mlAdapter.js";
import { getFinancialPlanRecommendation } from "../../../services/financialPlan/recommendationService.js";

describe("Financial Plan recommendations with recorded spending", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-18T00:00:00Z"));
    (createFinancialConditionAssessment as jest.Mock).mockResolvedValue(null);
    (getMlForecast as jest.Mock).mockResolvedValue({
      snapshot: { month: "2026-10", categoryForecasts: [{ category: "communication", amountCentavos: 168_000 }], modelVersion: "test", generatedAt: "2026-10-18T00:00:00Z", quality: "SUCCESS" },
      forecasts: [],
    });
    (recommendPlanCategories as jest.Mock).mockResolvedValue({ recommendation: { feasibility: "FEASIBLE", allocations: [{ category_id: "internet", amount: 1680 }] } });
  });

  afterEach(() => jest.useRealTimers());

  function client(spentCentavos: number, minimum: number | null = null, additionalRows: Record<string, unknown[]> = {}) {
    const rows: Record<string, unknown[]> = {
      subcategories: [{ id: "internet", category_id: "communication", label: "Home Internet", minimum_amount_centavos: minimum, fixed_amount_centavos: null }],
      categories: [{ id: "communication", slug: "communication", label: "Communication", minimum_amount_centavos: null, fixed_amount_centavos: null }],
      financial_accounts: [{ kind: "cash", current_balance_centavos: 1_000_000 }],
      transactions: [{ id: "payment", amount_centavos: spentCentavos, transaction_date: "2026-10-10", transaction_type: "expense", category_id: "communication", subcategory_id: "internet", anomaly_evaluations: [] }],
      ...additionalRows,
    };
    return { from: (table: string) => {
      let data = rows[table] ?? [];
      const query: unknown = new Proxy({}, { get: (_, key) => {
        if (key === "maybeSingle") return () => Promise.resolve({ data: rows[table]?.[0] ?? null, error: null });
        if (key === "range") return (from: number, to: number) => { data = data.slice(from, to + 1); return query; };
        if (key === "then") { const result = Promise.resolve({ data, error: null }); return result.then.bind(result); }
        return () => query;
      } });
      return query;
    } } as SupabaseClient;
  }

  it.each([
    [true, true, 500_000, 0, 0],
    [false, true, 491_000, 2, 0],
    [true, false, 497_500, 0, 1],
    [false, false, 488_500, 2, 1],
  ])("honors debt exclusion %s and savings exclusion %s before invoking the optimizer", async (skipDebtRepayments, skipSavingsContributions, available, debtCount, savingsCount) => {
    const result = await getFinancialPlanRecommendation("user", client(50_000, null, {
      debt_accounts: [{ id: "loan", current_balance_centavos: 100_000, minimum_payment_centavos: 10_000, next_due_date: "2026-10-20", payment_frequency: "monthly", payment_schedule: {} }],
      credit_card_statements: [{ id: "statement", minimum_due_centavos: 3_000, due_date: "2026-10-22" }],
      savings_goals: [{ id: "goal", planned_contribution_amount_centavos: 5_000, next_contribution_date: "2026-10-25", contribution_frequency: "monthly" }],
    }), 500_000, ["internet"], [], [], { skipDebtRepayments, skipSavingsContributions, commitmentBudgets: [
      { key: "debt:loan:2026-10-20", amountCentavos: 7_000 },
      { key: "statement:statement:2026-10-22", amountCentavos: 2_000 },
      { key: "savings:goal:2026-10-25", amountCentavos: 2_500 },
    ] });

    expect(result.recommendation.debtReservations).toHaveLength(debtCount);
    expect(result.recommendation.savingsReservations).toHaveLength(savingsCount);
    expect(result.inputSnapshot.commitmentSelection).toEqual({ debtRepayments: !skipDebtRepayments, savingsContributions: !skipSavingsContributions, scheduledPayments: true });
    expect(result.recommendation.availableFundsCentavos).toBe(available);
    expect(result.recommendation.debtSurplusCentavos).toBe(0);
    expect(result.recommendation.savingsSurplusCentavos).toBe(0);
    expect(recommendPlanCategories).toHaveBeenCalledWith("user", result.period, available,
      [expect.objectContaining({ id: "internet" })], expect.any(Object));
  });

  it.each(["debt", "savings"])("rejects selected %s without a reviewed amount instead of budgeting it automatically", async (kind) => {
    await expect(getFinancialPlanRecommendation("user", client(50_000, null, {
      debt_accounts: [{ id: "loan", current_balance_centavos: 100_000, minimum_payment_centavos: 10_000, next_due_date: "2026-10-20", payment_frequency: "monthly" }],
      savings_goals: [{ id: "goal", planned_contribution_amount_centavos: 5_000, next_contribution_date: "2026-10-25", contribution_frequency: "monthly" }],
    }), 500_000, ["internet"], [], [], { skipDebtRepayments: kind !== "debt", skipSavingsContributions: kind !== "savings", commitmentBudgets: [] })).rejects.toThrow("Review all selected savings and debt amounts");
    expect(recommendPlanCategories).not.toHaveBeenCalled();
  });

  it.each(["savings", "debt"])("keeps surplus guidance separate from scheduled %s exclusions", async (destination) => {
    (recommendPlanCategories as jest.Mock).mockResolvedValue({ recommendation: { feasibility: "FEASIBLE", unallocated_surplus: 100, allocations: [{ category_id: "internet", amount: 1680 }] } });
    const result = await getFinancialPlanRecommendation("user", client(50_000, null, {
      debt_accounts: [{ id: "loan", current_balance_centavos: 100_000, minimum_payment_centavos: 10_000, next_due_date: "2026-10-20", payment_frequency: "monthly", allows_extra_payments: true, annual_interest_rate_bps: 1_200 }],
      savings_goals: [{ id: "goal", is_emergency_fund: true, current_amount_centavos: 0, target_amount_centavos: 200_000, planned_contribution_amount_centavos: 5_000, next_contribution_date: "2026-10-25", contribution_frequency: "monthly" }],
      financial_condition_assessments: [{ id: "assessment", assessed_at: "2026-10-18T00:00:00Z", rule_set_version: "financial_rules_v1", output_snapshot: {
        financial_margin: { status: "SUCCESS", label: "POSITIVE_FINANCIAL_MARGIN" },
        emergency_savings: { status: "SUCCESS", label: destination === "savings" ? "EMERGENCY_FUND_INADEQUATE" : "EMERGENCY_FUND_ADEQUATE" },
        debt_burden: { status: "SUCCESS", label: "FINANCIALLY_OVERBURDENED" },
      } }],
    }), 500_000, ["internet"], [], [], { skipDebtRepayments: true, skipSavingsContributions: true });

    expect(result.recommendation.surplusRecommendation.advisoryDestination).toEqual(destination === "savings" ? { type: "emergency_fund", savingsGoalId: "goal" } : null);
    expect(result.recommendation.surplusRecommendation.unallocatedSurplusCentavos).toBe(10_000);
  });

  it.each([200_000, 300_000])("recommends extra emergency savings at a balance of %i even after reaching the goal target", async (currentAmount) => {
    (recommendPlanCategories as jest.Mock).mockResolvedValue({ recommendation: { feasibility: "FEASIBLE", unallocated_surplus: 100, allocations: [{ category_id: "internet", amount: 1680 }] } });
    (createFinancialConditionAssessment as jest.Mock).mockResolvedValue({ id: "assessment", assessed_at: "2026-10-18T00:00:00Z", rule_set_version: "financial_rules_v1", output_snapshot: {
      financial_margin: { status: "SUCCESS", label: "POSITIVE_FINANCIAL_MARGIN" },
      emergency_savings: { status: "SUCCESS", label: "EMERGENCY_FUND_INADEQUATE" },
      credit_card_behavior: [
        { status: "SUCCESS", label: "REVOLVER", account_id: "card-1" },
        { status: "SUCCESS", label: "HEAVY_REVOLVER", account_id: "card-2" },
      ],
    } });
    const result = await getFinancialPlanRecommendation("user", client(50_000, null, {
      savings_goals: [{ id: "goal", is_emergency_fund: true, current_amount_centavos: currentAmount, target_amount_centavos: 200_000 }],
    }), 500_000, ["internet"], [], [], { skipSavingsContributions: true, skipDebtRepayments: true });

    expect(result.recommendation.surplusRecommendation).toMatchObject({ reasonCode: "EMERGENCY_FUND_INADEQUATE", advisoryDestination: { type: "emergency_fund", savingsGoalId: "goal" } });
    expect(result.recommendation.savingsReservations).toEqual([]);
    expect(result.recommendation.savingsSurplusCentavos).toBe(0);
  });

  it.each([50_000, 171_701])("keeps the monthly forecast and optimizer allocation when spending is %i centavos", async (spent) => {
    const result = await getFinancialPlanRecommendation("user", client(spent), 500_000, ["internet"]);
    expect(recommendPlanCategories).toHaveBeenCalledWith("user", result.period, 500_000,
      [expect.objectContaining({ id: "internet", forecastCentavos: 168_000 })],
      expect.objectContaining({ categoryForecasts: [{ category: "internet", amountCentavos: 168_000 }] }));
    expect(result.recommendation.availableFundsCentavos).toBe(500_000);
    expect(result.recommendation.allocations[0]).toMatchObject({ allocatedAmountCentavos: 168_000, forecastAmountCentavos: 168_000 });
  });

  it("preserves fractional centavos from the LP without rounding or redistributing them", async () => {
    const subcategories = ["internet", "mobile", "postage"].map((id) => ({ id, category_id: "communication", label: id, minimum_amount_centavos: null, fixed_amount_centavos: null }));
    (recommendPlanCategories as jest.Mock).mockResolvedValue({ recommendation: { feasibility: "FEASIBLE", allocations: subcategories.map(({ id }) => ({ category_id: id, amount: 1.006 })) } });
    (getMlForecast as jest.Mock).mockResolvedValue({
      snapshot: { month: "2026-10", categoryForecasts: [{ category: "communication", amountCentavos: 301.23456789 }], modelVersion: "test", generatedAt: "2026-10-18T00:00:00Z", quality: "PERSONALIZED" },
      forecasts: [],
    });
    const transactions = subcategories.map(({ id }) => ({ id: `past-${id}`, amount_centavos: 50_000, transaction_date: "2026-10-10", transaction_type: "expense", category_id: "communication", subcategory_id: id, anomaly_evaluations: [] }));
    const result = await getFinancialPlanRecommendation("user", client(50_000, null, { subcategories, transactions }), 302, subcategories.map(({ id }) => id));

    const allocated = result.recommendation.allocations.map((allocation) => allocation.allocatedAmountCentavos);
    expect(allocated).toEqual([100.6, 100.6, 100.6]);
    const optimizerCategories = (recommendPlanCategories as jest.Mock).mock.calls[0][3];
    expect(optimizerCategories.map((category: { forecastCentavos: number }) => category.forecastCentavos)).toEqual(Array(3).fill(301.23456789 * 50_000 / 150_000));
    expect(302 - allocated.reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(0.2);
  });

  it("splits a category's forecast by last year's seasons once a full year of history exists", async () => {
    const subcategories = ["internet", "gifts", "tuition"].map((id) => ({ id, category_id: "communication", label: id, minimum_amount_centavos: null, fixed_amount_centavos: null }));
    (recommendPlanCategories as jest.Mock).mockResolvedValue({ recommendation: { feasibility: "FEASIBLE", allocations: subcategories.map(({ id }) => ({ category_id: id, amount: 0 })) } });
    (getMlForecast as jest.Mock).mockResolvedValue({
      snapshot: { month: "2026-10", categoryForecasts: [{ category: "communication", amountCentavos: 100_000 }], modelVersion: "test", generatedAt: "2026-10-18T00:00:00Z", quality: "PERSONALIZED" },
      forecasts: [],
    });
    const expense = (id: string, subcategoryId: string, date: string, amount: number) => ({ id, amount_centavos: amount, transaction_date: date, transaction_type: "expense", category_id: "communication", subcategory_id: subcategoryId, anomaly_evaluations: [] });
    const months = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
    const transactions = [
      ...months.map((month) => expense(`internet-${month}`, "internet", `${month}-20`, 10_000)),
      // Last October's gifts, and tuition paid in June and July only.
      expense("gifts", "gifts", "2025-10-05", 40_000),
      expense("tuition-june", "tuition", "2026-06-10", 30_000),
      expense("tuition-july", "tuition", "2026-07-10", 30_000),
    ];
    await getFinancialPlanRecommendation("user", client(0, null, { subcategories, transactions }), 500_000, subcategories.map(({ id }) => id));

    const optimizerCategories = (recommendPlanCategories as jest.Mock).mock.calls[0][3];
    expect(optimizerCategories.map((category: { id: string; forecastCentavos: number }) => [category.id, category.forecastCentavos])).toEqual([["internet", 20_000], ["gifts", 80_000], ["tuition", 0]]);
  });

  it("does not apply a Christmas expense pattern to Communication or change the recommendation", async () => {
    (getMlForecast as jest.Mock).mockResolvedValue({
      snapshot: { month: "2026-10", categoryForecasts: [{ category: "communication", amountCentavos: 168_000 }], modelVersion: "test", generatedAt: "2026-10-18T00:00:00Z", quality: "PERSONALIZED" },
      forecasts: [{ category: "communication", month: "2026-10", amountCentavos: 168_000, userBaselineCentavos: 140_000, hfceMultiplier: 1.2, explanation: "" }],
    });
    const result = await getFinancialPlanRecommendation("user", client(50_000, null, {
      onboarding_sessions: [{ raw_answers: { high_expense_seasons: ["summer"], low_expense_seasons: ["christmas_ber_months"] } }],
    }), 500_000, ["internet"]);

    expect(result.explanationRequest.evidence.seasonalPreferences).toEqual([
      expect.objectContaining({ season: "Christmas and Ber Months", preference: "lower_expense" }),
    ]);
    expect(result.explanations[0]).toContain("Perhaps spending in this category will be higher than usual.");
    expect(result.explanations[0]).not.toContain("Christmas");
    expect(result.recommendation.allocations[0]).toMatchObject({ allocatedAmountCentavos: 168_000, forecastAmountCentavos: 168_000 });
    expect(recommendPlanCategories).toHaveBeenCalledWith("user", result.period, 500_000,
      [expect.objectContaining({ forecastCentavos: 168_000 })], expect.any(Object));
  });

  it("keeps configured minimums and available funds unchanged on the infeasible path", async () => {
    const result = await getFinancialPlanRecommendation("user", client(171_701, 200_000), 100_000, ["internet"]);
    expect(result.status).toBe("INFEASIBLE");
    expect(result.recommendation.availableFundsCentavos).toBe(100_000);
    expect(result.recommendation.allocations[0]).toMatchObject({ allocatedAmountCentavos: 200_000, floorAmountCentavos: 200_000 });
    expect(recommendPlanCategories).not.toHaveBeenCalled();
  });

  it("includes confirmed payment reservations as separate explanation evidence without adding them to the category budget", async () => {
    (getMlForecast as jest.Mock).mockResolvedValue({
      snapshot: { month: "2026-10", categoryForecasts: [{ category: "communication", amountCentavos: 168_000 }], modelVersion: "test", generatedAt: "2026-10-18T00:00:00Z", quality: "PERSONALIZED" },
      forecasts: [{ category: "communication", month: "2026-10", amountCentavos: 168_000, userBaselineCentavos: 140_000, hfceMultiplier: 1.2, explanation: "" }],
    });
    (recommendPlanCategories as jest.Mock).mockResolvedValue({ recommendation: { feasibility: "FEASIBLE", allocations: [{ category_id: "internet", amount: 800 }] } });
    const result = await getFinancialPlanRecommendation("user", client(50_000, null, {
      scheduled_payments: [{ id: "internet-bill", subcategory_id: "internet", amount_centavos: 20_000, frequency: "once", starts_on: "2026-10-22", ends_on: null }],
    }), 500_000, ["internet"]);

    expect(result.explanationRequest.evidence).toMatchObject({
      planMonth: "2026-10", forecastComparisonBasis: "usual_category_spending",
      confirmedExpenses: [{ scheduledPaymentId: "internet-bill", categorySlug: "communication", dueDate: "2026-10-22", amountCentavos: 20_000 }],
      financialConstraints: { plannedAmountCentavos: 500_000, categoryBudgetCentavos: 480_000, scheduledPaymentsCentavos: 20_000 },
    });
    // The forecast's history leaves out scheduled payments, so the bill is not taken out of it again.
    expect(result.recommendation.allocations[0]).toMatchObject({ allocatedAmountCentavos: 80_000, forecastAmountCentavos: 168_000 });
    expect(result.explanations.join(" ")).toContain("Separately, ₱200 is reserved for recorded payments in this category.");
    expect(result.explanations[0]).toContain("A lower budget does not mean lower expected expenses");
    expect(recommendPlanCategories).toHaveBeenCalledWith("user", result.period, 480_000, expect.any(Array), expect.any(Object));
    expect(result.inputSnapshot.spendingExplanationEvidence).toMatchObject({ forecastComparisonBasis: "usual_category_spending" });
  });

  it("does not recommend a zero category budget for a separately reserved biller", async () => {
    (recommendPlanCategories as jest.Mock).mockResolvedValue({ recommendation: { feasibility: "FEASIBLE", allocations: [{ category_id: "internet", amount: 0 }] } });
    const result = await getFinancialPlanRecommendation("user", client(0, null, {
      transactions: [],
      scheduled_payments: [{ id: "internet-bill", name: "Home Internet", subcategory_id: "internet", amount_centavos: 20_000, frequency: "once", starts_on: "2026-10-22", ends_on: null }],
    }), 500_000, ["internet"]);

    expect(result.recommendation.allocations[0]).toMatchObject({ allocatedAmountCentavos: 0, forecastAmountCentavos: 0, floorAmountCentavos: 0 });
    expect(result.inputSnapshot.obligations.reservations).toEqual([
      expect.objectContaining({ scheduledPaymentId: "internet-bill", amountCentavos: 20_000 }),
    ]);
    expect(result.explanationRequest.leading).toEqual([]);
    expect(result.explanations.join(" ")).not.toContain("Home Internet");
  });

  it("does not explain an unselected category as receiving an insufficient zero budget", async () => {
    (getMlForecast as jest.Mock).mockResolvedValue({
      snapshot: { month: "2026-10", categoryForecasts: [{ category: "communication", amountCentavos: 168_000 }, { category: "education", amountCentavos: 500_000 }], modelVersion: "test", generatedAt: "2026-10-18T00:00:00Z", quality: "PERSONALIZED" },
      forecasts: [
        { category: "communication", month: "2026-10", amountCentavos: 168_000, userBaselineCentavos: 140_000, hfceMultiplier: 1.2, explanation: "" },
        { category: "education", month: "2026-10", amountCentavos: 500_000, userBaselineCentavos: 100_000, hfceMultiplier: 1.2, explanation: "" },
      ],
    });
    const result = await getFinancialPlanRecommendation("user", client(50_000, null, {
      categories: [
        { id: "communication", slug: "communication", label: "Communication", minimum_amount_centavos: null, fixed_amount_centavos: null },
        { id: "education", slug: "education", label: "Education", minimum_amount_centavos: null, fixed_amount_centavos: null },
      ],
    }), 500_000, ["internet"]);
    expect(result.explanationRequest.evidence.forecastChanges.map((item) => item.categorySlug)).toEqual(["communication"]);
    expect(result.explanations.join(" ")).not.toMatch(/Education|budgets below estimated spending/);
  });

  it("applies user commitment budgets before optimization and keeps original amounts in the snapshot", async () => {
    const debt = { id: "loan", current_balance_centavos: 200_000, minimum_payment_centavos: 50_000, payment_frequency: "monthly", payment_schedule: {}, next_due_date: "2026-11-05" };
    const goal = { id: "goal", planned_contribution_amount_centavos: 20_000, contribution_frequency: "monthly", contribution_interval_count: 1, contribution_day_of_month: 16, next_contribution_date: "2026-11-16" };
    const result = await getFinancialPlanRecommendation("user", client(50_000, null, { debt_accounts: [debt], savings_goals: [goal] }), 500_000, ["internet"], [], [], { commitmentBudgets: [{ key: "debt:loan:2026-11-05", amountCentavos: 30_000 }, { key: "savings:goal:2026-11-16", amountCentavos: 0 }] }, "2026-11");
    expect(result.recommendation.availableFundsCentavos).toBe(470_000);
    expect(result.recommendation.debtReservations[0].amountCentavos).toBe(30_000);
    expect(result.recommendation.savingsReservations[0].amountCentavos).toBe(0);
    expect(result.inputSnapshot.debtRequirements.reservations[0].amountCentavos).toBe(50_000);
    expect(result.inputSnapshot.savingsRequirements.reservations[0].amountCentavos).toBe(20_000);
    await expect(getFinancialPlanRecommendation("user", client(0), 500_000, [], [], [], { commitmentBudgets: [{ key: "debt:someone-elses-loan:2026-11-05", amountCentavos: 0 }] }, "2026-11")).rejects.toThrow("Commitment changed or is unavailable");
  });

  it("uses November for the forecast and includes November loan payments and savings contributions", async () => {
    const novemberClient = client(171_701, null, {
      financial_accounts: [{ kind: "cash", current_balance_centavos: 5_000_000 }],
      debt_accounts: [
        { id: "personal", current_balance_centavos: 7_850_000, minimum_payment_centavos: 450_000, payment_frequency: "monthly", payment_schedule: {}, next_due_date: "2026-11-05" },
        { id: "motorcycle", current_balance_centavos: 14_200_000, minimum_payment_centavos: 680_000, payment_frequency: "monthly", payment_schedule: {}, next_due_date: "2026-11-20" },
      ],
      savings_goals: [
        { id: "emergency", planned_contribution_amount_centavos: 500_000, contribution_frequency: "monthly", contribution_interval_count: 1, contribution_day_of_month: 16, next_contribution_date: "2026-11-16" },
        { id: "laptop", planned_contribution_amount_centavos: 300_000, contribution_frequency: "monthly", contribution_interval_count: 1, contribution_day_of_month: 16, next_contribution_date: "2026-11-16" },
      ],
    });
    // The forecast fallback must also cover November if the model returns a different month.
    const result = await getFinancialPlanRecommendation("user", novemberClient, 5_000_000, ["internet"], [], [], {}, "2026-11");
    expect(result.period).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(getMlForecast).toHaveBeenCalledWith("user", expect.objectContaining({ targetMonth: "2026-11" }));
    expect(recommendPlanCategories).toHaveBeenCalledWith("user", result.period, 3_070_000, expect.any(Array), expect.objectContaining({ month: "2026-11" }));
    expect(result.recommendation.debtReservations).toEqual([
      { debtAccountId: "personal", creditCardStatementId: null, amountCentavos: 450_000, dueDate: "2026-11-05" },
      { debtAccountId: "motorcycle", creditCardStatementId: null, amountCentavos: 680_000, dueDate: "2026-11-20" },
    ]);
    expect(result.recommendation.savingsReservations).toEqual([
      { savingsGoalId: "emergency", amountCentavos: 500_000, dueDate: "2026-11-16" },
      { savingsGoalId: "laptop", amountCentavos: 300_000, dueDate: "2026-11-16" },
    ]);
  });
});
