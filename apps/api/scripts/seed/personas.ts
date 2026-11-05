import { randomUUID } from "node:crypto";
import {
  addDays, addMonths, centavos, createRandom, daysOfMonth, manilaNoon, monthDate,
  monthStartOf, nextMonthlyDate,
} from "./generation.js";
import { seedForecastModelVersion, seedMarker, type SeedData, type Transaction } from "./history.js";
import { personaFlexibleSpending } from "./persona-spending.js";

type Row = Record<string, unknown>;
// Fixed demo logins so every seeded environment shares the same credentials.
export const demoPersonas = {
  "seasonal-mom": { name: "Marissa Santos", email: "seasonal-mom@odin.demo", password: "501bBg7OVnYhVQ3RSk5*", salary: 60_000, openingCash: 30_000, living: 42_000, daily: 24_000 },
  "debt-burdened": { name: "Carlo Reyes", email: "debt-burdened@odin.demo", password: "rT_nLxeJ_3t7MP6cWb7_", salary: 25_000, openingCash: 0, living: 12_500, daily: 7_000 },
  "healthy-worker": { name: "Andrea Cruz", email: "healthy-worker@odin.demo", password: "9hYZw-og6Wg-SZuwVx7$", salary: 75_000, openingCash: 25_000, living: 35_000, daily: 20_000 },
  // Lives with their parents: the remittance pays the household's rent, food, and utilities, so living covers it too.
  "family-breadwinner": { name: "Joel Mendoza", email: "family-breadwinner@odin.demo", password: "HaxJi2ZDwEoNrfw9Ne2!", salary: 45_000, openingCash: 5_000, living: 45_000, daily: 8_000 },
} as const;
export type DemoPersona = keyof typeof demoPersonas;

export function parseDemoPersona(value: string | undefined): DemoPersona | undefined {
  if (value === undefined) return undefined;
  if (!Object.hasOwn(demoPersonas, value)) {
    throw new Error(`--persona must be one of: ${Object.keys(demoPersonas).join(", ")}`);
  }
  return value as DemoPersona;
}

type BuildOptions = { userId: string; today: string; seed: number; subcategoryIds: Map<string, string>; persona: DemoPersona };
// pesos is per occurrence; an expense with a second day is due twice a month.
type Expense = { slug: string; pesos: number; day: number; second?: number; name: string; familySupport?: boolean; notes?: string };
type DailySpend = { slug: string; share: number; name: string };

function dailySpending(persona: DemoPersona): DailySpend[] {
  // The household's groceries come out of the breadwinner's remittance, so their own spending is work-day costs.
  if (persona === "family-breadwinner") return [
    { slug: "transport_public", share: 0.45, name: "Daily commute" },
    { slug: "restaurants_street_food", share: 0.4, name: "Work lunches and merienda" },
    { slug: "misc_personal_care", share: 0.15, name: "Personal care and toiletries" },
  ];
  return [
    { slug: "food_groceries", share: 0.65, name: persona === "seasonal-mom" ? "Groceries for five" : "Daily groceries" },
    { slug: "transport_public", share: 0.2, name: "Daily commute" },
    { slug: "restaurants_street_food", share: 0.15, name: "Meals and household incidentals" },
  ];
}

// The debt-burdened worker owes PHP 15,000 a month but can pay only half his income, PHP 12,500, so each
// installment is partly paid and the rest goes overdue.
const burdenedDebts = [
  { name: "Personal loan", lender: "Demo Bank", balance: 260_000, rateBps: 1_200, required: 9_000, paid: 7_500, day: 5, termMonths: 48, purpose: "Consolidated living costs and emergency borrowing" },
  { name: "Online lending app loan", lender: "Demo Lending App", balance: 110_000, rateBps: 3_600, required: 6_000, paid: 5_000, day: 20, termMonths: 36, purpose: "Borrowed to cover rent and bills during a short month" },
];

