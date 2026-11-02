// Refresh the portable aggregate fixture from the sibling repository's cleaned tables.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { demoPersonas, type DemoPersona } from "./seed/personas.js";
import { spendingCategories, type SpendingCategory } from "./seed/persona-spending.js";

type CsvRow = Record<string, string>;
const sourcePaths = {
  households: "RAW/cleaned/households.csv",
  categories: "RAW/cleaned/household_categories.csv",
  hfce: "training/datasets/hfce_v4/hfce_category_forecast_2000_2026.csv",
};
const householdSizes: Record<DemoPersona, number> = {
  "seasonal-mom": 5, "debt-burdened": 1, "healthy-worker": 1, "family-breadwinner": 3,
};

function numeric(row: CsvRow, column: string) {
  const raw = row[column];
  const value = Number(raw);
  if (raw === undefined || raw.trim() === "" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Missing or invalid nonnegative source value: ${column}`);
  }
  return value;
}

function readTable(root: string, relativePath: string) {
  const bytes = readFileSync(resolve(root, relativePath));
  const lines = bytes.toString("utf8").trimEnd().split(/\r?\n/);
  const header = lines.shift()!.split(",");
  const rows = lines.map((line) => {
    const cells = line.split(",");
    // These numeric cleaned exports have no quoted fields. Fail closed if their CSV dialect changes.
    if (line.includes('"') || cells.length !== header.length) throw new Error(`Unsupported cleaned CSV format: ${relativePath}`);
    return Object.fromEntries(header.map((column, index) => [column, cells[index]!])) as CsvRow;
  });
  return { rows, source: { path: relativePath, sha256: createHash("sha256").update(bytes).digest("hex") } };
}

function disjointCategories(row: CsvRow, household: CsvRow) {
  const amounts = Object.fromEntries(spendingCategories.map((category) => [category, numeric(row, category)])) as Record<SpendingCategory, number>;
  amounts.food -= amounts.restaurants_hotels;
  const residual = numeric(household, "annual_total_expense_php") - Object.values(amounts).reduce((a, b) => a + b, 0);
  if (amounts.food < 0 || residual < -0.011) throw new Error("FIES food/restaurant mapping does not reconcile");
  return { amounts, residual: Math.max(0, residual) };
}

function cohortProfile(persona: DemoPersona, households: CsvRow[], categories: Map<string, CsvRow>) {
  const annualSalary = demoPersonas[persona].salary * 12;
  const distance = (row: CsvRow) => Math.abs(Math.log(Math.max(numeric(row, "annual_income_php"), 1) / annualSalary));
  const selected = households.filter((row) => numeric(row, "household_size") === householdSizes[persona])
    .sort((a, b) => distance(a) - distance(b) || (a.household_id! < b.household_id! ? -1 : a.household_id! > b.household_id! ? 1 : 0)).slice(0, 50);
  if (selected.length !== 50) throw new Error(`Not enough FIES households for ${persona}`);
  const mapped = selected.map((row) => {
    const categoryRow = categories.get(row.household_id!);
    if (!categoryRow) throw new Error("FIES household is missing category anchors");
    return disjointCategories(categoryRow, row);
  });
  const mean = (column: string) => selected.reduce((sum, row) => sum + numeric(row, column), 0) / selected.length;
  const incomes = selected.map((row) => numeric(row, "annual_income_php"));
  return {
    householdSize: householdSizes[persona], count: selected.length,
    incomeRangePhp: [Math.min(...incomes), Math.max(...incomes)], annualIncomePhp: mean("annual_income_php"),
    annualTotalExpensePhp: mean("annual_total_expense_php"),
    unmappedResidualPhp: mapped.reduce((sum, row) => sum + row.residual, 0) / mapped.length,
    annualCategoriesPhp: Object.fromEntries(spendingCategories.map((category) => [category, mapped.reduce((sum, row) => sum + row.amounts[category], 0) / mapped.length])),
  };
}

function completeHfceYears(rows: CsvRow[]) {
  const years: Record<string, Record<string, number[]>> = {};
  for (const row of rows.filter((value) => ["2023", "2024", "2025"].includes(value.year!))) {
    const category = row.category!;
    const quarter = numeric(row, "quarter");
    if (!spendingCategories.includes(category as SpendingCategory) || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) throw new Error("Invalid HFCE category or quarter");
    const values = (years[row.year!] ??= {})[category] ??= Array<number>(4).fill(-1);
    if (values[quarter - 1] !== -1) throw new Error("Repeated HFCE category-quarter");
    values[quarter - 1] = numeric(row, "current_price_million_php");
  }
  for (const year of ["2023", "2024", "2025"]) {
    for (const category of spendingCategories) {
      const values = years[year]?.[category];
      if (!values || values.some((value) => value < 0) || values.reduce((a, b) => a + b, 0) <= 0) throw new Error("Incomplete HFCE year");
    }
  }
  return years;
}

function main() {
  const root = process.argv[2];
  if (!root) throw new Error("Usage: pnpm --filter api persona-spending:export <odin-ml directory>");
  const households = readTable(root, sourcePaths.households);
  const categories = readTable(root, sourcePaths.categories);
  const hfce = readTable(root, sourcePaths.hfce);
  const surveyHouseholds = households.rows.filter((row) => row.survey_year === "2025");
  const categoryRows = categories.rows.filter((row) => row.year === "2025");
  const categoryMap = new Map(categoryRows.map((row) => [row.household_id!, row]));
  if (categoryMap.size !== categoryRows.length || new Set(surveyHouseholds.map((row) => row.household_id)).size !== surveyHouseholds.length) throw new Error("Duplicate 2025 FIES household");
  if (surveyHouseholds.some((row) => row.region !== "NCR" || !row.household_id)) throw new Error("Expected identified NCR household rows");
  const fixture = {
    surveyYear: 2025, region: "NCR",
    selection: "Unweighted mean of 50 households of the specified exact household size, nearest to persona annual net salary by absolute log income ratio; household_id breaks ties. Descriptive seed anchors, not population estimates.",
    sources: { households: households.source, categories: categories.source, hfce: hfce.source },
    fallbackHfceYear: 2025,
    profiles: Object.fromEntries((Object.keys(demoPersonas) as DemoPersona[]).map((persona) => [persona, cohortProfile(persona, surveyHouseholds, categoryMap)])),
    hfceCurrentPrices: completeHfceYears(hfce.rows),
    categoryAdjustment: "The 2025 cleaned food anchor includes FOOD_OUTSIDE, also used as the restaurants_hotels proxy. Subtract restaurants_hotels from food before averaging, then recompute non-negative residual = TOTEX - sum(disjoint categories). Accept source rounding differences of at most PHP 0.01 per household.",
  };
  writeFileSync(new URL("./fixtures/persona-spending.json", import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
  console.log("Exported four aggregate persona anchors and three complete HFCE years; no household identifiers.");
}

main();
