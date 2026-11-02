import { explainFinancialPlan, fallbackFinancialPlanExplanations, isUserFacingFinancialPlanExplanation, zeroAllocationExplanations, seasonalForecastMismatchExplanations, forecastChangeExplanation, type FinancialPlanEvidence } from "../../../services/financialPlan/explanationService.js";
import { seasonalPreferencesFromAnswers } from "../../../services/financialPlan/seasonalPreferences.js";

it("passes custom event names and selected months as seasonal evidence only in those months", () => {
  const answers = { custom_seasonal_events: [{ id: "custom_tuition", name: "Tuition payment", months: [1, 8] }], high_expense_seasons: ["custom_tuition"], saving_seasons: ["custom_tuition"] };
  expect(seasonalPreferencesFromAnswers(answers, "2026-08-01")).toEqual([
    { evidenceId: "saving_seasons:custom_tuition", season: "Tuition payment", seasonWindow: "January, August", preference: "saving" },
    { evidenceId: "high_expense_seasons:custom_tuition", season: "Tuition payment", seasonWindow: "January, August", preference: "higher_expense" },
  ]);
  expect(seasonalPreferencesFromAnswers(answers, "2026-07-01")).toEqual([]);
  expect(seasonalPreferencesFromAnswers({ high_expense_seasons: ["custom_tuition"] }, "2026-08-01")).toEqual([]);
});

const evidence: FinancialPlanEvidence = {
  planPeriodLabel: "December 2026",
  surplusCentavos: 5_000,
  debtSurplusCentavos: 2_500,
  savingsSurplusCentavos: 2_500,
  seasonalPreferences: [{ evidenceId: "saving_seasons:christmas_ber_months", season: "Christmas and Ber Months", seasonWindow: "September to December", preference: "saving" }],
  forecastChanges: [{ evidenceId: "forecast:food", categoryName: "Food", baselineCentavos: 10_000, forecastCentavos: 11_240, allocationCentavos: 12_000, allocationForecastDifferenceCentavos: 760, differenceCentavos: 1_240, percentageChange: 12.4, forecastRationale: "The model projects higher food spending from the supplied trend.", possibleSeasonalContext: null }],
};