// Spending that returns every year in the same calendar month (1–12), on top of the everyday budget.
// The debt-burdened worker and the breadwinner have no room for it.
type SeasonalSpend = { slug: string; pesos: number; day: number; name: string };
export const seasonalSpending: Partial<Record<DemoPersona, Record<number, SeasonalSpend[]>>> = {
  "seasonal-mom": {
    4: [{ slug: "recreation_sports", pesos: 3_500, day: 12, name: "Summer swimming lessons for the kids" }, { slug: "restaurants_casual_dining", pesos: 2_500, day: 26, name: "Summer family outing" }],
    5: [{ slug: "recreation_sports", pesos: 3_500, day: 10, name: "Summer swimming lessons for the kids" }, { slug: "restaurants_casual_dining", pesos: 3_000, day: 24, name: "Summer beach day with the family" }],
    12: [
      { slug: "clothing_childrens", pesos: 6_000, day: 12, name: "Christmas clothes for the kids" },
      { slug: "misc_other", pesos: 5_000, day: 18, name: "Christmas gifts and aguinaldo" },
      { slug: "food_fresh_produce", pesos: 8_000, day: 23, name: "Noche Buena feast" },
    ],
  },
  "healthy-worker": {
    1: [{ slug: "food_fresh_produce", pesos: 4_000, day: 1, name: "Media Noche feast" }, { slug: "restaurants_catering", pesos: 3_000, day: 2, name: "New Year's handaan with friends" }],
    4: [{ slug: "recreation_sports", pesos: 12_000, day: 10, name: "Summer island-hopping trip" }, { slug: "transport_ride_hailing", pesos: 2_500, day: 10, name: "Airport rides for summer trip" }],
    5: [{ slug: "recreation_sports", pesos: 6_000, day: 17, name: "Summer weekend beach getaway" }],
    11: [{ slug: "transport_ride_hailing", pesos: 4_500, day: 1, name: "Undas trip to the province" }, { slug: "misc_other", pesos: 1_500, day: 1, name: "Undas flowers and candles" }],
    12: [
      { slug: "misc_other", pesos: 12_000, day: 15, name: "Christmas gifts" },
      { slug: "restaurants_catering", pesos: 4_000, day: 19, name: "Christmas party catering share" },
      { slug: "food_fresh_produce", pesos: 6_000, day: 23, name: "Noche Buena feast" },
    ],
  },
};

// The healthy worker's regular discretionary spending, each a few times a month. Amounts cycle through a fixed
// spread so, once six are on record, a regular purchase never falls outside the IQR range of earlier ones.
const regularVariation = [0.85, 1.05, 1.15, 0.95, 1.1, 0.9];
const healthyRegularSpending = [
  { slug: "clothing_womens", pesos: 1_500, days: [7], name: "Online clothes shopping" },
  { slug: "restaurants_casual_dining", pesos: 1_400, days: [9, 24], name: "Dinner out with friends" },
  { slug: "household_kitchenware", pesos: 600, days: [13], name: "Kitchen and home supplies" },
  { slug: "communication_device", pesos: 700, days: [15], name: "Phone and gadget accessories" },
];

// Unplanned one-off purchases, keyed by how many months before the current month they happen. Each lands in a
// subcategory with at least six purchases inside the IQR check's 12-month window, so it is flagged and the
// forecast leaves it out.
const healthyLargePurchases: Record<number, { slug: string; pesos: number; name: string }> = {
  6: { slug: "household_kitchenware", pesos: 9_500, name: "Air fryer and rice cooker" },
  5: { slug: "clothing_womens", pesos: 12_000, name: "Work wardrobe refresh" },
  3: { slug: "communication_device", pesos: 42_000, name: "Laptop replacement" },
  2: { slug: "restaurants_casual_dining", pesos: 9_000, name: "Parents' anniversary dinner" },
};

function recurringExpenses(persona: DemoPersona): Expense[] {
  if (persona === "seasonal-mom") return [
    { slug: "housing_rent", pesos: 12_000, day: 2, name: "Family apartment rent" },
    { slug: "housing_electricity", pesos: 4_500, day: 8, name: "Household utilities" },
    { slug: "housing_internet", pesos: 1_500, day: 10, name: "Home internet" },
  ];
  if (persona === "debt-burdened") return [
    { slug: "housing_rent", pesos: 4_500, day: 16, name: "Bedspace rent" },
    { slug: "housing_electricity", pesos: 1_000, day: 18, name: "Electricity share" },
  ];
  if (persona === "family-breadwinner") return [
    { slug: "misc_other", pesos: 18_000, day: 1, second: 16, name: "Padala kay Nanay at Tatay", familySupport: true, notes: "80% of take-home pay; covers the family home's rent, food, and utilities." },
    { slug: "communication_mobile_postpaid", pesos: 1_000, day: 20, name: "Mobile postpaid plan" },
  ];
  return [
    { slug: "housing_rent", pesos: 12_000, day: 2, name: "Condo rent" },
    { slug: "housing_electricity", pesos: 2_000, day: 8, name: "Household utilities" },
    { slug: "housing_internet", pesos: 1_000, day: 10, name: "Home internet" },
  ];
}

