import { excludeUnusualTransactions, planForecastTransactions } from "./helpers/forecastTransactions.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ForecastUnavailableError, ForecastUpstreamError, ForecastValidationError, getMlForecast } from "../forecast/forecastService.js";
import { FinancialPlanUnavailableError } from "./errors.js";
import { financialPlanPeriod, forecastCoversPlanPeriod, forecastHistoryStart } from "./period.js";
import { readExpenseHistory, readScheduledPaymentHistory } from "./historyQueries.js";
import { recurringSpendBySlug, unusualSpending, withRecurringSpend } from "./helpers/recurringSpending.js";

type ForecastTransactionRow = Parameters<typeof planForecastTransactions>[0][number] & Parameters<typeof unusualSpending>[0][number];

/**
 * The forecast each category's plan budget is capped at, so the recommended planning amount covers what the
 * plan will allocate. Null when there is no forecast, where the plan falls back to past spending.
 */
export async function getFinancialPlanForecast(userId: string, supabase: SupabaseClient, planMonth?: string): Promise<{ month: string; categoryForecasts: { category: string; amountCentavos: number }[] } | null> {
  const period = financialPlanPeriod(planMonth);
  const historyStart = forecastHistoryStart();
  const [subcategoriesResult, categoriesResult, transactionsResult, scheduledResult] = await Promise.all([
    supabase.from("subcategories").select("id, category_id").eq("user_id", userId).eq("kind", "expense").eq("is_active", true).eq("deleted", false).limit(200),
    supabase.from("categories").select("id, slug").eq("user_id", userId).eq("is_active", true).eq("deleted", false).limit(200),
    readExpenseHistory<ForecastTransactionRow>(supabase, userId, historyStart, "id, amount_centavos, transaction_date, transaction_type, category_id, subcategory_id, updated_at"),
    readScheduledPaymentHistory(supabase, userId, historyStart),
  ]);
  if (subcategoriesResult.error || categoriesResult.error || transactionsResult.error || scheduledResult.error) throw new FinancialPlanUnavailableError("Financial plan forecast inputs are unavailable");
  const slugByCategoryId = new Map(((categoriesResult.data ?? []) as Array<{ id: string; slug: string }>).map((category) => [category.id, category.slug]));
  const categorySlugBySubcategoryId = new Map(((subcategoriesResult.data ?? []) as Array<{ id: string; category_id: string | null }>).map((subcategory) => [subcategory.id, subcategory.category_id ? slugByCategoryId.get(subcategory.category_id) : undefined] as const));
  const transactions = (transactionsResult.data ?? []) as ForecastTransactionRow[];
  const { oneOffIds, recurringIds, recurring } = unusualSpending(transactions);
  const historicalTransactions = planForecastTransactions(excludeUnusualTransactions(transactions, oneOffIds), recurringIds, (scheduledResult.data ?? []) as Array<{ transaction_id: string }>, categorySlugBySubcategoryId, historyStart);
  if (!historicalTransactions.length) return null;
  try {
    const forecast = await getMlForecast(userId, { historicalTransactions, targetMonth: period.start.slice(0, 7) });
    if (!forecastCoversPlanPeriod(forecast, period)) return null;
    const categoryForecasts = forecast.snapshot.categoryForecasts.map((point) => ({ category: point.category, amountCentavos: point.amountCentavos }));
    return { month: forecast.snapshot.month, categoryForecasts: withRecurringSpend(categoryForecasts, recurringSpendBySlug(recurring, categorySlugBySubcategoryId, forecast.snapshot.month)) };
  } catch (error) {
    if (!(error instanceof ForecastValidationError || error instanceof ForecastUpstreamError || error instanceof ForecastUnavailableError)) throw error;
    console.warn("financial plan forecast unavailable; recommending from past spending", { user_id: userId, error });
    return null;
  }
}
