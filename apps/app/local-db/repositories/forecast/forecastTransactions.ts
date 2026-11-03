import type { ForecastTransaction } from "../../../features/forecast/types";
import { listRecurringPayments, listSavedAnswers, listUnusualSpendings } from "../alerts/unusualSpending";
import { SCHEDULED_PAYMENTS_CATEGORY } from "../../../features/forecast/scheduledForecast";
import { manilaToday } from "../../../lib/dates";
import { historyWindow, isFullYear, seasonalMonthSpend } from "@odin/spending-insights/seasonalMonth";
import { recurringMonthSpend, resolveRecurringPayments, type RecurringPayment, type ResolvedRecurringPayment } from "@odin/spending-insights/recurringMonths";
import { getDb } from "../helpers/db";

// Room for a full year of history, which the seasonal forecast compares against.
const MAX_FORECAST_TRANSACTIONS = 2_000;
const MAX_DESCRIPTION_LENGTH = 160;

type ForecastTransactionRow = {
  id: string;
  transaction_date: string;
  amount_centavos: number;
  transaction_type: "income" | "expense";
  merchant_name: string | null;
  counterparty_name: string | null;
  notes: string | null;
  category_slug: string | null;
};


function description(row: ForecastTransactionRow): string | undefined {
  const value = [row.merchant_name, row.counterparty_name, row.notes]
    .find((item) => typeof item === "string" && item.trim());
  return value?.trim().slice(0, MAX_DESCRIPTION_LENGTH) || undefined;
}

type ListForecastTransactionsOptions = {
  fromDate?: string;
  // Leave out biller and remittance payments, which the quarterly forecast adds back at their scheduled amounts.
  excludeScheduledPayments?: boolean;
  // Leave out purchases the personal IQR check flags unless the user said they will be frequent, so the
  // forecast does not expect a one-off again. Payments that come back in certain months are left out too;
  // listRecurringForecastPayments returns them to add back in those months.
  excludeUnusualSpending?: boolean;
};

// Forecast months follow the Asia/Manila calendar, so a month starts at midnight Philippine time on every device.
function manilaMonth(now = new Date()): { year: number; monthIndex: number } {
  const today = manilaToday(now);
  return { year: Number(today.slice(0, 4)), monthIndex: Number(today.slice(5, 7)) - 1 };
}

export function getForecastHistoryStartDate(now = new Date()): string {
  const { year, monthIndex } = manilaMonth(now);
  return new Date(Date.UTC(year, monthIndex - 12, 1))
    .toISOString()
    .slice(0, 10);
}

export function getRecentExpenseStartDate(now = new Date()): string {
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - 6);
  return start.toISOString().slice(0, 10);
}

export type PlanRecommendations = {
  subcategoryIds: string[];
  categoryIds: string[];
  // Targets with spending the plan already knows about, which need no one-time amount.
  historySubcategoryIds: string[];
  historyCategoryIds: string[];
  // Whether a full year of history decided the recommendations by season.
  seasonal: boolean;
  // What each target is expected to spend in planMonth, without biller payments, which the plan reserves separately.
  // A category's amount includes its subcategories' spending.
  expectedSpend: { subcategories: Record<string, number>; categories: Record<string, number> };
};

type PlanSpendRow = { id: string; transaction_date: string; amount_centavos: number; subcategory_id: string | null; category_id: string | null; scheduled: number };

type RecurringSpend = RecurringPayment & { id: string; subcategoryId: string };

type UnusualSpending = {
  // Purchases the personal IQR check flags, unless the user said they will be frequent or recur in certain months.
  oneOffs: Set<string>;
  // Every payment that comes back in certain months, which spending history leaves out.
  recurringIds: Set<string>;
  // Those payments with the months each still stands for; a newer one replaces an older one's months.
  recurring: ResolvedRecurringPayment<RecurringSpend>[];
};

