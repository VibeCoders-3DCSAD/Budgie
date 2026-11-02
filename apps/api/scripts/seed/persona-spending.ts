import anchors from "../fixtures/persona-spending.json" with { type: "json" };
import type { DemoPersona } from "./personas.js";
import type { Transaction } from "./history.js";
import { centavos } from "./generation.js";

export type SpendingCategory = keyof typeof anchors.profiles["seasonal-mom"]["annualCategoriesPhp"];
export const spendingCategories = Object.keys(anchors.profiles["seasonal-mom"].annualCategoriesPhp) as SpendingCategory[];

const categoryPrefixes: Record<string, SpendingCategory> = {
  food: "food", alcohol: "alcohol_tobacco", tobacco: "alcohol_tobacco",
  clothing: "clothing_footwear", housing: "housing_water_utilities", household: "furnishings_household",
  health: "health", transport: "transport", communication: "communication", recreation: "recreation_culture",
  education: "education", restaurants: "restaurants_hotels", misc: "miscellaneous_goods_services",
};

export function seedSpendingCategory(slug: string): SpendingCategory | undefined {
  return categoryPrefixes[slug.split("_")[0]!];
}

// Largest remainders conserve every annual centavo without making Q4 a rounding sink.
function allocateAnnual(total: number, values: number[]) {
  if (!Number.isSafeInteger(total) || total < 0 || values.length !== 4 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Invalid annual spending anchor or HFCE quarters");
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error("HFCE annual total must be positive");
  const exact = values.map((value) => total * value / sum);
  const amounts = exact.map(Math.floor);
  const order = exact.map((value, index) => ({ index, remainder: value - amounts[index]! }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remaining = total - amounts.reduce((a, b) => a + b, 0);
  for (const { index } of order.slice(0, remaining)) amounts[index]! += 1;
  return amounts;
}

export function quarterlyPersonaTargets(persona: DemoPersona, year: number) {
  if (!Number.isInteger(year) || year < 1) throw new Error("Target year must be a positive integer");
  const years: Record<string, Record<SpendingCategory, number[]>> = anchors.hfceCurrentPrices;
  const hfceYear = Object.hasOwn(years, String(year)) ? year : anchors.fallbackHfceYear;
  const profile = anchors.profiles[persona];
  return {
    surveyYear: anchors.surveyYear,
    hfceYear,
    usesSeasonalTemplate: hfceYear !== year,
    // The same 2025 annual anchor is reused across synthetic history, without invented inflation.
    unmappedAnnualCentavos: centavos(profile.unmappedResidualPhp),
    categories: spendingCategories.map((category) => ({
      category,
      annualCentavos: centavos(profile.annualCategoriesPhp[category]),
      quarters: allocateAnnual(centavos(profile.annualCategoriesPhp[category]), years[String(hfceYear)]![category]),
    })),
  };
}

// Project only supported categories onto the existing monthly cash envelope. Fixed bills and story events
// stay outside this projection. This intentionally differs from the unconstrained FIES annual amounts.
export function personaFlexibleSpending<T extends { slug: string; share: number }>(persona: DemoPersona, month: string, items: T[]): T[] {
  const quarter = Math.floor((Number(month.slice(5, 7)) - 1) / 3);
  const targets = quarterlyPersonaTargets(persona, Number(month.slice(0, 4)));
  const categoryShares = new Map<SpendingCategory, number>();
  for (const item of items) {
    const category = seedSpendingCategory(item.slug);
    if (!category) throw new Error(`No FIES category for flexible spending: ${item.slug}`);
    categoryShares.set(category, (categoryShares.get(category) ?? 0) + item.share);
  }
  const supported = targets.categories.filter((row) => categoryShares.has(row.category));
  const total = supported.reduce((sum, row) => sum + row.quarters[quarter]!, 0);
  if (total <= 0) throw new Error("Supported FIES spending categories have no quarterly expenditure");
  return items.map((item) => {
    const category = seedSpendingCategory(item.slug)!;
    const target = supported.find((row) => row.category === category)!;
    return { ...item, share: target.quarters[quarter]! / total * item.share / categoryShares.get(category)! };
  });
}

export function summarizePersonaSpending(persona: DemoPersona, transactions: Transaction[], subcategoryIds: Map<string, string>) {
  const slugs = new Map([...subcategoryIds].map(([slug, id]) => [id, slug]));
  const actual = new Map<string, number>();
  const quarters = new Set<string>();
  for (const row of transactions) {
    const year = row.transaction_date.slice(0, 4);
    const quarter = Math.ceil(Number(row.transaction_date.slice(5, 7)) / 3);
    const period = `${year}-Q${quarter}`;
    quarters.add(period);
    if (row.transaction_type !== "expense" || !row.subcategory_id) continue;
    const category = seedSpendingCategory(slugs.get(row.subcategory_id) ?? "");
    if (!category) throw new Error("Persona expense has no HFCE category mapping");
    const key = `${period}:${category}`;
    actual.set(key, (actual.get(key) ?? 0) + row.amount_centavos);
  }
  return [...quarters].sort().flatMap((period) => {
    const year = Number(period.slice(0, 4));
    const quarter = Number(period.slice(-1));
    const target = quarterlyPersonaTargets(persona, year);
    return target.categories.map((row) => ({
      period, category: row.category, hfceYear: target.hfceYear, usesSeasonalTemplate: target.usesSeasonalTemplate,
      targetCentavos: row.quarters[quarter - 1]!, actualCentavos: actual.get(`${period}:${row.category}`) ?? 0,
    }));
  });
}
