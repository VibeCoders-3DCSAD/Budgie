import { planForecastTransactions } from "./helpers/forecastTransactions.js";
import { buildFinancialPlanExplanationContext } from "./helpers/explanationContext.js";
import { FinancialPlanInputError, FinancialPlanUnavailableError } from "./errors.js";
export { FinancialPlanInputError, FinancialPlanUnavailableError } from "./errors.js";
export { scheduledReservationDates } from "./commitmentSchedule.js";
import { applyCommitmentBudgets, commitmentKey, validateCommitmentBudgets, type CommitmentBudget } from "./commitments.js";
import { dueCommitments, queryCommitmentRows } from "./commitmentsLoader.js";
import type { ManualAllocation, ReservationSkips } from "./recommendationRequest.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ForecastUnavailableError, ForecastUpstreamError, ForecastValidationError, getMlForecast, type ForecastPayload } from "../forecast/forecastService.js";
import { recommendPlanCategories, type MlExpenseForecastSnapshot, type MlPlanCategory } from "./mlAdapter.js";
import { isUserFacingFinancialPlanExplanation, zeroAllocationExplanations, type FinancialPlanEvidence } from "./explanationService.js";
import { deterministicFinancialPlanExplanations, type FinancialPlanExplanationRequest } from "./explanationRequest.js";
import { deriveSurplusRecommendation } from "./classificationPolicy.js";
import { createFinancialConditionAssessment } from "../classification/financialConditionAssessmentService.js";
import { getServiceRoleClient } from "../../lib/supabase.js";
import { scheduledCategoryAmounts, subtractScheduledRequirements } from "./helpers/scheduledCategoryAmounts.js";
import { normalizeCustomEvents, eventMonthLabel } from "@odin/spending-insights/seasons.js";
import { historyWindow, isFullYear, seasonalMonthSpend } from "@odin/spending-insights/seasonalMonth.js";
import { recurringMonthSpend } from "@odin/spending-insights/recurringMonths.js";
import { recurringSpendBySlug, unusualSpending, withRecurringSpend, type AnomalyEvaluation } from "./helpers/recurringSpending.js";
import { currentCalendarMonth, MANILA_TIME_ZONE } from "../../lib/date/manila.js";
import { financialPlanPeriod, forecastHistoryStart, MAX_HISTORY } from "./period.js";

const ESSENTIAL_HFCE_CATEGORY_SLUGS = new Set(["food", "housing_water_utilities", "health", "communication", "transport", "education", "furnishings_household", "clothing_footwear"]);
const SEASONAL_LABELS: Record<string, string> = { q1: "January–March", q2: "April–June", q3: "July–September", q4: "October–December", rainy_season: "Rainy Season", back_to_school: "Back-to-School Season", undas: "Undas / All Souls' Day", christmas_ber_months: "Christmas and Ber Months", new_year: "New Year", summer: "Summer", annual_payments: "Tax and Annual-Payment Season", family_celebrations: "Birthday and Family-Celebration Months" };
const SEASONAL_WINDOWS: Record<string, string> = { q1: "January to March", q2: "April to June", q3: "July to September", q4: "October to December", rainy_season: "June to November", back_to_school: "June to August", undas: "October to November", christmas_ber_months: "September to December", new_year: "January", summer: "March to May", annual_payments: "January to April", family_celebrations: "varies by the selected month" };
const SEASONAL_MONTHS: Record<string, number[]> = { q1: [1, 2, 3], q2: [4, 5, 6], q3: [7, 8, 9], q4: [10, 11, 12], rainy_season: [6, 7, 8, 9, 10, 11], back_to_school: [6, 7, 8], undas: [10, 11], christmas_ber_months: [9, 10, 11, 12], new_year: [1], summer: [3, 4, 5], annual_payments: [1, 2, 3, 4], family_celebrations: [] };

type Subcategory = { id: string; category_id: string | null; label: string; minimum_amount_centavos: number | null; fixed_amount_centavos: number | null; always_in_budget: boolean };
type Category = { id: string; slug: string; label: string; minimum_amount_centavos: number | null; fixed_amount_centavos: number | null };
type Timestamped = { updated_at: string };
type Debt = Timestamped & { id: string; status: string; paid_off_at: string | null; current_balance_centavos: number; minimum_payment_centavos: number; payment_frequency: string; payment_schedule: { semiMonthlyDays?: [number, number]; customIntervalDays?: number } | null; next_due_date: string | null; annual_interest_rate_bps: number; allows_extra_payments: boolean };
type Goal = Timestamped & { id: string; planned_contribution_amount_centavos: number | null; contribution_frequency: string | null; contribution_interval_count: number | null; contribution_day_of_month: number | null; contribution_second_day_of_month: number | null; custom_interval_days: number | null; next_contribution_date: string | null; goal_type: string; target_amount_centavos: number; current_amount_centavos: number };
type FinancialAccount = Timestamped & { id: string; kind: string; current_balance_centavos: number };
type Transaction = Timestamped & { id: string; amount_centavos: number; transaction_date: string; transaction_type: "income" | "expense"; category_id: string | null; subcategory_id: string | null; source_savings_goal_id?: string | null; destination_savings_goal_id?: string | null };
type OnboardingSession = { raw_answers: Record<string, unknown> | null };
type TransactionWithAnomalies = Transaction & { anomaly_evaluations: AnomalyEvaluation[] | null };

