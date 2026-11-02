import { randomUUID } from "node:crypto";
import { buildSeedData, requiredSubcategorySlugs } from "../history.js";
import { buildPersonaSeedData, demoPersonas, parseDemoPersona, personaHistoryMonths, seasonalSpending, type DemoPersona } from "../personas.js";

const subcategoryIds = new Map(requiredSubcategorySlugs.map((slug) => [slug, randomUUID()]));
const userId = randomUUID();
const build = (persona: DemoPersona, today = "2026-10-21") => buildPersonaSeedData({ userId, today, seed: 42, subcategoryIds, persona });

it("validates persona names and preserves the default option", () => {
  expect(parseDemoPersona(undefined)).toBeUndefined();
  expect(parseDemoPersona("seasonal-mom")).toBe("seasonal-mom");
  expect(() => parseDemoPersona("unknown")).toThrow("--persona must be");
  expect(() => parseDemoPersona("__proto__")).toThrow("--persona must be");
  const data = buildSeedData({ userId, today: "2026-10-21", seed: 42, subcategoryIds });
  expect(data.transactions.length).toBeGreaterThan(1_000);
  expect(data.savingsGoals).toEqual([]);
});

it("seeds four children's tuition only in Q1–Q2 with higher spending in those months", () => {
  const data = build("seasonal-mom");
  const tuition = data.transactions.filter((row) => row.subcategory_id === subcategoryIds.get("education_tuition"));
  // October 2024 to October 2026 holds two school years' January to June.
  expect(tuition).toHaveLength(48);
  expect(new Set(tuition.map((row) => row.notes)).size).toBe(4);
  expect(tuition.every((row) => Number(row.transaction_date.slice(5, 7)) <= 6)).toBe(true);
  expect(tuition.reduce((sum, row) => sum + row.amount_centavos, 0)).toBe(2 * 84_000 * 100);
  const plans = data.financialPlans;
  expect(plans.find((row) => row.period_start === "2026-01-01")?.required_funds_centavos).toBe(56_000 * 100);
  expect(plans.find((row) => row.period_start === "2026-07-01")?.required_funds_centavos).toBe(42_000 * 100);
});

it("sends half the debt-burdened worker's income to debt, still short of the required repayments", () => {
  const data = build("debt-burdened", "2026-09-30");
  expect(data.savingsGoals).toEqual([]);
  expect(data.accounts).toHaveLength(1);
  expect(data.accounts[0].current_balance_centavos).toBe(0);
  expect(data.debtAccounts).toHaveLength(2);
  const income = data.transactions.filter((row) => row.transaction_type === "income").reduce((sum, row) => sum + row.amount_centavos, 0);
  const repayments = data.debtPayments.reduce((sum, row) => sum + Number(row.amount_centavos), 0);
  expect(repayments).toBe(income / 2);
  expect(data.debtAccounts.reduce((sum, row) => sum + Number(row.minimum_payment_centavos), 0)).toBe(15_000 * 100);
  // Two separate pressures: the stock of debt is several months of income, and the monthly flow does not fit either.
  const outstanding = data.debtAccounts.reduce((sum, row) => sum + Number(row.current_balance_centavos), 0);
  expect(outstanding).toBeGreaterThan(4 * 25_000 * 100);
  expect(data.financialPlans.every((row) => Number(row.required_funds_centavos) === 27_500 * 100 && Number(row.available_funds_centavos) === 25_000 * 100 && row.shortfall_centavos === 2_500 * 100)).toBe(true);
  for (const debt of data.debtAccounts) {
    const principal = data.debtPayments.filter((row) => row.debt_account_id === debt.id).reduce((sum, row) => sum + Number(row.principal_centavos), 0);
    expect(debt.current_balance_centavos).toBe(Number(debt.original_balance_centavos) - principal);
  }
  expect(data.debtPayments.every((row) => Number(row.amount_centavos) === Number(row.principal_centavos) + Number(row.interest_centavos) && Number(row.principal_centavos) > 0)).toBe(true);
});