// Saved answers decide what recurs, so a payment the check no longer flags keeps its answer.
// through (YYYY-MM-DD) leaves out payments made after it.
async function listUnusualSpending(userId: string, through?: string): Promise<UnusualSpending> {
  const [detected, saved, payments] = await Promise.all([listUnusualSpendings(userId), listSavedAnswers(userId), listRecurringPayments(userId)]);
  const recurringIds = new Set(payments.map((payment) => payment.id));
  const recurs = (id: string) => saved.recurrences.get(id) === "frequent" || saved.recurrences.get(id) === "yearly" || recurringIds.has(id);
  const made = payments.filter((payment) => !through || payment.transactionDate <= through);
  return {
    oneOffs: new Set([...detected.map((insight) => insight.transactionId), ...saved.recurrences.keys()].filter((id) => !recurs(id))),
    recurringIds,
    recurring: resolveRecurringPayments(made.map(({ id, subcategoryId, transactionDate, amountCentavos, months }) => ({ id, subcategoryId, key: subcategoryId, transactionDate, amountCentavos, months }))),
  };
}

// What the recurring payments for one plan target, a subcategory or its category, expect in targetMonth.
function recurringTargetSpend(recurring: UnusualSpending["recurring"], categoryBySubcategory: Map<string, string | null>, targetId: string, targetMonth: string): number {
  const [kind, id] = targetId.split(":");
  const forTarget = recurring.filter((payment) => kind === "subcategory" ? payment.subcategoryId === id : categoryBySubcategory.get(payment.subcategoryId) === id);
  return recurringMonthSpend(forTarget, targetMonth);
}

// The categories a plan for planMonth (YYYY-MM) starts with. Like the Spending Forecast, a full year of history
// follows last year's seasons, so Christmas gifts come back in December and school fees drop out between terms.
// Less history recommends what was spent in the past 6 months.
export async function listPlanRecommendations(userId: string, planMonth: string, now = new Date()): Promise<PlanRecommendations> {
  const db = await getDb();
  const rows = await db.getAllAsync<PlanSpendRow>(
    `SELECT t.id, t.transaction_date, t.amount_centavos, t.subcategory_id, COALESCE(s.category_id, t.category_id) AS category_id,
            EXISTS (SELECT 1 FROM scheduled_payment_records r WHERE r.user_id = t.user_id AND r.transaction_id = t.id AND r.deleted = 0) AS scheduled
       FROM transactions t
       LEFT JOIN subcategories s ON s.id = t.subcategory_id AND s.deleted = 0
      WHERE t.user_id = ? AND t.transaction_type = 'expense' AND t.status = 'posted' AND t.deleted = 0
        AND t.amount_centavos > 0 AND t.transaction_date >= ?
      ORDER BY t.transaction_date DESC
      LIMIT ${MAX_FORECAST_TRANSACTIONS}`,
    userId, getForecastHistoryStartDate(now),
  );
  const unusual = await listUnusualSpending(userId);
  const clean = rows.filter((row) => !unusual.oneOffs.has(row.id));
  // Billers and remittances are reserved at their set amounts, so their payments never make a category budget.
  const spending = clean.filter((row) => !row.scheduled);
  const categoryBySubcategory = new Map(rows.flatMap((row) => row.subcategory_id ? [[row.subcategory_id, row.category_id] as const] : []));
  const recurringFor = (targetId: string) => recurringTargetSpend(unusual.recurring, categoryBySubcategory, targetId, planMonth);
  // The plan's own twelve-month history, which decides whether a category may take a one-time amount.
  const historyStart = new Date(now);
  historyStart.setUTCMonth(historyStart.getUTCMonth() - 12);
  const recent = clean.filter((row) => row.transaction_date >= historyStart.toISOString().slice(0, 10));
  const recentSpending = recent.filter((row) => !row.scheduled);
  const historySubcategoryIds = [...new Set(recentSpending.flatMap((row) => row.subcategory_id ? [row.subcategory_id] : []))];
  const historyCategoryIds = [...new Set(recentSpending.flatMap((row) => row.category_id ? [row.category_id] : []))];
  const today = manilaToday(now);
  const window = historyWindow(clean.map((row) => row.transaction_date.slice(0, 7)), today.slice(0, 7));
  const expectedSpend = expectedPlanSpend(spending, unusual.recurringIds, recurringFor, window, planMonth, recent);
  if (!isFullYear(window)) {
    const recentStart = getRecentExpenseStartDate(now);
    const lastSixMonths = spending.filter((row) => row.transaction_date >= recentStart);
    return {
      subcategoryIds: [...new Set(lastSixMonths.flatMap((row) => row.subcategory_id ? [row.subcategory_id] : []))],
      categoryIds: [...new Set(lastSixMonths.flatMap((row) => !row.subcategory_id && row.category_id ? [row.category_id] : []))],
      historySubcategoryIds, historyCategoryIds, seasonal: false, expectedSpend,
    };
  }
  const monthly = new Map<string, Map<string, number>>();
  const subcategoryIds = new Set<string>();
  const directCategoryIds = new Set<string>();
  for (const row of spending) {
    const targetId = row.subcategory_id ? `subcategory:${row.subcategory_id}` : row.category_id ? `category:${row.category_id}` : null;
    if (!targetId) continue;
    if (row.subcategory_id) subcategoryIds.add(row.subcategory_id);
    else directCategoryIds.add(row.category_id!);
    if (!unusual.recurringIds.has(row.id)) addMonthSpend(monthly, targetId, row);
  }
  const noSpend = new Map<string, number>();
  const expected = (targetId: string) => seasonalMonthSpend({ window, monthly: monthly.get(targetId) ?? noSpend, recurring: recurringFor(targetId), targetMonth: planMonth }) > 0;
  return {
    subcategoryIds: [...subcategoryIds].filter((id) => expected(`subcategory:${id}`)),
    categoryIds: [...directCategoryIds].filter((id) => expected(`category:${id}`)),
    historySubcategoryIds, historyCategoryIds, seasonal: true, expectedSpend,
  };
}