describe("Financial Plan explanation service", () => {
  const originalApiKey = process.env.GROQ_API_KEY;

  afterEach(() => { process.env.GROQ_API_KEY = originalApiKey; });

  it.each([
    [26.637525852785522, "26.6% higher"],
    [-13.288683934125888, "13.3% lower"],
    [39.245735473405276, "39.2% higher"],
    [20, "20% higher"],
  ])("formats forecast percentage %s for display", (percentageChange, expected) => {
    const change = { ...evidence.forecastChanges[0]!, percentageChange, differenceCentavos: percentageChange > 0 ? 1_240 : -1_240 };
    const message = forecastChangeExplanation(evidence, change);

    expect(message).toContain(`${expected} than usual.`);
    expect(message).toContain("We recommend a budget of ₱120 for Food.");
    expect(change.percentageChange).toBe(percentageChange);
  });

  it("uses only model insights supported by evidence IDs", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ insights: [
      { type: "forecast_change", title: "Food allocation", message: "We recommend considering PHP 120.00 for Food against its PHP 112.40 spending forecast.", evidence_ids: ["forecast:food"] },
      { type: "surplus", title: "Unsupported", message: "Move it to investments.", evidence_ids: ["invented"] },
    ] }) } }] }) });

    await expect(explainFinancialPlan(evidence, fetcher)).resolves.toEqual([forecastChangeExplanation(evidence, evidence.forecastChanges[0]!)]);
  });

  it("removes duplicate messages and puts a shortfall first", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const shortfallEvidence = { ...evidence, shortfall: { plannedAmountCentavos: 50_000, requiredFundsCentavos: 65_000, shortfallCentavos: 15_000 }, seasonalPreferences: [
      { evidenceId: "saving_seasons:christmas_ber_months", season: "Christmas and Ber Months", seasonWindow: "September to December", preference: "saving" },
      { evidenceId: "high_expense_seasons:christmas_ber_months", season: "Christmas and Ber Months", seasonWindow: "September to December", preference: "higher_expense" },
    ] };
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ insights: [
      { type: "seasonal_preference", title: "Season", message: "We recommend reviewing your competing Christmas preferences.", evidence_ids: ["saving_seasons:christmas_ber_months"] },
      { type: "seasonal_preference", title: "Season again", message: "We recommend reviewing your competing Christmas preferences.", evidence_ids: ["high_expense_seasons:christmas_ber_months"] },
      { type: "shortfall", title: "Shortfall", message: "We recommend reviewing the PHP 150.00 shortfall against planned funds.", evidence_ids: ["plan-shortfall"] },
    ] }) } }] }) });

    await expect(explainFinancialPlan(shortfallEvidence, fetcher)).resolves.toEqual([
      "We recommend checking the ₱150 missing from your plan. Your planned payments total ₱650, but your budget is ₱500.",
      "We recommend checking your budget for Christmas and Ber Months. You mentioned wanting to save and spending more during this time.",
    ]);
  });

  it("falls back to deterministic evidence-backed explanations", () => {
    expect(fallbackFinancialPlanExplanations(evidence)).toEqual(expect.arrayContaining([
      expect.stringContaining("left after your planned payments"),
      expect.stringContaining("Christmas and Ber Months"),
      expect.stringContaining("We recommend a budget of ₱120 for Food"),
    ]));
  });

  it("rejects descriptive model text even when it cites valid evidence", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ insights: [
      { type: "forecast_change", title: "Food", message: "Food spending is forecast to rise.", evidence_ids: ["forecast:food"] },
    ] }) } }] }) });

    await expect(explainFinancialPlan(evidence, fetcher)).resolves.toEqual([]);
  });

  it("rejects a seasonal cause attached to a November spending estimate", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const novemberEvidence: FinancialPlanEvidence = {
      ...evidence, planPeriodLabel: "November 2026",
      seasonalPreferences: seasonalPreferencesFromAnswers({ high_expense_seasons: ["rainy_season"] }, "2026-11-01"),
      forecastChanges: [{ ...evidence.forecastChanges[0]!, percentageChange: 25.6, possibleSeasonalContext: "Rainy Season" }],
    };
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ insights: [
      { type: "forecast_change", title: "Food", message: "We recommend a budget of ₱120 for Food. We estimate your spending may be 25.6% higher than usual during the Rain Season.", evidence_ids: ["forecast:food"] },
    ] }) } }] }) });

    await expect(explainFinancialPlan(novemberEvidence, fetcher)).resolves.toEqual([]);
  });

  const novemberSeasons = seasonalPreferencesFromAnswers({
    high_expense_seasons: ["rainy_season", "christmas_ber_months", "summer"],
    saving_seasons: ["undas"],
  }, "2026-11-01");

  it("lists matching higher-expense seasons as possible reasons in the fallback", () => {
    const messages = fallbackFinancialPlanExplanations({ ...evidence, planPeriodLabel: "November 2026", seasonalPreferences: novemberSeasons });
    const forecast = messages.find((message) => message.includes("for Food"));

    expect(forecast).toContain("Possible reasons include Christmas and Ber Months, based on your selected higher-expense seasons.");
    expect(forecast).not.toMatch(/Summer|Undas|Rainy Season/);
    expect(forecast!.length).toBeLessThanOrEqual(360);
  });

  it.each([
    ["Christmas and Ber Months", true],
    ["Rainy Season and Christmas and Ber Months", false],
    ["Summer", false],
    ["Undas / All Souls' Day", false],
  ])("validates possible reasons against higher-expense preferences: %s", async (seasons, accepted) => {
    process.env.GROQ_API_KEY = "test-key";
    const message = `We recommend a budget of ₱120 for Food. We estimate spending may be 12.4% higher than usual. Possible reasons include ${seasons}, based on your selected higher-expense seasons.`;
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ insights: [
      { type: "forecast_change", title: "Food", message, evidence_ids: ["forecast:food"] },
    ] }) } }] }) });

    await expect(explainFinancialPlan({ ...evidence, planPeriodLabel: "November 2026", seasonalPreferences: novemberSeasons }, fetcher)).resolves.toEqual(accepted ? [forecastChangeExplanation({ ...evidence, planPeriodLabel: "November 2026", seasonalPreferences: novemberSeasons }, evidence.forecastChanges[0]!)] : []);
  });

  it("does not suggest higher-expense seasons as reasons for lower spending", () => {
    const messages = fallbackFinancialPlanExplanations({ ...evidence, seasonalPreferences: novemberSeasons, forecastChanges: [{
      ...evidence.forecastChanges[0]!, differenceCentavos: -1_240, percentageChange: -12.4,
    }] });
    expect(messages.find((message) => message.includes("for Food"))).not.toContain("Possible reasons");
  });

  it("recommends the allocation and keeps seasonal preferences separate from the forecast", () => {
    const messages = fallbackFinancialPlanExplanations({ ...evidence, forecastChanges: [{ ...evidence.forecastChanges[0]!, possibleSeasonalContext: "Christmas and Ber Months" }] });
    const forecast = messages.find((message) => message.includes("for Food"));

    expect(forecast).toContain("We recommend a budget of ₱120 for Food");
    expect(forecast).toContain("We estimate your spending may be 12.4% higher than usual.");
    expect(forecast).toContain("₱7.60 higher than the ₱112.40 estimate");
    expect(forecast).toContain("Perhaps this is due to Christmas and Ber Months, when spending in this category often goes up.");
    expect(messages.every((message) => message.startsWith("We recommend"))).toBe(true);
  });

  it("uses the simple Christmas example when the budget matches the estimate", () => {
    const messages = fallbackFinancialPlanExplanations({ ...evidence, forecastChanges: [{
      ...evidence.forecastChanges[0]!, baselineCentavos: 100_000, forecastCentavos: 120_000,
      allocationCentavos: 120_000, allocationForecastDifferenceCentavos: 0,
      differenceCentavos: 20_000, percentageChange: 20, possibleSeasonalContext: "Christmas and Ber Months",
    }] });

    expect(messages).toContain("We recommend a budget of ₱1,200 for Food. We estimate your spending may be 20% higher than usual. Perhaps this is due to Christmas and Ber Months, when spending in this category often goes up.");
    expect(messages.join(" ")).not.toMatch(/baseline|allocation|surplus|shortfall|forecast|relevant context/i);
  });

  it("avoids a usual-spending comparison when there is no baseline", () => {
    const messages = fallbackFinancialPlanExplanations({ ...evidence, forecastChanges: [{
      ...evidence.forecastChanges[0]!, baselineCentavos: 0, percentageChange: null,
    }] });
    expect(messages.find((message) => message.includes("for Food"))).toContain("We estimate spending of ₱112.40.");
    expect(messages.join(" ")).not.toContain("than usual");
  });

  it("combines competing seasonal preferences into one trade-off insight", () => {
    const explanations = fallbackFinancialPlanExplanations({ ...evidence, seasonalPreferences: [
      { evidenceId: "saving_seasons:christmas_ber_months", season: "Christmas and Ber Months", seasonWindow: "September to December", preference: "saving" },
      { evidenceId: "high_expense_seasons:christmas_ber_months", season: "Christmas and Ber Months", seasonWindow: "September to December", preference: "higher_expense" },
    ] });

    expect(explanations.filter((explanation) => explanation.includes("Christmas and Ber Months") && !explanation.includes("for Food"))).toEqual([
      expect.stringContaining("wanting to save and spending more"),
    ]);
  });

  it("explains a shortfall when Groq is unavailable", () => {
    expect(fallbackFinancialPlanExplanations({ ...evidence, shortfall: { plannedAmountCentavos: 50_000, requiredFundsCentavos: 65_000, shortfallCentavos: 15_000 } })[0]).toBe(
      "We recommend checking the ₱150 missing from your plan. Your planned payments total ₱650, but your budget is ₱500.",
    );
  });

  it("skips empty category budgets before explaining an unfunded spending forecast", () => {
    expect(zeroAllocationExplanations([
      { categoryName: "Home Internet", allocationCentavos: 0, requiredFloorCentavos: 0, forecastCentavos: 0 },
      { categoryName: "Family Remittance", allocationCentavos: 0, requiredFloorCentavos: 0, forecastCentavos: 0 },
      { categoryName: "Shopping", allocationCentavos: 0, requiredFloorCentavos: 0, forecastCentavos: 15_000 },
    ])).toEqual([
      "We recommend checking the ₱0 budget for Shopping. We estimate spending of ₱150, even though there is no minimum amount.",
    ]);
  });

  it("omits zero-budget insights when every category has no remaining requirement", () => {
    expect(zeroAllocationExplanations([
      { categoryName: "Home Internet", allocationCentavos: 0, requiredFloorCentavos: 0, forecastCentavos: 0 },
      { categoryName: "Family Remittance", allocationCentavos: 0, requiredFloorCentavos: 0, forecastCentavos: 0 },
    ])).toEqual([]);
  });

  it("still explains an unfunded minimum when its forecast is zero", () => {
    expect(zeroAllocationExplanations([
      { categoryName: "Food", allocationCentavos: 0, requiredFloorCentavos: 20_000, forecastCentavos: 0 },
    ])).toEqual(["We recommend checking the ₱0 budget for Food. It is below your minimum amount of ₱200."]);
  });

  it("excludes Summer preferences from an October plan", () => {
    expect(seasonalPreferencesFromAnswers({
      saving_seasons: ["summer", "christmas_ber_months"],
      high_expense_seasons: ["summer", "undas"],
    }, "2026-10-01")).toEqual([
      expect.objectContaining({ season: "Christmas and Ber Months", preference: "saving" }),
      expect.objectContaining({ season: "Undas / All Souls' Day", preference: "higher_expense" }),
    ]);
  });

  it("matches lower expense seasons to the plan month without inferring them from saving seasons", () => {
    expect(seasonalPreferencesFromAnswers({ high_expense_seasons: ["rainy_season"], low_expense_seasons: ["summer", "christmas_ber_months"], saving_seasons: ["summer"] }, "2026-11-01")).toEqual([
      expect.objectContaining({ preference: "higher_expense", season: "Rainy Season" }),
      expect.objectContaining({ preference: "lower_expense", season: "Christmas and Ber Months" }),
    ]);
    expect(seasonalPreferencesFromAnswers({ saving_seasons: ["summer"] }, "2026-04-01")).toEqual([
      expect.objectContaining({ preference: "saving" }),
    ]);
  });

  it("does not emit contradictory evidence for old conflicting answers", () => {
    expect(seasonalPreferencesFromAnswers({ high_expense_seasons: ["summer"], low_expense_seasons: ["summer"] }, "2026-04-01")).toEqual([
      expect.objectContaining({ preference: "higher_expense" }),
    ]);
  });

  it("explains a decrease using lower-expense seasons", () => {
    const lowerEvidence: FinancialPlanEvidence = { ...evidence,
      seasonalPreferences: seasonalPreferencesFromAnswers({ low_expense_seasons: ["christmas_ber_months"] }, "2026-12-01"),
      forecastChanges: [{ ...evidence.forecastChanges[0]!, forecastCentavos: 8_000, differenceCentavos: -2_000, percentageChange: -20 }],
    };
    const forecast = fallbackFinancialPlanExplanations(lowerEvidence).find((message) => message.includes("for Food"));
    expect(forecast).toContain("20% lower than usual");
    expect(forecast).toContain("Possible reasons include Christmas and Ber Months, based on your selected lower-expense seasons.");
    expect(seasonalForecastMismatchExplanations(lowerEvidence)).toEqual([]);
  });

  it.each([1_240, -1_240])("flags a seasonal pattern that disagrees with forecast change %i", (differenceCentavos) => {
    const preference = differenceCentavos > 0 ? "lower_expense" : "higher_expense";
    const messages = seasonalForecastMismatchExplanations({ ...evidence,
      seasonalPreferences: [{ evidenceId: "season", season: "Christmas and Ber Months", seasonWindow: "September to December", preference }],
      forecastChanges: [{ ...evidence.forecastChanges[0]!, differenceCentavos }],
    });
    expect(messages).toEqual([expect.stringContaining(`You reported ${differenceCentavos > 0 ? "lower" : "higher"} expenses during Christmas and Ber Months`)]);
    expect(messages[0]).toContain(`we estimate ${differenceCentavos > 0 ? "higher" : "lower"} spending`);
  });

  it("does not flag saving intentions or unchanged forecasts as expense mismatches", () => {
    expect(seasonalForecastMismatchExplanations(evidence)).toEqual([]);
    expect(seasonalForecastMismatchExplanations({ ...evidence, forecastChanges: [{ ...evidence.forecastChanges[0]!, differenceCentavos: 0 }] })).toEqual([]);
  });

  it.each(["lower", "higher"])("validates %s-expense reasons for a decreasing AI forecast", async (direction) => {
    process.env.GROQ_API_KEY = "test-key";
    const lowerEvidence: FinancialPlanEvidence = { ...evidence,
      seasonalPreferences: seasonalPreferencesFromAnswers({ low_expense_seasons: ["christmas_ber_months"] }, "2026-12-01"),
      forecastChanges: [{ ...evidence.forecastChanges[0]!, forecastCentavos: 8_000, differenceCentavos: -2_000, percentageChange: -20 }],
    };
    const message = `We recommend a budget of ₱120 for Food. We estimate spending may be 20% lower than usual. Possible reasons include Christmas and Ber Months, based on your selected ${direction}-expense seasons.`;
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ insights: [
      { type: "forecast_change", title: "Food", message, evidence_ids: ["forecast:food"] },
    ] }) } }] }) });
    await expect(explainFinancialPlan(lowerEvidence, fetcher)).resolves.toEqual(direction === "lower" ? [forecastChangeExplanation(lowerEvidence, lowerEvidence.forecastChanges[0]!)] : []);
  });

  it("does not flag a mismatch without a usual-spending baseline", () => {
    expect(seasonalForecastMismatchExplanations({ ...evidence,
      seasonalPreferences: seasonalPreferencesFromAnswers({ low_expense_seasons: ["christmas_ber_months"] }, "2026-12-01"),
      forecastChanges: [{ ...evidence.forecastChanges[0]!, baselineCentavos: 0, percentageChange: null }],
    })).toEqual([]);
  });

  it("excludes HFCE terminology from user-facing insights", () => {
    expect(isUserFacingFinancialPlanExplanation("HFCE forecast increased.")).toBe(false);
    expect(isUserFacingFinancialPlanExplanation("Household final consumption expenditure increased.")).toBe(false);
    expect(isUserFacingFinancialPlanExplanation("Food is forecast above baseline.")).toBe(true);
  });
});

it("applies calendar-period preferences only to months in the selected period", () => {
  const answers = { high_expense_seasons: ["q4"], low_expense_seasons: ["q2"], saving_seasons: ["q1"] };
  expect(seasonalPreferencesFromAnswers(answers, "2026-11-01")).toEqual([
    { evidenceId: "high_expense_seasons:q4", season: "October–December", seasonWindow: "October to December", preference: "higher_expense" },
  ]);
  expect(seasonalPreferencesFromAnswers(answers, "2026-04-01")).toEqual([
    { evidenceId: "low_expense_seasons:q2", season: "April–June", seasonWindow: "April to June", preference: "lower_expense" },
  ]);
  expect(seasonalPreferencesFromAnswers(answers, "2026-01-01")).toEqual([
    { evidenceId: "saving_seasons:q1", season: "January–March", seasonWindow: "January to March", preference: "saving" },
  ]);
});