function selectEligibleDebt(debts: Debt[], strategy: "avalanche" | "snowball", priorityIds: string[]): string | null {
  const eligible = debts.filter((debt) => debt.allows_extra_payments && debt.current_balance_centavos > 0);
  const priorityRank = new Map(priorityIds.map((id, index) => [id, index]));
  return eligible.sort((left, right) => {
    const leftPriority = priorityRank.get(left.id);
    const rightPriority = priorityRank.get(right.id);
    if (leftPriority !== undefined || rightPriority !== undefined) return (leftPriority ?? Number.MAX_SAFE_INTEGER) - (rightPriority ?? Number.MAX_SAFE_INTEGER);
    return strategy === "snowball"
      ? left.current_balance_centavos - right.current_balance_centavos || right.annual_interest_rate_bps - left.annual_interest_rate_bps || left.id.localeCompare(right.id)
      : right.annual_interest_rate_bps - left.annual_interest_rate_bps || left.current_balance_centavos - right.current_balance_centavos || left.id.localeCompare(right.id);
  })[0]?.id ?? null;
}

export function isFinancialPlanInfeasible(availableCentavos: number, minimumRequiredCentavos: number): boolean {
  return availableCentavos <= 0 || minimumRequiredCentavos > availableCentavos;
}

export function financialPlanPriorityGroup(categorySlug: string | undefined): MlPlanCategory["priorityGroup"] {
  return categorySlug && ESSENTIAL_HFCE_CATEGORY_SLUGS.has(categorySlug) ? "ESSENTIAL" : "NON_ESSENTIAL";
}

export function applyFinancialPlanPriorityWeights(categories: MlPlanCategory[], cleanSpendByTarget: Map<string, number>): MlPlanCategory[] {
  const weights = new Map<string, number>();
  for (const priorityGroup of ["ESSENTIAL", "NON_ESSENTIAL"] as const) {
    const group = categories.filter((category) => category.priorityGroup === priorityGroup);
    const baselineTotal = group.reduce((sum, category) => sum + (cleanSpendByTarget.get(category.id) ?? 0), 0);
    const forecastTotal = group.reduce((sum, category) => sum + category.forecastCentavos, 0);
    for (const category of group) {
      weights.set(category.id, baselineTotal > 0
        ? (cleanSpendByTarget.get(category.id) ?? 0) / baselineTotal
        : forecastTotal > 0 ? category.forecastCentavos / forecastTotal : 1 / group.length);
    }
  }
  return categories.map((category) => ({ ...category, priorityWeight: weights.get(category.id) ?? 1 }));
}

export function excludeUnusualTransactions<T extends { id: string }>(transactions: T[], unusualTransactionIds: Set<string>): T[] {
  return transactions.filter((transaction) => !unusualTransactionIds.has(transaction.id));
}

function latestSourceUpdate(...groups: unknown[][]): string | null {
  const updates = groups.flatMap((group) => group.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const updatedAt = (item as { updated_at?: unknown }).updated_at;
    return typeof updatedAt === "string" && !Number.isNaN(new Date(updatedAt).getTime()) ? [updatedAt] : [];
  }));
  return updates.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

// The budget optimizer rejects a forecast whose month differs from the plan period.
export function forecastCoversPlanPeriod(forecast: ForecastPayload, period: { start: string }): boolean {
  return forecast.snapshot.month === period.start.slice(0, 7);
}

function fallbackForecast(period: { start: string; end: string }, categories: MlPlanCategory[]): MlExpenseForecastSnapshot {
  return {
    month: period.start.slice(0, 7),
    totalAmountCentavos: categories.reduce((sum, category) => sum + category.forecastCentavos, 0),
    categoryForecasts: categories.map((category) => ({ category: category.id, amountCentavos: category.forecastCentavos })),
    modelVersion: "odin-plan-fallback-v1",
    generatedAt: new Date().toISOString(),
    quality: "FALLBACK",
  };
}

function mapPlanForecast(
  userId: string,
  mlForecast: ForecastPayload,
  categories: MlPlanCategory[],
  categorySlugBySubcategoryId: Map<string, string | undefined>,
  seasonal: boolean,
): MlExpenseForecastSnapshot {
  const forecastBySlug = new Map(mlForecast.snapshot.categoryForecasts.map((point) => [point.category, point.amountCentavos]));
  const targetsBySlug = new Map<string, MlPlanCategory[]>();
  for (const category of categories) {
    const slug = categorySlugBySubcategoryId.get(category.id);
    if (!slug) continue;
    targetsBySlug.set(slug, [...(targetsBySlug.get(slug) ?? []), category]);
  }
  const categoryForecasts = categories.map((category) => {
    const slug = categorySlugBySubcategoryId.get(category.id);
    const targets = slug ? targetsBySlug.get(slug) ?? [] : [];
    const total = slug ? forecastBySlug.get(slug) ?? 0 : 0;
    const totalWeight = targets.reduce((sum, target) => sum + target.forecastCentavos, 0);
    const mlDetail = slug ? mlForecast.forecasts.find((point) => point.category === slug) : undefined;
    // Split by each target's expected spend this month; with none, split the forecast evenly.
    const amount = totalWeight > 0
      ? total * category.forecastCentavos / totalWeight
      : total / targets.length;
    const finalForecastCentavos = Math.max(category.floorCentavos, amount);
    console.info("financial plan forecast decision", {
      user_id: userId,
      hfce_category: slug ?? null,
      target_id: category.id,
      ml_user_baseline_centavos: mlDetail?.userBaselineCentavos ?? null,
      ml_hfce_multiplier: mlDetail?.hfceMultiplier ?? null,
      parent_forecast_centavos: total,
      target_count: targets.length,
      spend_weight_centavos: category.forecastCentavos,
      total_weight_centavos: totalWeight,
      weight_percentage: totalWeight > 0 ? category.forecastCentavos / totalWeight * 100 : null,
       allocation_method: totalWeight > 0 ? (seasonal ? "seasonal_spend_weighted" : "twelve_month_spend_weighted") : "even_split_no_spend_history",
      allocated_centavos: amount,
      floor_centavos: category.floorCentavos,
       final_forecast_centavos: finalForecastCentavos,
    });
    return { category: category.id, amountCentavos: finalForecastCentavos };
  });
  return { month: mlForecast.snapshot.month, totalAmountCentavos: categoryForecasts.reduce((sum, point) => sum + point.amountCentavos, 0), categoryForecasts, modelVersion: mlForecast.snapshot.modelVersion, generatedAt: mlForecast.snapshot.generatedAt, quality: mlForecast.snapshot.quality };
}