it("funds a separate six-month reserve and reconciles house contributions without counting transfers as expenses", () => {
  const data = build("healthy-worker");
  expect(data.debtAccounts).toEqual([]);
  const emergency = data.savingsGoals.find((row) => row.goal_type === "emergency_fund")!;
  expect(emergency.starting_amount_centavos).toBe(emergency.target_amount_centavos);
  expect(emergency.target_amount_centavos).toBe(35_000 * 6 * 100);
  const house = data.savingsGoals.find((row) => row.goal_type === "custom")!;
  const contributions = data.savingsGoalActivities.reduce((sum, row) => sum + Number(row.amount_centavos), 0);
  const houseAccount = data.accounts.find((row) => row.id === house.linked_account_id)!;
  expect(houseAccount.current_balance_centavos).toBe(Number(house.starting_amount_centavos) + contributions);
  expect(data.transactions.filter((row) => row.destination_savings_goal_id === house.id).every((row) => row.transaction_type === "transfer" && row.subcategory_id === null)).toBe(true);
  expect(data.planSavingsReservations).toHaveLength(25);
  expect(data.financialPlans.every((row) => row.shortfall_centavos === 0 && row.savings_surplus_centavos === 20_000 * 100)).toBe(true);
  expect(data.savingsGoalActivities).toHaveLength(25);
});

it("gives the healthy worker fluctuating monthly spending and occasional large purchases", () => {
  const data = build("healthy-worker");
  const expenses = data.transactions.filter((row) => row.transaction_type === "expense");
  const daily = new Set(["food_groceries", "transport_public", "restaurants_street_food"].map((slug) => subcategoryIds.get(slug)));
  const byMonth = new Map<string, number>();
  for (const row of expenses.filter((row) => daily.has(String(row.subcategory_id)) && row.transaction_date < "2026-10-01")) {
    byMonth.set(row.transaction_date.slice(0, 7), (byMonth.get(row.transaction_date.slice(0, 7)) ?? 0) + row.amount_centavos);
  }
  const totals = [...byMonth.values()];
  expect(totals).toHaveLength(24);
  expect(Math.max(...totals) - Math.min(...totals)).toBeGreaterThan(1_000 * 100);
  expect(totals.every((total) => total >= 17_000 * 100 && total <= 23_000 * 100)).toBe(true);
  const seasonal = new Set(Object.values(seasonalSpending["healthy-worker"]!).flat().map((spend) => spend.name));
  const large = expenses.filter((row) => row.amount_centavos >= 9_000 * 100 && !seasonal.has(String(row.notes)) && !data.scheduledPaymentRecords.some((record) => record.transaction_id === row.id));
  expect(large.map((row) => row.notes)).toEqual(["Air fryer and rice cooker", "Work wardrobe refresh", "Laptop replacement", "Parents' anniversary dinner"]);
});

it.each([
  ["seasonal-mom", [4, 5, 12]],
  ["healthy-worker", [1, 4, 5, 11, 12]],
] as const)("repeats %s's seasonal spending in the same months every year", (persona, months) => {
  const data = build(persona);
  const names = new Set(Object.values(seasonalSpending[persona]!).flat().map((spend) => spend.name));
  const seasonal = data.transactions.filter((row) => names.has(String(row.notes)));
  expect([...new Set(seasonal.map((row) => Number(row.transaction_date.slice(5, 7))))].sort((a, b) => a - b)).toEqual(months);
  // History runs October 2024 to October 2026, so each season appears in both years.
  const total = (month: string) => seasonal.filter((row) => row.transaction_date.startsWith(month)).reduce((sum, row) => sum + row.amount_centavos, 0);
  for (const month of months) {
    const expected = seasonalSpending[persona]![month]!.reduce((sum, spend) => sum + spend.pesos * 100, 0);
    for (const year of month >= 10 ? [2024, 2025] : [2025, 2026]) expect(total(`${year}-${String(month).padStart(2, "0")}`)).toBe(expected);
  }
});