function addMonthSpend(byTarget: Map<string, Map<string, number>>, targetId: string, row: PlanSpendRow): void {
  const months = byTarget.get(targetId) ?? new Map<string, number>();
  const month = row.transaction_date.slice(0, 7);
  months.set(month, (months.get(month) ?? 0) + row.amount_centavos);
  byTarget.set(targetId, months);
}

// Mirrors the plan's category forecast on the server: a full year follows last year's season for planMonth,
// less history uses the average month over the past twelve.
function expectedPlanSpend(spending: PlanSpendRow[], recurringIds: Set<string>, recurringFor: (targetId: string) => number, window: string[], planMonth: string, recent: PlanSpendRow[]): PlanRecommendations["expectedSpend"] {
  const subcategories: Record<string, number> = {};
  const categories: Record<string, number> = {};
  if (!isFullYear(window)) {
    const months = Math.max(new Set(recent.map((row) => row.transaction_date.slice(0, 7))).size, 1);
    const recentIds = new Set(recent.map((row) => row.id));
    for (const row of spending) {
      if (!recentIds.has(row.id)) continue;
      if (row.subcategory_id) subcategories[row.subcategory_id] = (subcategories[row.subcategory_id] ?? 0) + row.amount_centavos / months;
      if (row.category_id) categories[row.category_id] = (categories[row.category_id] ?? 0) + row.amount_centavos / months;
    }
    return { subcategories, categories };
  }
  const monthly = new Map<string, Map<string, number>>();
  const targets = new Set<string>();
  for (const row of spending) {
    const rowTargets = [row.subcategory_id && `subcategory:${row.subcategory_id}`, row.category_id && `category:${row.category_id}`].filter((target): target is string => Boolean(target));
    for (const targetId of rowTargets) {
      targets.add(targetId);
      if (!recurringIds.has(row.id)) addMonthSpend(monthly, targetId, row);
    }
  }
  const noSpend = new Map<string, number>();
  for (const targetId of targets) {
    const amount = seasonalMonthSpend({ window, monthly: monthly.get(targetId) ?? noSpend, recurring: recurringFor(targetId), targetMonth: planMonth });
    if (amount <= 0) continue;
    const [kind, id] = targetId.split(":") as ["subcategory" | "category", string];
    (kind === "subcategory" ? subcategories : categories)[id] = amount;
  }
  return { subcategories, categories };
}