function mapRecommendation(categories: MlPlanCategory[], allocationAmounts: unknown): Array<{ categoryId: string | null; subcategoryId: string | null; allocationRule: MlPlanCategory["rule"]; allocatedAmountCentavos: number; floorAmountCentavos: number; ceilingAmountCentavos: number; forecastAmountCentavos: number }> {
  if (!Array.isArray(allocationAmounts) || allocationAmounts.length !== categories.length) throw new FinancialPlanUnavailableError("Budget optimizer returned an invalid recommendation");
  const amounts = new Map<string, number>();
  for (const allocation of allocationAmounts) {
    if (!allocation || typeof allocation !== "object") throw new FinancialPlanUnavailableError("Budget optimizer returned an invalid recommendation");
    const value = allocation as { category_id?: unknown; amount?: unknown };
    if (typeof value.category_id !== "string" || typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount < 0 || amounts.has(value.category_id)) throw new FinancialPlanUnavailableError("Budget optimizer returned an invalid recommendation");
    amounts.set(value.category_id, value.amount * 100);
  }
  return categories.map((category) => {
    const amount = amounts.get(category.id);
    if (amount === undefined || amount < category.floorCentavos || amount > category.ceilingCentavos) throw new FinancialPlanUnavailableError("Budget optimizer returned an invalid recommendation");
    return { categoryId: category.target === "category" ? category.id : null, subcategoryId: category.target === "subcategory" ? category.id : null, allocationRule: category.rule, allocatedAmountCentavos: amount, floorAmountCentavos: category.floorCentavos, ceilingAmountCentavos: category.ceilingCentavos, forecastAmountCentavos: category.forecastCentavos };
  });
}

export function seasonalPreferencesFromAnswers(answers: Record<string, unknown>, periodStart: string): FinancialPlanEvidence["seasonalPreferences"] {
  const month = Number(periodStart.slice(5, 7));
  const customEvents = new Map(normalizeCustomEvents(answers.custom_seasonal_events).map((event) => [event.id, event]));
  const higher = Array.isArray(answers.high_expense_seasons) ? answers.high_expense_seasons : [];
  const preferences = { saving_seasons: "saving", high_expense_seasons: "higher_expense", low_expense_seasons: "lower_expense" } as const;
  return (Object.keys(preferences) as Array<keyof typeof preferences>).flatMap((key) => {
    const selections = answers[key];
    if (!Array.isArray(selections)) return [];
    return [...new Set(selections)].flatMap((value) => {
      if (typeof value !== "string") return [];
      const custom = customEvents.get(value);
      if (custom) {
        if (!custom.months.includes(month) || (key === "low_expense_seasons" && higher.includes(value))) return [];
        return [{ evidenceId: `${key}:${value}`, season: custom.name, seasonWindow: eventMonthLabel(custom.months), preference: preferences[key] }];
      }
      if (!SEASONAL_LABELS[value] || !SEASONAL_MONTHS[value]?.includes(month)) return [];
      if (key === "low_expense_seasons" && higher.includes(value)) return [];
      return [{ evidenceId: `${key}:${value}`, season: SEASONAL_LABELS[value]!, seasonWindow: SEASONAL_WINDOWS[value]!, preference: preferences[key] }];
    });
  });
}

function userFacingForecastRationale(value: string): string {
  return isUserFacingFinancialPlanExplanation(value) ? value : "";
}

