import { categorySeasonalPreferences, confirmedCategoryPayments, possibleSeasonalReasons } from "../../../services/financialPlan/helpers/spendingReasons.js";
import { MONTHLY_SPENDING_REFERENCE, HFCE_CATEGORY_SLUGS } from "../../../services/financialPlan/spendingReasonCatalog.js";
import { budgetConstraintExplanations, forecastChangeExplanation, seasonalForecastMismatchExplanations, type FinancialPlanEvidence } from "../../../services/financialPlan/explanationService.js";
import { deterministicFinancialPlanExplanations, explainFinancialPlanRequest, parseFinancialPlanExplanationRequest } from "../../../services/financialPlan/explanationRequest.js";
import { seasonalPreferencesFromAnswers } from "../../../services/financialPlan/seasonalPreferences.js";

const change: FinancialPlanEvidence["forecastChanges"][number] = {
  evidenceId: "forecast:transport", categorySlug: "transport", categoryName: "Transport",
  baselineCentavos: 100_000, forecastCentavos: 125_600, allocationCentavos: 90_000,
  differenceCentavos: 25_600, percentageChange: 25.6, allocationForecastDifferenceCentavos: -35_600,
  forecastRationale: "", possibleSeasonalContext: null,
};
const evidence: FinancialPlanEvidence = {
  planMonth: "2026-11", planPeriodLabel: "November 2026", forecastComparisonBasis: "usual_category_spending",
  surplusCentavos: 0, debtSurplusCentavos: 0, savingsSurplusCentavos: 0,
  seasonalPreferences: seasonalPreferencesFromAnswers({ high_expense_seasons: ["rainy_season", "undas", "christmas_ber_months"] }, "2026-11-01"),
  forecastChanges: [change],
  financialConstraints: { plannedAmountCentavos: 200_000, categoryBudgetCentavos: 90_000, debtReservationsCentavos: 60_000, savingsReservationsCentavos: 30_000, scheduledPaymentsCentavos: 20_000 },
};