export async function listForecastTransactions(userId: string, { fromDate, excludeScheduledPayments = false, excludeUnusualSpending = false }: ListForecastTransactionsOptions = {}): Promise<ForecastTransaction[]> {
  const db = await getDb();
  const fromDateClause = fromDate ? " AND t.transaction_date >= ?" : "";
  const scheduledClause = excludeScheduledPayments
    ? " AND NOT EXISTS (SELECT 1 FROM scheduled_payment_records r WHERE r.user_id = t.user_id AND r.transaction_id = t.id AND r.deleted = 0)"
    : "";
  const rows = await db.getAllAsync<ForecastTransactionRow>(
    `SELECT t.id, t.transaction_date, t.amount_centavos, t.transaction_type, t.created_at,
            t.merchant_name, t.counterparty_name, t.notes,
            COALESCE(c.slug, 'Other') AS category_slug
       FROM transactions t
       LEFT JOIN subcategories s ON s.id = t.subcategory_id AND s.deleted = 0
       LEFT JOIN categories c ON c.id = s.category_id AND c.deleted = 0
       WHERE t.user_id = ? AND t.deleted = 0 AND t.status = 'posted'${fromDateClause}${scheduledClause}
          AND t.transaction_type IN ('income', 'expense')
       ORDER BY t.transaction_date DESC, t.created_at DESC
       LIMIT ${MAX_FORECAST_TRANSACTIONS}`,
    ...(fromDate ? [userId, fromDate] : [userId]),
  );
  const unusual = excludeUnusualSpending ? await listUnusualSpending(userId) : null;
  const excluded = (id: string) => Boolean(unusual && (unusual.oneOffs.has(id) || unusual.recurringIds.has(id)));
  return rows.reverse().flatMap((row) => {
    if (!Number.isInteger(row.amount_centavos) || row.amount_centavos <= 0 || excluded(row.id)) return [];
    const conciseDescription = description(row);
    return [{
      transactionId: row.id,
      date: row.transaction_date,
      amount: row.amount_centavos / 100,
      category: row.category_slug?.trim() || "Other",
      transactionType: row.transaction_type,
      ...(conciseDescription ? { description: conciseDescription } : {}),
    }];
  });
}

export type RecurringForecastPayment = ResolvedRecurringPayment<RecurringSpend> & { category: string };

// Payments that come back in certain months, made by through (YYYY-MM-DD) if given, with the forecast
// category of their subcategory, so the forecast can add each back in its months.
export async function listRecurringForecastPayments(userId: string, through?: string): Promise<RecurringForecastPayment[]> {
  const { recurring } = await listUnusualSpending(userId, through);
  if (recurring.length === 0) return [];
  const db = await getDb();
  const subcategoryIds = [...new Set(recurring.map((payment) => payment.subcategoryId))];
  const rows = await db.getAllAsync<{ id: string; category_slug: string | null }>(
    `SELECT s.id, c.slug AS category_slug
       FROM subcategories s
       LEFT JOIN categories c ON c.id = s.category_id AND c.deleted = 0
      WHERE s.user_id = ? AND s.id IN (${subcategoryIds.map(() => "?").join(", ")})`,
    userId, ...subcategoryIds,
  );
  const slugBySubcategory = new Map(rows.map((row) => [row.id, row.category_slug?.trim() || "Other"]));
  return recurring.map((payment) => ({ ...payment, category: slugBySubcategory.get(payment.subcategoryId) ?? "Other" }));
}