// Every row the plan reads, loaded together. Throws, logging each failing source, when a read fails. The
// classification read may fail on its own: the plan then records the assessment as unavailable.
async function loadPlanInputs(supabase: SupabaseClient, userId: string, period: { start: string; end: string }, historyStart: string) {
  const [commitmentRows, subcategories, categories, accounts, transactions, classification, onboarding, scheduledPaymentHistory] = await Promise.all([
    queryCommitmentRows(supabase, userId, period),
    supabase.from("subcategories").select("id, category_id, label, minimum_amount_centavos, fixed_amount_centavos, always_in_budget, updated_at").eq("user_id", userId).eq("kind", "expense").eq("is_active", true).eq("deleted", false).limit(200),
    supabase.from("categories").select("id, slug, label, minimum_amount_centavos, fixed_amount_centavos, updated_at").eq("user_id", userId).eq("is_active", true).eq("deleted", false).limit(200),
    supabase.from("financial_accounts").select("id, kind, current_balance_centavos, updated_at").eq("user_id", userId).eq("status", "active").eq("deleted", false).limit(100),
    supabase.from("transactions").select("id, amount_centavos, transaction_date, transaction_type, category_id, subcategory_id, source_savings_goal_id, destination_savings_goal_id, updated_at, anomaly_evaluations!anomaly_evaluations_transaction_id_fkey(transaction_id, is_anomaly, recurrence, recurrence_months)").eq("user_id", userId).eq("status", "posted").eq("deleted", false).eq("anomaly_evaluations.is_anomaly", true).order("transaction_date", { ascending: false }).limit(MAX_HISTORY),
    supabase.from("financial_condition_assessments").select("id, assessed_at, rule_set_version, output_snapshot").eq("user_id", userId).order("assessed_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("onboarding_sessions").select("raw_answers").eq("user_id", userId).eq("status", "submitted").order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("scheduled_payment_records").select("transaction_id").eq("user_id", userId).eq("deleted", false).gte("payment_date", historyStart).not("transaction_id", "is", null).limit(MAX_HISTORY),
  ]);
  const sources = [
    ["subcategories", subcategories], ["categories", categories], ["financial_accounts", accounts],
    ["debt_accounts", commitmentRows.debts], ["savings_goals", commitmentRows.savingsGoals], ["credit_card_statements", commitmentRows.statements],
    ["transactions", transactions], ["onboarding_sessions", onboarding], ["scheduled_payments", commitmentRows.scheduledPayments], ["scheduled_payment_records", scheduledPaymentHistory],
  ] as const;
  const failures = sources.flatMap(([source, { error }]) => error ? [{ source, code: error.code, message: error.message, details: error.details, hint: error.hint }] : []);
  if (failures.length) {
    console.error("financial plan inputs unavailable", { user_id: userId, failures });
    throw new FinancialPlanUnavailableError("Financial plan inputs are unavailable");
  }
  return {
    commitmentRows,
    subcategories: (subcategories.data ?? []) as Subcategory[],
    categories: (categories.data ?? []) as Category[],
    accounts: (accounts.data ?? []) as FinancialAccount[],
    transactions: (transactions.data ?? []) as TransactionWithAnomalies[],
    classificationResult: classification,
    onboarding: onboarding.data as OnboardingSession | null,
    scheduledPaymentHistory: (scheduledPaymentHistory.data ?? []) as Array<{ transaction_id: string }>,
  };
}

// The amounts reserved for the period's commitments, after the user's skips and reviewed budgets.
function reserveCommitments(due: ReturnType<typeof dueCommitments>, reservationSkips: ReservationSkips) {
  const budgets = validateCommitmentBudgets(reservationSkips.commitmentBudgets);
  const ownedKeys = new Set([...due.debts, ...due.statements, ...due.savings, ...due.obligations].map(commitmentKey));
  if (budgets.some((budget) => !ownedKeys.has(budget.key))) throw new FinancialPlanInputError("Commitment changed or is unavailable");
  const reviewedKeys = new Set(budgets.map((budget) => budget.key));
  const selectedCommitments = [...(reservationSkips.skipDebtRepayments === false ? [...due.debts, ...due.statements] : []), ...(reservationSkips.skipSavingsContributions === false ? due.savings : [])];
  if (selectedCommitments.some((row) => !reviewedKeys.has(commitmentKey(row)))) throw new FinancialPlanInputError("Review all selected savings and debt amounts before recommending category budgets");
  const debtReservations = reservationSkips.skipDebtRepayments ? [] : [...applyCommitmentBudgets(due.debts, budgets), ...applyCommitmentBudgets(due.statements, budgets)];
  const savingsReservations = reservationSkips.skipSavingsContributions ? [] : applyCommitmentBudgets(due.savings, budgets);
  // Billers and remittances keep their full amount due unless the user budgeted them.
  const obligations = reservationSkips.skipScheduledPayments ? [] : applyCommitmentBudgets(due.obligations, budgets);
  return {
    selection: { debtRepayments: !reservationSkips.skipDebtRepayments, savingsContributions: !reservationSkips.skipSavingsContributions, scheduledPayments: !reservationSkips.skipScheduledPayments },
    debtReservations,
    savingsReservations,
    obligations,
    reservedCentavos: [...debtReservations, ...savingsReservations, ...obligations].reduce((sum, item) => sum + item.amountCentavos, 0),
  };
}

type Period = { start: string; end: string };
type Recurring = ReturnType<typeof unusualSpending>["recurring"];
type ScheduledPayments = ReturnType<typeof dueCommitments>["scheduledPayments"];

function planPeriodLabel(period: Period): string {
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: MANILA_TIME_ZONE }).format(new Date(`${period.start}T00:00:00Z`));
}

// Each target's spend over the trailing twelve months and, from historyStart, month by month. Billers and
// remittances are reserved at their set amounts, so their payments never make a category budget.
function planSpendHistory(cleanTransactions: TransactionWithAnomalies[], recurringIds: Set<string>, scheduledPaymentHistory: Array<{ transaction_id: string }>, parentBySubcategory: Map<string, string | null>, historyStart: string) {
  const trailingTwelveMonths = new Date();
  trailingTwelveMonths.setUTCMonth(trailingTwelveMonths.getUTCMonth() - 12);
  const trailingTwelveMonthsStart = trailingTwelveMonths.toISOString().slice(0, 10);
  const spendBySubcategory = new Map<string, number>();
  const spendByCategory = new Map<string, number>();
  const spendMonths = new Set<string>();
  // Each target's monthly spend, without payments that come back in certain months, which recur only in those months.
  const monthlyByTarget = new Map<string, Map<string, number>>();
  const addMonthly = (targetId: string, transaction: TransactionWithAnomalies) => {
    if (recurringIds.has(transaction.id)) return;
    const months = monthlyByTarget.get(targetId) ?? new Map<string, number>();
    const month = transaction.transaction_date.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + transaction.amount_centavos);
    monthlyByTarget.set(targetId, months);
  };
  const scheduledTransactionIds = new Set(scheduledPaymentHistory.map((record) => record.transaction_id));
  for (const transaction of cleanTransactions) {
    if (transaction.transaction_type === "expense" && transaction.transaction_date >= trailingTwelveMonthsStart) spendMonths.add(transaction.transaction_date.slice(0, 7));
    if (scheduledTransactionIds.has(transaction.id)) continue;
    if (transaction.transaction_type === "expense" && transaction.subcategory_id && transaction.transaction_date >= trailingTwelveMonthsStart) {
      spendBySubcategory.set(transaction.subcategory_id, (spendBySubcategory.get(transaction.subcategory_id) ?? 0) + transaction.amount_centavos);
    }
    const parentCategoryId = (transaction.subcategory_id ? parentBySubcategory.get(transaction.subcategory_id) : null) ?? transaction.category_id;
    if (transaction.transaction_type === "expense" && parentCategoryId && transaction.transaction_date >= trailingTwelveMonthsStart) spendByCategory.set(parentCategoryId, (spendByCategory.get(parentCategoryId) ?? 0) + transaction.amount_centavos);
    if (transaction.transaction_type === "expense" && transaction.transaction_date >= historyStart) {
      if (transaction.subcategory_id) addMonthly(transaction.subcategory_id, transaction);
      if (parentCategoryId) addMonthly(parentCategoryId, transaction);
    }
  }
  return { spendBySubcategory, spendByCategory, spendMonths, monthlyByTarget };
}