describe("monthly spending reason selection", () => {
  it("does not treat custom names as category-specific spending causes", () => {
    const custom = { ...evidence, seasonalPreferences: [{ evidenceId: "high_expense_seasons:custom_event", season: "Undas / All Souls' Day", seasonWindow: "November", preference: "higher_expense" as const }] };
    expect(possibleSeasonalReasons(custom, change)).not.toContain("based on your selected");
  });

  it("accepts all bounded custom events after the client echoes the explanation context", () => {
    const answers = { custom_seasonal_events: Array.from({ length: 20 }, (_, index) => ({ id: `custom_${index}`, name: `Family event ${index}`, months: [11] })), high_expense_seasons: Array.from({ length: 20 }, (_, index) => `custom_${index}`), saving_seasons: Array.from({ length: 20 }, (_, index) => `custom_${index}`) };
    const context = { ...evidence, seasonalPreferences: seasonalPreferencesFromAnswers(answers, "2026-11-01") };
    expect(parseFinancialPlanExplanationRequest({ evidence: context, leading: [] }).evidence.seasonalPreferences).toHaveLength(40);
  });
  it("covers all twelve months using the application's twelve canonical categories", () => {
    expect(MONTHLY_SPENDING_REFERENCE.map(({ month }) => month)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(HFCE_CATEGORY_SLUGS).toHaveLength(12);
    for (const row of MONTHLY_SPENDING_REFERENCE) {
      expect([...row.higher, ...row.lower].every((category) => HFCE_CATEGORY_SLUGS.includes(category))).toBe(true);
    }
  });

  it("retains overlapping November events separately for Transport", () => {
    expect(categorySeasonalPreferences(evidence, change, "higher_expense").map(({ season }) => season)).toEqual([
      "Rainy Season", "Undas / All Souls' Day", "Christmas and Ber Months",
    ]);
    const message = forecastChangeExplanation(evidence, change);
    expect(message).toContain("25.6% higher than usual");
    expect(message).toContain("₱356 lower than the ₱1,256 estimate");
    expect(message).toContain("Rainy Season, Undas / All Souls' Day, and Christmas and Ber Months");
    expect(message).not.toMatch(/flood|repairs|trips|gifts|school fees/i);
    expect(message.length).toBeLessThanOrEqual(360);
    expect(message.endsWith(".")).toBe(true);
  });

  it("does not apply rainy-season expenses to Food or any seasonal reason to Communication", () => {
    expect(possibleSeasonalReasons(evidence, { ...change, categorySlug: "food" })).not.toContain("Rainy Season");
    expect(possibleSeasonalReasons(evidence, { ...change, categorySlug: "communication", categoryName: "Food" })).toBe("Perhaps spending in this category will be higher than usual.");
    expect(possibleSeasonalReasons(evidence, { ...change, categorySlug: "custom" })).toBe("Perhaps spending in this category will be higher than usual.");
  });

  it.each(["2026-02", "2027-02", "2027-04"])("does not infer movable holidays, purchases or school breaks in %s", (planMonth) => {
    const local = { ...evidence, planMonth, seasonalPreferences: [] };
    expect(possibleSeasonalReasons(local, change)).toMatch(/^Perhaps /);
    expect(forecastChangeExplanation(local, change)).not.toMatch(/Holy Week|Chinese New Year|Eid|tuition|repairs|gifts|travel/i);
  });

  it("always gives a hedged reason in Q4 when no seasons were selected", () => {
    const october = { ...evidence, planMonth: "2026-10", seasonalPreferences: [] };
    const food = { ...change, evidenceId: "forecast:food", categorySlug: "food", categoryName: "Food" };
    expect(forecastChangeExplanation(october, food)).toContain("Perhaps this is due to Undas / All Souls' Day and Christmas and Ber Months");
    const health = { ...change, categorySlug: "health", categoryName: "Health", differenceCentavos: -5_100, percentageChange: -5.1 };
    expect(forecastChangeExplanation(october, health)).toContain("Perhaps spending in this category will be lower than usual.");
    const lowerChristmas = { ...october, seasonalPreferences: seasonalPreferencesFromAnswers({ low_expense_seasons: ["christmas_ber_months"] }, "2026-10-01") };
    expect(possibleSeasonalReasons(lowerChristmas, food)).not.toContain("Christmas");
  });

  it("rechecks the plan month instead of trusting previously selected seasonal evidence", () => {
    expect(possibleSeasonalReasons({ ...evidence, planMonth: "2027-02" }, change)).not.toContain("based on your selected");
    expect(possibleSeasonalReasons({ ...evidence, planMonth: "invalid" }, change)).toBe("Perhaps spending in this category will be higher than usual.");
  });

  it("only uses lower patterns for a decrease and never reverses a seasonal event's cause", () => {
    const decrease = { ...change, forecastCentavos: 80_000, differenceCentavos: -20_000, percentageChange: -20 };
    expect(possibleSeasonalReasons(evidence, decrease)).toBe("Perhaps spending in this category will be lower than usual.");
    const lower = { ...evidence, seasonalPreferences: seasonalPreferencesFromAnswers({ low_expense_seasons: ["christmas_ber_months"] }, "2026-11-01") };
    expect(possibleSeasonalReasons(lower, decrease)).toContain("selected lower-expense seasons");
    expect(seasonalForecastMismatchExplanations(lower)).toEqual([expect.stringContaining("You reported lower expenses")]);
  });

  it("matches recorded payments by category and exact month/year, without double counting", () => {
    const expense = { scheduledPaymentId: "fare", categorySlug: "transport", dueDate: "2026-11-15", amountCentavos: 20_000 };
    const local = { ...evidence, confirmedExpenses: [expense, expense,
      { ...expense, dueDate: "2027-11-15" }, { ...expense, categorySlug: "education" },
    ] };
    expect(confirmedCategoryPayments(local, change)).toEqual([expense]);
    const message = forecastChangeExplanation(local, change);
    expect(message).toContain("We recommend a budget of ₱900");
    expect(message).toContain("Separately, ₱200 is reserved for recorded payments in this category.");
    expect(change.allocationCentavos).toBe(90_000);
  });

  it("separates a lower allocation from higher expected spending and actual payment reservations", () => {
    const request = { evidence, leading: [] };
    const messages = deterministicFinancialPlanExplanations(request);
    expect(messages[0]).toContain("₱900 available for category budgets");
    expect(messages[0]).toContain("₱600 for debt payments");
    expect(messages[0]).toContain("₱300 for savings contributions");
    expect(messages[0]).toContain("A lower budget does not mean lower expected expenses");
    expect(messages.some((message) => message.includes("25.6% higher than usual"))).toBe(true);
    expect(budgetConstraintExplanations({ ...evidence, financialConstraints: undefined })).toEqual([]);
    expect(messages.join(" ")).not.toContain("previous month's limit");
  });

  it("bounds and validates the context echoed to the explanation endpoint", () => {
    const context = { ...evidence, confirmedExpenses: [{ scheduledPaymentId: "fare", categorySlug: "transport", dueDate: "2026-11-15", amountCentavos: 20_000 }] };
    expect(parseFinancialPlanExplanationRequest({ evidence: context, leading: [] }).evidence).toEqual(context);
    for (const invalid of [
      { planMonth: "2026-13" }, { forecastComparisonBasis: "previous_budget" },
      { confirmedExpenses: [{ ...context.confirmedExpenses[0], dueDate: "2026-02-30" }] },
      { confirmedExpenses: [{ ...context.confirmedExpenses[0], amountCentavos: -1 }] },
      { confirmedExpenses: [{ ...context.confirmedExpenses[0], categorySlug: "income_tax" }] },
    ]) expect(() => parseFinancialPlanExplanationRequest({ evidence: { ...context, ...invalid }, leading: [] })).toThrow();
  });

  it("preserves a budget constraint notice when AI interpretations arrive", async () => {
    const originalKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "test-key";
    try {
      const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ insights: [
        { type: "forecast_change", title: "Transport", message: "We recommend this budget because your holiday trips ended.", evidence_ids: ["forecast:transport"] },
      ] }) } }] }) });
      const messages = await explainFinancialPlanRequest({ evidence, leading: [] }, fetcher);
      expect(messages[0]).toContain("A lower budget does not mean lower expected expenses");
      expect(messages.join(" ")).not.toContain("trips ended");
      expect(messages.some((message) => message.includes("25.6% higher than usual"))).toBe(true);
    } finally {
      if (originalKey === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = originalKey;
    }
  });
});