it.each(["debt-burdened", "family-breadwinner"] as const)("keeps %s's spending free of seasonal peaks", (persona) => {
  expect(seasonalSpending[persona]).toBeUndefined();
});

it("sends 80% of the breadwinner's pay home and lives on the remaining 20%", () => {
  const data = build("family-breadwinner");
  const remittance = data.scheduledPayments.find((row) => row.is_family_support)!;
  expect(remittance).toMatchObject({ frequency: "semi_monthly", due_day_of_month: 1, due_second_day_of_month: 16, amount_centavos: 18_000 * 100 });
  const sent = data.transactions.filter((row) => row.notes === remittance.name);
  expect(sent).toHaveLength(50);
  const salary = data.transactions.filter((row) => row.transaction_type === "income").reduce((sum, row) => sum + row.amount_centavos, 0);
  expect(sent.reduce((sum, row) => sum + row.amount_centavos, 0)).toBe(salary * 0.8);
  // Household rent and groceries come out of the remittance, not the breadwinner's own account.
  for (const slug of ["housing_rent", "food_groceries", "housing_electricity"]) {
    expect(data.transactions.some((row) => row.subcategory_id === subcategoryIds.get(slug))).toBe(false);
  }
  expect(data.savingsGoals).toEqual([]);
  expect(data.debtAccounts).toEqual([]);
  expect(data.financialPlans.every((row) => Number(row.required_funds_centavos) === 45_000 * 100 && row.shortfall_centavos === 0)).toBe(true);
});

for (const persona of Object.keys(demoPersonas) as DemoPersona[]) {
  it.each(["2026-01-01", "2026-02-28", "2028-02-29", "2026-06-16", "2026-10-21", "2026-12-31"])(`${persona} has owned references and reconciled nonnegative cash on %s`, (today) => {
    const data = build(persona, today);
    const balances = new Map(data.accounts.map((row) => [row.id, Number(row.opening_balance_centavos)]));
    const goalIds = new Set(data.savingsGoals.map((row) => row.id));
    const transactionIds = new Set(data.transactions.map((row) => row.id));
    const months = personaHistoryMonths(today);
    expect(data.financialPlans).toHaveLength(months.length);
    // Eight full quarters before the current quarter, which starts the last three or fewer months.
    expect(months.length - 1 - ((Number(today.slice(5, 7)) - 1) % 3)).toBe(24);
    expect(Number(months[0]!.slice(5, 7)) % 3).toBe(1);
    expect(data.summary.start).toBe(months[0]);
    expect(data.transactions.length).toBeGreaterThan(1_000);
    for (const row of data.transactions) {
      expect(row.user_id).toBe(userId);
      expect(row.transaction_date >= data.summary.start && row.transaction_date <= today).toBe(true);
      expect(Number.isSafeInteger(row.amount_centavos) && row.amount_centavos > 0).toBe(true);
      for (const [id, sign] of [[row.source_account_id, -1], [row.destination_account_id, 1]] as const) {
        if (!id) continue;
        expect(balances.has(id)).toBe(true);
        balances.set(id, balances.get(id)! + sign * row.amount_centavos);
        expect(balances.get(id)).toBeGreaterThanOrEqual(0);
      }
    }
    for (const row of data.accounts) expect(row.current_balance_centavos).toBe(balances.get(row.id));
    for (const row of [...data.savingsGoalActivities, ...data.debtPayments, ...data.scheduledPaymentRecords]) {
      expect(row.user_id).toBe(userId);
      expect(transactionIds.has(String(row.transaction_id))).toBe(true);
    }
    for (const row of data.planSavingsReservations) expect(goalIds.has(row.savings_goal_id)).toBe(true);
  });
}