type PlanCategoryInput = {
  period: Period;
  historyStart: string;
  availableCentavos: number;
  subcategories: Subcategory[];
  categoryRows: Category[];
  scheduledPayments: ScheduledPayments;
  cleanTransactions: TransactionWithAnomalies[];
  recurringIds: Set<string>;
  recurring: Recurring;
  scheduledPaymentHistory: Array<{ transaction_id: string }>;
  includedSubcategoryIds: string[];
  includedCategoryIds: string[];
  manualAllocations: ManualAllocation[];
};

// The categories the plan budgets: each with its floor, ceiling and expected spend for the month, less the
// scheduled payments already reserved for it.
function buildPlanCategories(input: PlanCategoryInput) {
  const { period, subcategories, categoryRows, cleanTransactions, recurring, manualAllocations, availableCentavos: available } = input;
  const parentBySubcategory = new Map(subcategories.map((subcategory) => [subcategory.id, subcategory.category_id]));
  const { spendBySubcategory, spendByCategory, spendMonths, monthlyByTarget } = planSpendHistory(cleanTransactions, input.recurringIds, input.scheduledPaymentHistory, parentBySubcategory, input.historyStart);
  // Like the Spending Forecast, a full year of history follows last year's seasons: spending that turns on and
  // off with the calendar, last year's spike in the same month, and payments in their months. Less history uses the
  // average month, which a fallback forecast needs one of.
  const seasonalWindow = historyWindow(cleanTransactions.flatMap((transaction) => transaction.transaction_type === "expense" ? [transaction.transaction_date.slice(0, 7)] : []), currentCalendarMonth().start.slice(0, 7));
  const seasonal = isFullYear(seasonalWindow);
  const noSpend = new Map<string, number>();
  const recurringFor = (targetId: string) => recurringMonthSpend(recurring.filter((payment) => payment.subcategoryId === targetId || parentBySubcategory.get(payment.subcategoryId) === targetId), period.start.slice(0, 7));
  const expectedMonthSpend = (targetId: string, totalCentavos: number | undefined) => seasonal
    ? seasonalMonthSpend({ window: seasonalWindow, monthly: monthlyByTarget.get(targetId) ?? noSpend, recurring: recurringFor(targetId), targetMonth: period.start.slice(0, 7) })
    : (totalCentavos ?? 0) / Math.max(spendMonths.size, 1);
  const slugByCategoryId = new Map(categoryRows.map((category) => [category.id, category.slug]));
  const categorySlugBySubcategoryId = new Map([
    ...subcategories.map((subcategory) => [subcategory.id, subcategory.category_id ? slugByCategoryId.get(subcategory.category_id) : undefined] as const),
    ...slugByCategoryId.entries(),
  ]);
  const includedIds = new Set(input.includedSubcategoryIds);
  const includedTopLevelIds = new Set(input.includedCategoryIds);
  const manualFloorByTarget = new Map(manualAllocations.map((allocation) => [`${allocation.target}:${allocation.id}`, allocation.amountCentavos]));
  for (const allocation of manualAllocations) {
    const isIncluded = allocation.target === "subcategory" ? includedIds.has(allocation.id) : includedTopLevelIds.has(allocation.id);
    const hasHistory = allocation.target === "subcategory" ? spendBySubcategory.has(allocation.id) : spendByCategory.has(allocation.id);
    const category = allocation.target === "subcategory" ? subcategories.find((item) => item.id === allocation.id) : categoryRows.find((item) => item.id === allocation.id);
    if (!isIncluded || hasHistory || !category || category.minimum_amount_centavos !== null || category.fixed_amount_centavos !== null) throw new FinancialPlanInputError("Manual allocation is only available for selected categories without history");
  }
  const grossCategories: MlPlanCategory[] = [
    ...categoryRows.flatMap((category) => {
      const fixed = category.fixed_amount_centavos;
      const minimum = category.minimum_amount_centavos ?? 0;
      if (fixed === null && category.minimum_amount_centavos === null && !includedTopLevelIds.has(category.id)) return [];
      const rule: MlPlanCategory["rule"] = fixed !== null ? "FIXED" : (category.minimum_amount_centavos !== null ? "MINIMUM" : "FLEXIBLE");
      const floor = fixed ?? Math.max(minimum, manualFloorByTarget.get(`category:${category.id}`) ?? 0);
      return [{ id: category.id, target: "category" as const, priorityGroup: financialPlanPriorityGroup(category.slug), priorityWeight: 1, rule, floorCentavos: floor, ceilingCentavos: fixed ?? Math.max(available, floor), forecastCentavos: expectedMonthSpend(category.id, spendByCategory.get(category.id)) }];
    }),
    ...subcategories.flatMap((subcategory) => {
      const fixed = subcategory.fixed_amount_centavos;
      const minimum = subcategory.minimum_amount_centavos ?? 0;
      const automaticallyIncluded = fixed !== null || subcategory.minimum_amount_centavos !== null;
      if (!automaticallyIncluded && !includedIds.has(subcategory.id)) return [];
      const rule: MlPlanCategory["rule"] = fixed !== null ? "FIXED" : (subcategory.minimum_amount_centavos !== null ? "MINIMUM" : "FLEXIBLE");
      const floor = fixed ?? Math.max(minimum, manualFloorByTarget.get(`subcategory:${subcategory.id}`) ?? 0);
      return [{ id: subcategory.id, target: "subcategory" as const, priorityGroup: financialPlanPriorityGroup(subcategory.category_id ? slugByCategoryId.get(subcategory.category_id) : undefined), priorityWeight: 1, rule, floorCentavos: floor, ceilingCentavos: fixed ?? Math.max(available, floor), forecastCentavos: expectedMonthSpend(subcategory.id, spendBySubcategory.get(subcategory.id)) }];
    }),
  ];
  const scheduledByTarget = scheduledCategoryAmounts(input.scheduledPayments, grossCategories, parentBySubcategory, period);
  const categories = subtractScheduledRequirements(grossCategories, scheduledByTarget);
  if (!categories.length) throw new FinancialPlanInputError("Choose at least one expense category");
  return { categories, categoryBaselines: new Map(grossCategories.map((category) => [category.id, category.forecastCentavos])), categorySlugBySubcategoryId, seasonal };
}