export type QuarterSpending = { quarter: string; totalCentavos: number; categories: { category: string; amountCentavos: number }[] };

// The quarters (YYYYQn) that end before the current quarter, oldest first.
export function pastQuarters(count: number, now = new Date()): string[] {
  const { year, monthIndex } = manilaMonth(now);
  const current = year * 4 + Math.floor(monthIndex / 3);
  return Array.from({ length: count }, (_, index) => {
    const quarter = current - count + index;
    return `${Math.floor(quarter / 4)}Q${(quarter % 4) + 1}`;
  });
}

export type MonthSpending = { month: string; totalCentavos: number; categories: { category: string; amountCentavos: number }[] };

// The last `count` months (YYYY-MM) through the current one, oldest first. The current month is still in progress.
export function recentMonths(count: number, now = new Date()): string[] {
  const { year, monthIndex } = manilaMonth(now);
  return Array.from({ length: count }, (_, index) => new Date(Date.UTC(year, monthIndex - count + 1 + index, 1)).toISOString().slice(0, 7));
}

const QUARTER_SQL = "substr(t.transaction_date, 1, 4) || 'Q' || ((CAST(substr(t.transaction_date, 6, 2) AS INTEGER) + 2) / 3)";
const MONTH_SQL = "substr(t.transaction_date, 1, 7)";

// Actual spending per period in the same groups the forecast uses: HFCE categories, with biller and
// remittance payments in their own group. Debt repayments and savings transfers have no category and are left out.
async function listPeriodSpending(userId: string, periods: string[], periodSql: string, startDate: string, endDate: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<{ period: string; category: string; amount_centavos: number }>(
    `SELECT ${periodSql} AS period,
            CASE WHEN EXISTS (SELECT 1 FROM scheduled_payment_records r WHERE r.user_id = t.user_id AND r.transaction_id = t.id AND r.deleted = 0)
                 THEN '${SCHEDULED_PAYMENTS_CATEGORY}' ELSE c.slug END AS category,
            SUM(t.amount_centavos) AS amount_centavos
       FROM transactions t
       LEFT JOIN subcategories s ON s.id = t.subcategory_id AND s.deleted = 0
       LEFT JOIN categories c ON c.id = s.category_id AND c.deleted = 0
      WHERE t.user_id = ? AND t.deleted = 0 AND t.status = 'posted' AND t.transaction_type = 'expense'
        AND t.amount_centavos > 0 AND t.transaction_date >= ? AND t.transaction_date <= ?
      GROUP BY period, category
     HAVING category IS NOT NULL`,
    userId, startDate, endDate,
  );
  return periods.map((period) => {
    const categories = rows.filter((row) => row.period === period).map((row) => ({ category: row.category, amountCentavos: row.amount_centavos }));
    return { period, totalCentavos: categories.reduce((sum, point) => sum + point.amountCentavos, 0), categories };
  });
}

export async function listQuarterlySpending(userId: string, quarters: string[]): Promise<QuarterSpending[]> {
  if (quarters.length === 0) return [];
  const first = quarters[0]!;
  const last = quarters.at(-1)!;
  const startDate = `${first.slice(0, 4)}-${String((Number(first.slice(5)) - 1) * 3 + 1).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5)) * 3, 0)).toISOString().slice(0, 10);
  return (await listPeriodSpending(userId, quarters, QUARTER_SQL, startDate, endDate)).map(({ period, ...spending }) => ({ quarter: period, ...spending }));
}

// The current month's total covers only what has been recorded so far.
export async function listMonthlySpending(userId: string, months: string[]): Promise<MonthSpending[]> {
  if (months.length === 0) return [];
  const last = months.at(-1)!;
  const endDate = new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return (await listPeriodSpending(userId, months, MONTH_SQL, `${months[0]}-01`, endDate)).map(({ period, ...spending }) => ({ month: period, ...spending }));
}