function emptySeedData(start: string, today: string): SeedData {
  return {
    accounts: [], savingsGoals: [], savingsGoalActivities: [], incomeSources: [], debtAccounts: [],
    creditCardDetails: [], creditCardCycles: [], transactions: [], creditCardTransactions: [], creditCardStatements: [],
    creditCardPayments: [], debtPayments: [], scheduledPayments: [], scheduledPaymentRecords: [], financialPlans: [],
    planForecastPoints: [], planAllocations: [], planDebtReservations: [], planSavingsReservations: [], availableCreditAdjustments: [],
    summary: { start, end: today, endingBalances: {} },
  };
}

// Split a fixed half-month budget into varied daily amounts without inventing cash or overdrawing payday funds.
function distributeBudget(total: number, dates: string[], random: () => number) {
  const weights = dates.map(() => 0.8 + random() * 0.4);
  const sum = weights.reduce((a, b) => a + b, 0);
  let allocated = 0;
  return dates.map((date, index) => {
    const amount = index === dates.length - 1 ? total - allocated : Math.floor(total * weights[index] / sum);
    allocated += amount;
    return { date, amount };
  });
}

function reconcileBalances(data: SeedData) {
  const balances = new Map(data.accounts.map((row) => [String(row.id), Number(row.opening_balance_centavos)]));
  const order = { income: 0, transfer: 1, expense: 2 };
  data.transactions.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || order[a.transaction_type] - order[b.transaction_type]);
  for (const row of data.transactions) {
    for (const [id, sign] of [[row.source_account_id, -1], [row.destination_account_id, 1]] as const) {
      if (!id) continue;
      const previous = balances.get(id);
      if (previous === undefined) throw new Error("Persona transaction references an unknown account");
      const balance = previous + sign * row.amount_centavos;
      if (balance < 0) throw new Error(`Persona overdraws an account on ${row.transaction_date}`);
      balances.set(id, balance);
    }
  }
  for (const account of data.accounts) account.current_balance_centavos = balances.get(String(account.id));
  data.summary.endingBalances = Object.fromEntries(data.accounts.map((row) => [String(row.name), Number(row.current_balance_centavos)]));
}