type PlanForecastInput = {
  userId: string;
  period: Period;
  historyStart: string;
  categories: MlPlanCategory[];
  categorySlugBySubcategoryId: Map<string, string | undefined>;
  seasonal: boolean;
  cleanTransactions: TransactionWithAnomalies[];
  recurringIds: Set<string>;
  recurring: Recurring;
  scheduledPaymentHistory: Array<{ transaction_id: string }>;
};

// The ML forecast for the plan month, or the spend fallback when the forecast is unavailable or for another month.
async function forecastPlanMonth(input: PlanForecastInput) {
  const { userId, period, categories, categorySlugBySubcategoryId } = input;
  let forecast = fallbackForecast(period, categories);
  let forecastDetails: ForecastPayload["forecasts"] = [];
  let forecastUnavailableMessage: string | null = null;
  try {
    // Same history as the Spending Forecast: the last twelve months of every category, without scheduled
    // payments, which the plan reserves at their set amounts instead.
    const forecastTransactions = planForecastTransactions(input.cleanTransactions, input.recurringIds, input.scheduledPaymentHistory, categorySlugBySubcategoryId, input.historyStart);
    if (forecastTransactions.length) {
      const forecastResult = await getMlForecast(userId, { historicalTransactions: forecastTransactions, targetMonth: period.start.slice(0, 7) });
      const added = recurringSpendBySlug(input.recurring, categorySlugBySubcategoryId, forecastResult.snapshot.month);
      const mlForecast = { ...forecastResult, snapshot: { ...forecastResult.snapshot, categoryForecasts: withRecurringSpend(forecastResult.snapshot.categoryForecasts, added) } };
      if (forecastCoversPlanPeriod(mlForecast, period)) {
        forecast = mapPlanForecast(userId, mlForecast, categories, categorySlugBySubcategoryId, input.seasonal);
        forecastDetails = mlForecast.forecasts;
      } else {
        console.warn("financial plan forecast month mismatch; using spend fallback", { user_id: userId, forecast_month: mlForecast.snapshot.month, plan_month: period.start.slice(0, 7) });
      }
    }
  } catch (error) {
    if (!(error instanceof ForecastValidationError || error instanceof ForecastUpstreamError || error instanceof ForecastUnavailableError)) throw error;
    console.warn("financial plan forecast unavailable; using spend fallback", { user_id: userId, error });
    if (error instanceof ForecastUnavailableError) forecastUnavailableMessage = error.message;
  }
  return { forecast, forecastDetails, forecastUnavailableMessage };
}

// Where an unallocated surplus could go: the emergency fund, the next debt by the user's strategy, and cards
// that allow extra payments.
async function loadSurplusTargets(supabase: SupabaseClient, userId: string, goals: Goal[], debts: Debt[], accounts: FinancialAccount[], skipDebtRepayments: boolean | undefined) {
  const [strategyResult, prioritiesResult, cardsResult] = await Promise.all([
    supabase.from("debt_strategy_preferences").select("strategy").eq("user_id", userId).eq("deleted", false).maybeSingle(),
    supabase.from("user_debt_priorities").select("debt_account_id, priority_rank").eq("user_id", userId).eq("deleted", false).order("priority_rank").limit(100),
    supabase.from("credit_card_details").select("account_id, credit_limit_centavos, available_credit_centavos").eq("user_id", userId).eq("allows_extra_payments", true).eq("deleted", false).limit(100),
  ]);
  // Extra savings remain possible beyond the target and independently of scheduled contributions.
  const eligibleEmergencyGoalId = goals.find((goal) => goal.goal_type === "emergency_fund")?.id ?? null;
  const strategy = strategyResult.data?.strategy === "snowball" ? "snowball" : "avalanche";
  const priorityIds = (prioritiesResult.data ?? []).map((priority) => priority.debt_account_id).filter((id): id is string => typeof id === "string");
  const eligibleDebtId = skipDebtRepayments || strategyResult.error || prioritiesResult.error ? null : selectEligibleDebt(debts, strategy, priorityIds);
  const activeCardIds = new Set(accounts.filter((account) => account.kind === "credit_card").map((account) => account.id));
  // Cards that allow extra payments and still owe something, largest balance first.
  const eligibleCardIds = skipDebtRepayments || cardsResult.error ? [] : ((cardsResult.data ?? []) as Array<{ account_id: string; credit_limit_centavos: number; available_credit_centavos: number | null }>)
    .map((card) => ({ id: card.account_id, owedCentavos: card.credit_limit_centavos - (card.available_credit_centavos ?? card.credit_limit_centavos) }))
    .filter((card) => activeCardIds.has(card.id) && card.owedCentavos > 0)
    .sort((left, right) => right.owedCentavos - left.owedCentavos || left.id.localeCompare(right.id))
    .map((card) => card.id);
  return { eligibleEmergencyGoalId, eligibleDebtId, eligibleCardIds };
}

type AssessmentRow = { id: string; assessed_at: string; rule_set_version: string; output_snapshot: unknown };

// A fresh assessment, else the latest stored one, when it has a usable output snapshot.
function planAssessment(freshAssessment: AssessmentRow | null, stored: { data: unknown; error: unknown }) {
  const assessmentRow = freshAssessment ?? (stored.error ? null : stored.data as AssessmentRow | null);
  return assessmentRow && assessmentRow.output_snapshot && typeof assessmentRow.output_snapshot === "object" && !Array.isArray(assessmentRow.output_snapshot)
    ? { id: assessmentRow.id, assessedAt: assessmentRow.assessed_at, ruleSetVersion: assessmentRow.rule_set_version, outputSnapshot: assessmentRow.output_snapshot as Record<string, unknown> }
    : null;
}

