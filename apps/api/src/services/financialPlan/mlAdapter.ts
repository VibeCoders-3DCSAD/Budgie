import { randomUUID } from "node:crypto";
import { isAbortError, withTimeout } from "../../lib/http/withTimeout.js";
import { trustedMlHeaders } from "../../lib/mlHeaders.js";

export class FinancialPlanMlError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export type MlPlanCategory = {
  id: string;
  target: "category" | "subcategory";
  priorityGroup: "ESSENTIAL" | "NON_ESSENTIAL";
  priorityWeight: number;
  rule: "FIXED" | "MINIMUM" | "FLEXIBLE";
  floorCentavos: number;
  ceilingCentavos: number;
  forecastCentavos: number;
};

export type MlExpenseForecastSnapshot = {
  month: string;
  totalAmountCentavos: number;
  categoryForecasts: { category: string; amountCentavos: number }[];
  modelVersion: string;
  generatedAt: string;
  quality: "PERSONALIZED" | "FALLBACK" | "COLD_START" | "INSUFFICIENT_DATA";
};

export async function recommendPlanCategories(userId: string, period: { start: string; end: string }, availableCentavos: number, categories: MlPlanCategory[], forecast: MlExpenseForecastSnapshot, fetcher: typeof fetch = fetch) {
  const baseUrl = process.env.BUDGET_ML_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new FinancialPlanMlError(503, "Budget optimizer is unavailable");
  const body = JSON.stringify({
    request_id: randomUUID(), user_id: userId, available_funds: availableCentavos / 100,
    period, include_reasoning: true,
    categories: categories.map((category) => ({ category_id: category.id, target_type: category.target, priority_group: category.priorityGroup, restriction_level: category.rule, floor: category.floorCentavos / 100, ceiling: category.ceilingCentavos / 100, priority_weight: category.priorityWeight })),
    forecast: { month: forecast.month, total_amount: forecast.totalAmountCentavos / 100, category_forecasts: forecast.categoryForecasts.map((point) => ({ category: point.category, amount: point.amountCentavos / 100 })), model_version: forecast.modelVersion, generated_at: forecast.generatedAt, quality: forecast.quality },
  });
  const headers = trustedMlHeaders(userId, body);
  if (!headers) throw new FinancialPlanMlError(503, "Budget optimizer is unavailable");
  try {
    return await withTimeout(8_000, async (signal) => {
      const response = await fetcher(`${baseUrl}/api/v1/budget/recommend`, { method: "POST", headers, body, signal });
      if (!response.ok) throw new FinancialPlanMlError(response.status, "Budget optimizer rejected the plan");
      const payload = await response.json() as { recommendation?: unknown; explanations?: unknown; metadata?: unknown };
      if (!payload.recommendation || typeof payload.recommendation !== "object") throw new FinancialPlanMlError(502, "Budget optimizer returned an invalid response");
      return payload;
    });
  } catch (error) {
    if (error instanceof FinancialPlanMlError) throw error;
    throw new FinancialPlanMlError(503, isAbortError(error) ? "Budget optimizer timed out" : "Budget optimizer is unavailable");
  }
}