// The eight full quarters before the current one, plus the current quarter to date, so the forecast chart
// can show two years of actual quarterly spending.
const PERSONA_HISTORY_QUARTERS = 8;
export function personaHistoryMonths(today: string) {
  const currentMonth = monthStartOf(today);
  const quarterStart = addMonths(currentMonth, -((Number(today.slice(5, 7)) - 1) % 3));
  const first = addMonths(quarterStart, -PERSONA_HISTORY_QUARTERS * 3);
  const count = (Number(currentMonth.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(currentMonth.slice(5, 7)) - Number(first.slice(5, 7)) + 1;
  return Array.from({ length: count }, (_, index) => addMonths(first, index));
}

export function buildPersonaSeedData({ userId, today, seed, subcategoryIds, persona }: BuildOptions): SeedData {
  const config = demoPersonas[persona];
  const random = createRandom(seed);
  const months = personaHistoryMonths(today);
  const data = emptySeedData(months[0], today);
  const metadata = { dummy_data_source: seedMarker, generated_seed: seed, demo_persona: persona };
  const syncFields = { user_id: userId, version: 1, deleted: false };
  const owned = { ...syncFields, metadata };
  const subcategory = (slug: string) => {
    const id = subcategoryIds.get(slug);
    if (!id) throw new Error(`Missing subcategory ${slug}`);
    return id;
  };
  const account = (name: string, pesos: number, kind = "bank") => {
    const id = randomUUID();
    data.accounts.push({ ...owned, id, name, kind, institution_name: "Demo Bank", opening_balance_centavos: centavos(pesos), current_balance_centavos: centavos(pesos), include_in_dashboard_balance: true, opened_on: months[0], sort_order: data.accounts.length + 1 });
    return id;
  };
  const bank = account("Payroll Account", config.openingCash);
  const transaction = (date: string, type: Transaction["transaction_type"], amount: number, source: string | null, destination: string | null, notes: string, slug?: string, extra: Row = {}) => {
    const row: Transaction = {
      ...owned, id: randomUUID(), transaction_type: type, transaction_date: date, amount_centavos: amount,
      source_account_id: source, destination_account_id: destination, category_id: null, subcategory_id: slug ? subcategory(slug) : null,
      client_mutation_id: randomUUID(), status: "posted", entry_source: "manual", posted_at: manilaNoon(date), merchant_name: notes, notes, ...extra,
    };
    if (date <= today) data.transactions.push(row);
    return row;
  };
  const salaryId = randomUUID();
  data.incomeSources.push({ ...owned, id: salaryId, name: `${config.name} — Salary`, frequency: "semi_monthly", expected_amount_centavos: centavos(config.salary / 2), payday_day_of_month: 1, payday_second_day_of_month: 16, next_expected_date: [nextMonthlyDate(today, 1), nextMonthlyDate(today, 16)].sort()[0], is_active: true, destination_account_id: bank, subcategory_id: subcategory("income_salary"), notes: "Net take-home pay, twice monthly." });

  const expenses = recurringExpenses(persona);
  for (const spec of expenses) {
    data.scheduledPayments.push({ ...syncFields, id: randomUUID(), name: spec.name, subcategory_id: subcategory(spec.slug), source_account_id: bank, amount_centavos: centavos(spec.pesos), frequency: spec.second ? "semi_monthly" : "monthly", due_day_of_month: spec.day, due_second_day_of_month: spec.second ?? null, starts_on: months[0], auto_post: false, is_family_support: spec.familySupport ?? false, is_dependent_support: false, protected_by_default: true, notes: spec.notes ?? null, status: "active" });
  }
  const houseAccount = persona === "healthy-worker" ? account("House Deposit Savings", 60_000, "savings") : null;
  if (persona === "healthy-worker") {
    const emergencyAccount = account("Emergency Fund", 210_000, "savings");
    data.savingsGoals.push({ ...owned, id: randomUUID(), linked_account_id: emergencyAccount, name: "Six-month emergency fund", is_emergency_fund: true, target_amount_centavos: centavos(210_000), starting_amount_centavos: centavos(210_000), emergency_fund_baseline_centavos: centavos(35_000), emergency_fund_target_method: "essential_expense_coverage", essential_expense_coverage_months: 6, priority: "high", status: "active", notes: "Fully funded reserve; separate from house deposit savings." });
    data.savingsGoals.push({ ...owned, id: randomUUID(), linked_account_id: houseAccount, name: "House deposit", target_amount_centavos: centavos(600_000), starting_amount_centavos: centavos(60_000), target_date: monthDate(addMonths(monthStartOf(today), 24), 16), priority: "medium", status: "active", planned_contribution_amount_centavos: centavos(20_000), contribution_frequency: "monthly", contribution_interval_count: 1, contribution_day_of_month: 16, next_contribution_date: nextMonthlyDate(today, 16), notes: "Consistent monthly contributions alongside a fully funded emergency reserve." });
  }

  const debts = persona === "debt-burdened" ? burdenedDebts.map((spec) => ({ ...spec, id: randomUUID(), balanceCentavos: centavos(spec.balance) })) : [];
  for (const [monthIndex, month] of months.entries()) {
    const spending = personaFlexibleSpending(persona, month, dailySpending(persona));
    for (const day of [1, 16]) transaction(monthDate(month, day), "income", centavos(config.salary / 2), null, bank, "Net salary", "income_salary");
    for (const [index, spec] of expenses.entries()) {
      for (const day of spec.second ? [spec.day, spec.second] : [spec.day]) {
        const date = monthDate(month, day);
        if (date > today) continue;
        const row = transaction(date, "expense", centavos(spec.pesos), bank, null, spec.name, spec.slug);
        data.scheduledPaymentRecords.push({ id: randomUUID(), user_id: userId, scheduled_payment_id: data.scheduledPayments[index].id, transaction_id: row.id, occurrence_date: date, payment_date: date, amount_centavos: row.amount_centavos, source: "manual", version: 1, deleted: false });
      }
    }
    // The healthy worker's day-to-day spending drifts 15% either side of budget; the others hold to theirs.
    const monthDaily = persona === "healthy-worker" ? Math.round(config.daily * (0.85 + random() * 0.3)) : config.daily;
    const dates = daysOfMonth(month);
    for (const half of [dates.slice(0, 15), dates.slice(15)]) {
      for (const { date, amount } of distributeBudget(centavos(monthDaily / 2), half, random)) {
        let allocated = 0;
        for (const [index, item] of spending.entries()) {
          const part = index === spending.length - 1 ? amount - allocated : Math.floor(amount * item.share);
          allocated += part;
          transaction(date, "expense", part, bank, null, item.name, item.slug);
        }
      }
    }
    for (const spend of seasonalSpending[persona]?.[Number(month.slice(5, 7))] ?? []) transaction(monthDate(month, spend.day), "expense", centavos(spend.pesos), bank, null, spend.name, spend.slug);
    if (persona === "healthy-worker") {
      for (const spend of healthyRegularSpending) {
        for (const [dayIndex, day] of spend.days.entries()) {
          const factor = regularVariation[(monthIndex * spend.days.length + dayIndex) % regularVariation.length]!;
          transaction(monthDate(month, day), "expense", centavos(Math.round(spend.pesos * factor)), bank, null, spend.name, spend.slug);
        }
      }
    }
    const purchase = persona === "healthy-worker" ? healthyLargePurchases[months.length - 1 - monthIndex] : undefined;
    if (purchase) transaction(monthDate(month, 22), "expense", centavos(purchase.pesos), bank, null, purchase.name, purchase.slug);
    const tuition = persona === "seasonal-mom" && Number(month.slice(5, 7)) <= 6 ? 14_000 : 0;
    if (tuition) for (const child of ["Aira", "Ben", "Chloe", "Diego"]) transaction(monthDate(month, 20), "expense", centavos(tuition / 4), bank, null, `${child} — school fees and tuition`, "education_tuition");
    for (const debt of debts) {
      const date = monthDate(month, debt.day);
      if (date > today) continue;
      const interest = Math.round(debt.balanceCentavos * debt.rateBps / 10_000 / 12);
      const principal = centavos(debt.paid) - interest;
      const paymentId = randomUUID();
      const row = transaction(date, "expense", centavos(debt.paid), bank, null, `Partial ${debt.name.toLowerCase()} repayment`, undefined, { client_mutation_id: `debt-payment:${paymentId}` });
      data.debtPayments.push({ ...owned, id: paymentId, debt_account_id: debt.id, transaction_id: row.id, source: "transaction", payment_date: date, amount_centavos: row.amount_centavos, principal_centavos: principal, interest_centavos: interest, notes: `Only PHP ${debt.paid.toLocaleString("en-PH")} paid against PHP ${debt.required.toLocaleString("en-PH")} required; the rest is overdue.` });
      debt.balanceCentavos -= principal;
    }
    if (houseAccount && monthDate(month, 16) <= today) {
      const date = monthDate(month, 16);
      const goal = data.savingsGoals.find((row) => row.linked_account_id === houseAccount)!;
      const row = transaction(date, "transfer", centavos(20_000), bank, houseAccount, "Monthly house deposit contribution", undefined, { destination_savings_goal_id: goal.id });
      data.savingsGoalActivities.push({ id: randomUUID(), user_id: userId, savings_goal_id: goal.id, transaction_id: row.id, activity_kind: "contribution", amount_centavos: row.amount_centavos, activity_date: date, notes: "Monthly house deposit contribution", version: 1, deleted: false });
    }
    addMonthlyPlan(data, { month, userId, salary: config.salary, tuition, expenses, spending, daily: config.daily, debts, houseGoalId: houseAccount ? String(data.savingsGoals[1].id) : null, subcategory });
  }
  for (const debt of debts) data.debtAccounts.push({
    ...owned, id: debt.id, linked_account_id: bank, name: `${debt.name} — overdue installments`, lender_name: debt.lender, preset_key: "personal_loan", status: "active",
    original_balance_centavos: centavos(debt.balance), current_balance_centavos: debt.balanceCentavos, annual_interest_rate_bps: debt.rateBps, minimum_payment_centavos: centavos(debt.required),
    due_day_of_month: debt.day, opened_on: addDays(months[0], -1), payment_frequency: "monthly", payment_schedule: {}, next_due_date: monthDate(months[0], debt.day),
    interest_period: "annual", interest_method: "diminishing_balance", preset_data: { startDate: addDays(months[0], -1), feesCentavos: 0, penaltyInfo: null, termMonths: debt.termMonths, personalLoan: { purpose: debt.purpose } },
    notes: "PHP 25,000 income; half (PHP 12,500) goes to debt against PHP 15,000 required, leaving PHP 12,500 for living costs. No savings or emergency fund.",
  });
  reconcileBalances(data);
  return data;
}

type PlanOptions = { month: string; userId: string; salary: number; tuition: number; expenses: Expense[]; spending: DailySpend[]; daily: number; debts: { id: string; required: number; day: number }[]; houseGoalId: string | null; subcategory: (slug: string) => string };
function addMonthlyPlan(data: SeedData, options: PlanOptions) {
  const { month, userId, salary, tuition, expenses, spending, daily, debts, houseGoalId, subcategory } = options;
  const planId = randomUUID();
  let allocatedDaily = 0;
  const dailyAllocations = spending.map((item, index) => {
    const amount = index === spending.length - 1 ? centavos(daily) - allocatedDaily : centavos(daily * item.share);
    allocatedDaily += amount;
    return { slug: item.slug, pesos: amount / 100, fixed: false };
  });
  const allocations = [...expenses.map((spec) => ({ slug: spec.slug, pesos: spec.pesos * (spec.second ? 2 : 1), fixed: true })),
    ...dailyAllocations,
    ...(tuition ? [{ slug: "education_tuition", pesos: tuition, fixed: true }] : []),
  ];
  const living = allocations.reduce((sum, spec) => sum + centavos(spec.pesos), 0);
  const required = living + debts.reduce((sum, debt) => sum + centavos(debt.required), 0) + (houseGoalId ? centavos(20_000) : 0);
  const remaining = centavos(salary) - required;
  data.financialPlans.push({ id: planId, user_id: userId, period_start: month, period_end: addDays(addMonths(month, 1), -1), status: "accepted", forecast_month: month.slice(0, 7), forecast_total_centavos: living, forecast_model_version: seedForecastModelVersion, forecast_generated_at: manilaNoon(addDays(month, -1)), forecast_quality: month === data.summary.start ? "COLD_START" : "PERSONALIZED", available_funds_centavos: centavos(salary), required_funds_centavos: required, shortfall_centavos: Math.max(0, -remaining), savings_surplus_centavos: Math.max(0, remaining), debt_surplus_centavos: 0, version: 1, deleted: false });
  for (const spec of allocations) {
    const id = subcategory(spec.slug);
    const amount = centavos(spec.pesos);
    data.planAllocations.push({ id: randomUUID(), plan_id: planId, category_id: null, subcategory_id: id, allocation_rule: spec.fixed ? "FIXED" : "FLEXIBLE", allocated_amount_centavos: amount, floor_amount_centavos: spec.fixed ? amount : Math.floor(amount * 0.6), ceiling_amount_centavos: spec.fixed ? amount : null, forecast_amount_centavos: amount });
    data.planForecastPoints.push({ plan_id: planId, category_key: id, amount_centavos: amount });
  }
  if (houseGoalId) data.planSavingsReservations.push({ id: randomUUID(), plan_id: planId, savings_goal_id: houseGoalId, amount_centavos: centavos(20_000), due_date: monthDate(month, 16) });
  for (const debt of debts) data.planDebtReservations.push({ id: randomUUID(), plan_id: planId, debt_account_id: debt.id, credit_card_statement_id: null, amount_centavos: centavos(debt.required), due_date: monthDate(month, debt.day) });
}