// How each forecast category's estimate compares with the user's usual spend and with what the plan allocated.
function forecastChangeEvidence(forecastDetails: ForecastPayload["forecasts"], allocations: ReturnType<typeof mapRecommendation>, categoryRows: Category[], categorySlugBySubcategoryId: Map<string, string | undefined>): FinancialPlanEvidence["forecastChanges"] {
  const categoryBySlug = new Map(categoryRows.map((category) => [category.slug, category]));
  return forecastDetails.flatMap((detail) => {
    const category = categoryBySlug.get(detail.category);
    if (!category) return [];
    const categoryAllocations = allocations.filter((allocation) => {
      const targetId = allocation.categoryId ?? allocation.subcategoryId;
      return targetId && categorySlugBySubcategoryId.get(targetId) === detail.category;
    });
    if (categoryAllocations.length === 0) return [];
    const allocationCentavos = categoryAllocations.reduce((sum, allocation) => sum + allocation.allocatedAmountCentavos, 0);
    const baselineCentavos = detail.userBaselineCentavos;
    const forecastCentavos = detail.amountCentavos;
    const differenceCentavos = forecastCentavos - baselineCentavos;
    return [{ evidenceId: `forecast:${detail.category}`, categoryName: category.label, categorySlug: detail.category, baselineCentavos, forecastCentavos, allocationCentavos, allocationForecastDifferenceCentavos: allocationCentavos - forecastCentavos, differenceCentavos, percentageChange: baselineCentavos > 0 ? differenceCentavos / baselineCentavos * 100 : null, forecastRationale: userFacingForecastRationale(detail.explanation), possibleSeasonalContext: null }];
  });
}

