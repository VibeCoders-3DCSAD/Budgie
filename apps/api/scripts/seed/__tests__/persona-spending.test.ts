import { randomUUID } from "node:crypto";
import anchors from "../../fixtures/persona-spending.json" with { type: "json" };
import { personaFlexibleSpending, quarterlyPersonaTargets, seedSpendingCategory, summarizePersonaSpending } from "../persona-spending.js";
import { buildPersonaSeedData, demoPersonas, type DemoPersona } from "../personas.js";
import { requiredSubcategorySlugs } from "../history.js";

const personas = Object.keys(demoPersonas) as DemoPersona[];

it.each(personas)("conserves %s's annual FIES category anchors to the centavo", (persona) => {
  const targets = quarterlyPersonaTargets(persona, 2025);
  expect(targets.categories).toHaveLength(12);
  for (const row of targets.categories) {
    expect(row.quarters).toHaveLength(4);
    expect(row.quarters.every((amount) => Number.isSafeInteger(amount) && amount >= 0)).toBe(true);
    expect(row.quarters.reduce((a, b) => a + b, 0)).toBe(row.annualCentavos);
    expect(row.annualCentavos).toBe(Math.round(anchors.profiles[persona].annualCategoriesPhp[row.category] * 100));
  }
  const mapped = targets.categories.reduce((sum, row) => sum + row.annualCentavos, 0);
  expect(Math.abs(mapped + targets.unmappedAnnualCentavos - Math.round(anchors.profiles[persona].annualTotalExpensePhp * 100))).toBeLessThanOrEqual(2);
});

it("uses within-category temporal weights rather than a quarter's cross-category shares", () => {
  const targets = quarterlyPersonaTargets("seasonal-mom", 2025);
  const food = targets.categories.find((row) => row.category === "food")!;
  const transport = targets.categories.find((row) => row.category === "transport")!;
  // Independently transcribed current-price PSA values in the local ML data.
  const q4 = food.annualCentavos * 2_257_594 / (1_739_445 + 1_901_040 + 1_761_848 + 2_257_594);
  expect(Math.abs(food.quarters[3]! - q4)).toBeLessThan(1);
  expect(food.quarters[3]).toBeGreaterThan(food.quarters[0]!);
  expect(transport.quarters[2]).toBeGreaterThan(transport.quarters[1]!);
  expect(food.quarters[0]! / food.annualCentavos).not.toBeCloseTo(transport.quarters[0]! / transport.annualCentavos, 2);
});

it("uses matching complete HFCE years and labels templates for partial or unavailable years", () => {
  expect(quarterlyPersonaTargets("healthy-worker", 2024)).toMatchObject({ hfceYear: 2024, surveyYear: 2025, usesSeasonalTemplate: false });
  for (const year of [2022, 2026, 2028]) {
    const result = quarterlyPersonaTargets("healthy-worker", year);
    expect(result).toMatchObject({ hfceYear: 2025, usesSeasonalTemplate: true });
    expect(result.categories).toEqual(quarterlyPersonaTargets("healthy-worker", 2025).categories);
  }
  expect(() => quarterlyPersonaTargets("healthy-worker", NaN)).toThrow("year");
});

it("normalizes supported category mixes while retaining within-category subcategory proportions", () => {
  const items = [
    { slug: "food_groceries", share: 0.4 }, { slug: "food_fresh_produce", share: 0.2 },
    { slug: "transport_public", share: 0.4 },
  ];
  const result = personaFlexibleSpending("seasonal-mom", "2025-01-01", items);
  expect(result.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1, 12);
  expect(result[0]!.share / result[1]!.share).toBeCloseTo(2, 12);
  expect(items[0]!.share).toBe(0.4);
  expect(() => personaFlexibleSpending("seasonal-mom", "2025-01-01", [{ slug: "unknown", share: 1 }])).toThrow("No FIES category");
});

it("generates the projected quarterly flexible mix and uses the same mix in plans", () => {
  const subcategoryIds = new Map<string, string>(requiredSubcategorySlugs.map((slug) => [slug, randomUUID()]));
  const data = buildPersonaSeedData({ userId: randomUUID(), today: "2026-10-21", seed: 42, subcategoryIds, persona: "debt-burdened" });
  const items = [{ slug: "food_groceries", share: 0.65 }, { slug: "transport_public", share: 0.2 }, { slug: "restaurants_street_food", share: 0.15 }];
  const actualShares: number[] = [];
  for (const month of ["2025-01-01", "2025-04-01", "2025-07-01", "2025-10-01"]) {
    const period = `2025-Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`;
    const mix = personaFlexibleSpending("debt-burdened", month, items);
    const totals = items.map((item) => data.transactions.filter((row) => row.subcategory_id === subcategoryIds.get(item.slug) && row.transaction_date.slice(0, 4) === "2025" && Math.ceil(Number(row.transaction_date.slice(5, 7)) / 3) === Number(period.slice(-1))).reduce((sum, row) => sum + row.amount_centavos, 0));
    expect(totals.reduce((a, b) => a + b, 0)).toBe(7_000 * 3 * 100);
    for (const [index, item] of mix.entries()) {
      // At most one centavo per daily allocation goes to the last category.
      expect(Math.abs(totals[index]! - 7_000 * 3 * 100 * item.share)).toBeLessThan(190);
      const plan = data.financialPlans.find((row) => row.period_start === month)!;
      const allocation = data.planAllocations.find((row) => row.plan_id === plan.id && row.subcategory_id === subcategoryIds.get(item.slug))!;
      expect(Math.abs(Number(allocation.allocated_amount_centavos) - 7_000 * 100 * item.share)).toBeLessThanOrEqual(1);
    }
    actualShares.push(totals[0]! / (7_000 * 3 * 100));
  }
  expect(new Set(actualShares).size).toBe(4);
  const summary = summarizePersonaSpending("debt-burdened", data.transactions, subcategoryIds);
  const summarizedTotal = summary.reduce((sum, row) => sum + row.actualCentavos, 0);
  const categorizedExpenses = data.transactions.filter((row) => row.transaction_type === "expense" && row.subcategory_id).reduce((sum, row) => sum + row.amount_centavos, 0);
  expect(summarizedTotal).toBe(categorizedExpenses);
  expect(summarizedTotal).toBeLessThan(data.transactions.filter((row) => row.transaction_type === "expense").reduce((sum, row) => sum + row.amount_centavos, 0));
  expect(summary.filter((row) => row.period === "2026-Q4")).toHaveLength(12);
  expect(seedSpendingCategory("housing_internet")).toBe("housing_water_utilities");
  expect(seedSpendingCategory("income_salary")).toBeUndefined();
});