export async function getFinancialPlanRecommendation(userId: string, supabase: SupabaseClient, plannedAmountCentavos: number, includedSubcategoryIds: string[] = [], includedCategoryIds: string[] = [], manualAllocations: ManualAllocation[] = [], reservationSkips: ReservationSkips = {}, planMonth?: string) {
  const period = financialPlanPeriod(planMonth);
  const historyStart = forecastHistoryStart();
  const { commitmentRows, subcategories, categories: categoryRows, accounts, transactions, classificationResult, onboarding, scheduledPaymentHistory } = await loadPlanInputs(supabase, userId, period, historyStart);
  if (!subcategories.length) throw new FinancialPlanInputError("No expense categories are configured");
  const availableMoney = accounts
    .filter((account) => account.kind !== "savings" && account.kind !== "credit_card")
    .reduce((sum, account) => sum + account.current_balance_centavos, 0);
  if (availableMoney <= 0) throw new FinancialPlanInputError("No eligible financial-account balance is available");
  if (!Number.isSafeInteger(plannedAmountCentavos) || plannedAmountCentavos <= 0 || plannedAmountCentavos > availableMoney) throw new FinancialPlanInputError("Planning amount exceeds available money");

  const due = dueCommitments(commitmentRows, period);
  const commitmentRequirements = { debts: [...due.debts, ...due.statements], savings: due.savings };
  const { selection: commitmentSelection, debtReservations, savingsReservations, obligations, reservedCentavos: reserved } = reserveCommitments(due, reservationSkips);
  const available = plannedAmountCentavos - reserved;
  const explanationContext = buildFinancialPlanExplanationContext({
    planMonth: period.start.slice(0, 7), plannedAmountCentavos, categoryBudgetCentavos: available,
    debtReservations, savingsReservations, obligations,
    scheduledPayments: due.scheduledPayments,
    subcategories, categories: categoryRows,
  });
  const seasonalPreferences = seasonalPreferencesFromAnswers((onboarding?.raw_answers ?? {}), period.start);

  const { oneOffIds, recurringIds, recurring } = unusualSpending(transactions);
  const cleanTransactions = excludeUnusualTransactions(transactions, oneOffIds);
  const { categories, categoryBaselines, categorySlugBySubcategoryId, seasonal } = buildPlanCategories({
    period, historyStart, availableCentavos: available, subcategories, categoryRows, scheduledPayments: due.scheduledPayments,
    cleanTransactions, recurringIds, recurring, scheduledPaymentHistory, includedSubcategoryIds, includedCategoryIds, manualAllocations,
  });
  const obligationSnapshot = { reservations: obligations, requirements: due.obligations };

  const minimumRequired = categories.reduce((sum, category) => sum + category.floorCentavos, 0);
  if (isFinancialPlanInfeasible(available, minimumRequired)) {
    const forecast = fallbackForecast(period, categories);
    const inputSnapshot = { plannedAmountCentavos, commitmentSelection, forecast, restrictions: { allocations: categories }, obligations: obligationSnapshot, debtRequirements: { reservations: commitmentRequirements.debts }, savingsRequirements: { reservations: commitmentRequirements.savings }, classification: classificationResult.data ?? { status: "unavailable" } };
    const requiredFundsCentavos = reserved + minimumRequired;
    const shortfallCentavos = Math.max(0, requiredFundsCentavos - plannedAmountCentavos);
    const explanationEvidence: FinancialPlanEvidence = { ...explanationContext, planPeriodLabel: planPeriodLabel(period), surplusCentavos: 0, debtSurplusCentavos: 0, savingsSurplusCentavos: 0, shortfall: { plannedAmountCentavos, requiredFundsCentavos, shortfallCentavos }, seasonalPreferences, forecastChanges: [] };
    const explanationRequest: FinancialPlanExplanationRequest = { evidence: explanationEvidence, leading: [] };
    return { status: "INFEASIBLE" as const, period, inputSnapshot: { ...inputSnapshot, spendingExplanationEvidence: explanationEvidence }, recommendation: { availableFundsCentavos: available, requiredFundsCentavos, shortfallCentavos, allocations: categories.map((category) => ({ categoryId: category.target === "category" ? category.id : null, subcategoryId: category.target === "subcategory" ? category.id : null, allocationRule: category.rule, allocatedAmountCentavos: category.floorCentavos, floorAmountCentavos: category.floorCentavos, ceilingAmountCentavos: category.ceilingCentavos, forecastAmountCentavos: category.forecastCentavos })), debtReservations, savingsReservations }, explanations: deterministicFinancialPlanExplanations(explanationRequest), explanationRequest };
  }

  const goals = (commitmentRows.savingsGoals.data ?? []) as unknown as Goal[];
  const debts = (commitmentRows.debts.data ?? []) as unknown as Debt[];
  // Neither depends on the forecast, so they run while the forecast is fetched instead of after it.
  // The no-op catches keep an early throw below from leaving these rejections unhandled; the awaits still see them.
  const assessmentPromise = createFinancialConditionAssessment(userId, getServiceRoleClient());
  const surplusTargetsPromise = loadSurplusTargets(supabase, userId, goals, debts, accounts, reservationSkips.skipDebtRepayments);
  assessmentPromise.catch(() => {});
  surplusTargetsPromise.catch(() => {});
  const { forecast, forecastDetails, forecastUnavailableMessage } = await forecastPlanMonth({ userId, period, historyStart, categories, categorySlugBySubcategoryId, seasonal, cleanTransactions, recurringIds, recurring, scheduledPaymentHistory });
  const plannedCategories = applyFinancialPlanPriorityWeights(categories.map((category) => ({ ...category, forecastCentavos: forecast.categoryForecasts.find((point) => point.category === category.id)?.amountCentavos ?? category.floorCentavos })), categoryBaselines);
  const assessment = planAssessment(await assessmentPromise, classificationResult);
  const sourceUpdatedAt = latestSourceUpdate(subcategories, categoryRows, accounts, commitmentRows.debts.data ?? [], commitmentRows.savingsGoals.data ?? [], transactions);
  const surplusTargets = await surplusTargetsPromise;

  // Recommendations use monthly targets; recorded spending is tracked separately.
  const ml = await recommendPlanCategories(userId, period, available, plannedCategories, forecast);
  const recommendation = ml.recommendation as { feasibility?: string; required_funds?: number; shortfall?: number; unallocated_surplus?: number; allocations?: unknown };
  const surplusCentavos = typeof recommendation.unallocated_surplus === "number" && Number.isFinite(recommendation.unallocated_surplus) && recommendation.unallocated_surplus > 0 ? recommendation.unallocated_surplus * 100 : 0;
  const surplusRecommendation = deriveSurplusRecommendation({ unallocatedSurplusCentavos: surplusCentavos, assessment, sourceUpdatedAt, ...surplusTargets });
  const debtSurplusCentavos = 0;
  const savingsSurplusCentavos = 0;
  const allocations = mapRecommendation(plannedCategories, recommendation.allocations);
  const categoryLabelById = new Map([...categoryRows, ...subcategories].map((category) => [category.id, category.label]));
  const zeroAllocationInsights = zeroAllocationExplanations(allocations.flatMap((allocation) => {
    const targetId = allocation.categoryId ?? allocation.subcategoryId;
    const category = targetId ? plannedCategories.find((item) => item.id === targetId) : undefined;
    if (!category) return [];
    return [{ categoryName: categoryLabelById.get(category.id) ?? category.id, allocationCentavos: allocation.allocatedAmountCentavos, requiredFloorCentavos: category.floorCentavos, forecastCentavos: category.forecastCentavos }];
  }));
  const classification = assessment ? { assessmentId: assessment.id, assessedAt: assessment.assessedAt, ruleSetVersion: assessment.ruleSetVersion, outputSnapshot: assessment.outputSnapshot, sourceUpdatedAt } : { status: classificationResult.error ? "unavailable" : "absent", sourceUpdatedAt };
  const inputSnapshot = { plannedAmountCentavos, commitmentSelection, forecast, restrictions: { allocations: plannedCategories }, obligations: obligationSnapshot, debtRequirements: { reservations: commitmentRequirements.debts, surplusCentavos: debtSurplusCentavos }, savingsRequirements: { reservations: commitmentRequirements.savings, surplusCentavos: savingsSurplusCentavos }, classification };
  const forecastChanges = forecastChangeEvidence(forecastDetails, allocations, categoryRows, categorySlugBySubcategoryId);
  const explanationEvidence: FinancialPlanEvidence = { ...explanationContext, planPeriodLabel: planPeriodLabel(period), surplusCentavos, debtSurplusCentavos, savingsSurplusCentavos, seasonalPreferences, forecastChanges };
  // Groq explanations are fetched separately (POST /financial-plans/explanations) so the plan is not held up by them.
  const explanationRequest: FinancialPlanExplanationRequest = { evidence: explanationEvidence, leading: [...(forecastUnavailableMessage ? [forecastUnavailableMessage] : []), ...zeroAllocationInsights] };
  return { status: recommendation.feasibility === "INFEASIBLE" ? "INFEASIBLE" as const : "RECOMMENDATION_READY" as const, period, inputSnapshot: { ...inputSnapshot, spendingExplanationEvidence: explanationEvidence }, recommendation: { availableFundsCentavos: available, requiredFundsCentavos: typeof recommendation.required_funds === "number" ? recommendation.required_funds * 100 : undefined, shortfallCentavos: typeof recommendation.shortfall === "number" ? recommendation.shortfall * 100 : undefined, allocations, debtReservations, debtSurplusCentavos, savingsReservations, savingsSurplusCentavos, surplusRecommendation }, explanations: deterministicFinancialPlanExplanations(explanationRequest), explanationRequest };
}
