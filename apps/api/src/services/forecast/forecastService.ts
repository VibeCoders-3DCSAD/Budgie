import { manilaMonthStart, manilaToday, manilaYearMonth } from "../../lib/date/manila.js";
import { trustedMlHeaders } from "../../lib/mlHeaders.js";
import { UUID_PATTERN } from "../../lib/uuid.js";
import { isAbortError, withTimeout } from "../../lib/http/withTimeout.js";

export type ForecastTransaction = {
  transactionId: string;
  date: string;
  amount: number;
  category: string;
  transactionType: "income" | "expense";
  description?: string;
  // An unusual payment the user said happens once a year, so the forecast repeats it in that month.
  recurrence?: "yearly";
};

type ForecastRequest = {
  historicalTransactions: ForecastTransaction[];
  // YYYY-MM month to forecast; odin-ml defaults to the next calendar month.
  targetMonth?: string;
  // Several YYYY-MM months in one odin-ml call; the snapshot covers the first.
  targetMonths?: string[];
  // YYYY-MM-DD day to forecast from instead of today, so a past month's forecast can be compared with its spending.
  asOf?: string;
};

type BaselineMethod = "same_period_last_year" | "median_monthly" | "recency_weighted_provisional";
const BASELINE_METHODS: readonly BaselineMethod[] = ["same_period_last_year", "median_monthly", "recency_weighted_provisional"];

export type ForecastPayload = {
  forecasts: { category: string; month: string; quarter: string; amountCentavos: number; userBaselineCentavos: number; hfceMultiplier: number; hfceForecastAmountMillionPhp: number; explanation: string; baselineMethod: BaselineMethod; seasonalUncertainty: boolean }[];
  snapshot: {
    month: string;
    totalAmountCentavos: number;
    categoryForecasts: { category: string; amountCentavos: number }[];
    modelVersion: string;
    generatedAt: string;
    quality: "PERSONALIZED" | "FALLBACK" | "COLD_START" | "INSUFFICIENT_DATA";
  };
  modelVersion: string;
  status: "SUCCESS";
};

type CategoryAmount = { category: string; amountCentavos: number };

type QuarterlyForecastPayload = {
  quarters: { quarter: string; totalCentavos: number; categories: CategoryAmount[] }[];
  // Each forecast month; months differ within a quarter only once a full year of history sets the baseline.
  months: { month: string; totalCentavos: number; categories: CategoryAmount[] }[];
  modelVersion: string;
  generatedAt: string;
  // INSUFFICIENT_DATA under six months of history; seasonalUncertainty under twelve.
  quality: ForecastPayload["snapshot"]["quality"];
  baselineMethod: BaselineMethod;
  seasonalUncertainty: boolean;
};

const MAX_TRANSACTIONS = 2_000;
const FORECAST_QUARTERS = 4;
const MONTHS_PER_QUARTER = 3;
const MAX_TEXT_LENGTH = 160;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HFCE_CATEGORIES = new Set(["alcohol_tobacco", "clothing_footwear", "communication", "education", "food", "furnishings_household", "health", "housing_water_utilities", "miscellaneous_goods_services", "recreation_culture", "restaurants_hotels", "transport"]);

export class ForecastValidationError extends Error {}
type ForecastUnavailableReason = "NO_COMPLETED_MONTH" | "NO_RECENT_SPENDING";
const FORECAST_UNAVAILABLE_MESSAGES: Record<ForecastUnavailableReason, string> = {
  NO_COMPLETED_MONTH: "Your spending forecast will be ready after your first full month of recorded expenses.",
  NO_RECENT_SPENDING: "You haven't recorded expenses in the last 6 months. Add recent expenses to get a spending forecast.",
};
export class ForecastUnavailableError extends Error {
  constructor(public readonly reason: ForecastUnavailableReason) {
    super(FORECAST_UNAVAILABLE_MESSAGES[reason]);
  }
}
export class ForecastUpstreamError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly failureStage: "configuration" | "alert_lookup" | "request" | "response" = "response",
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function parseForecastRequest(value: unknown): ForecastRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ForecastValidationError("Forecast request must be an object");
  }
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.historicalTransactions) || input.historicalTransactions.length === 0 || input.historicalTransactions.length > MAX_TRANSACTIONS) {
    throw new ForecastValidationError("historicalTransactions must contain between 1 and 2000 transactions");
  }
  return {
    historicalTransactions: input.historicalTransactions.map(parseTransaction),
    ...(input.asOf == null ? {} : { asOf: parseAsOf(input.asOf) }),
  };
}

function parseAsOf(value: unknown): string {
  if (typeof value !== "string" || !ISO_DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new ForecastValidationError("asOf is invalid");
  if (value > manilaToday()) throw new ForecastValidationError("asOf cannot be in the future");
  return value;
}

// The moment the forecast is made from: midnight in Manila on asOf, or now.
function forecastClock(asOf?: string): Date {
  return asOf ? new Date(`${asOf}T00:00:00+08:00`) : new Date();
}

function parseTransaction(value: unknown): ForecastTransaction {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ForecastValidationError("Transaction is invalid");
  const input = value as Record<string, unknown>;
  if (typeof input.transactionId !== "string" || !UUID_PATTERN.test(input.transactionId)) throw new ForecastValidationError("transactionId is invalid");
  if (typeof input.date !== "string" || !ISO_DATE.test(input.date) || Number.isNaN(Date.parse(`${input.date}T00:00:00Z`))) throw new ForecastValidationError("date is invalid");
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) throw new ForecastValidationError("amount is invalid");
  if (typeof input.category !== "string" || !input.category.trim() || input.category.length > MAX_TEXT_LENGTH) throw new ForecastValidationError("category is invalid");
  if (input.transactionType !== "income" && input.transactionType !== "expense") throw new ForecastValidationError("transactionType is invalid");
  if (input.description != null && (typeof input.description !== "string" || input.description.length > MAX_TEXT_LENGTH)) throw new ForecastValidationError("description is invalid");
  if (input.recurrence != null && input.recurrence !== "yearly") throw new ForecastValidationError("recurrence is invalid");
  return {
    transactionId: input.transactionId,
    date: input.date,
    amount: Math.round(input.amount * 100) / 100,
    category: input.category.trim(),
    transactionType: input.transactionType,
    ...(typeof input.description === "string" && input.description.trim() ? { description: input.description.trim() } : {}),
    ...(input.recurrence === "yearly" ? { recurrence: "yearly" as const } : {}),
  };
}

export async function getMlForecast(userId: string, request: ForecastRequest, fetcher: typeof fetch = fetch): Promise<ForecastPayload> {
  const baseUrl = process.env.FORECASTING_ML_BASE_URL;
  if (!baseUrl) throw new ForecastUpstreamError(503, "Forecast service is unavailable", "configuration");
  const historicalTransactions = request.historicalTransactions;
  if (historicalTransactions.length === 0) throw new ForecastValidationError("No forecastable transactions remain");
  const now = forecastClock(request.asOf);
  const categories = forecastableCategories(historicalTransactions, now);
  if (categories.length === 0) throw new ForecastUnavailableError(hasCompletedMonthSpend(historicalTransactions, now) ? "NO_RECENT_SPENDING" : "NO_COMPLETED_MONTH");
  const body = JSON.stringify({
    user_id: userId,
    historical_transactions: historicalTransactions.map((transaction) => ({
      transaction_id: transaction.transactionId,
      date: transaction.date,
      amount: transaction.amount,
      category: transaction.category,
      transaction_type: transaction.transactionType,
      ...(transaction.description ? { description: transaction.description } : {}),
      ...(transaction.recurrence ? { recurrence: transaction.recurrence } : {}),
    })),
    categories,
    ...(request.targetMonth ? { target_month: request.targetMonth } : {}),
    ...(request.targetMonths ? { target_months: request.targetMonths } : {}),
    ...(request.asOf ? { as_of: request.asOf } : {}),
  });
  const headers = trustedMlHeaders(userId, body);
  if (!headers) throw new ForecastUpstreamError(503, "Forecast service is unavailable", "configuration");
  try {
    return await withTimeout(8_000, async (signal) => {
      const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/api/v1/forecast/predict`, {
        method: "POST",
        headers,
        signal,
        body,
      });
      if (!response.ok) {
        throw new ForecastUpstreamError(response.status, `Forecast service rejected the request (HTTP ${response.status})`, "response");
      }
      return mapMlForecast(await response.json());
    });
  } catch (error) {
    if (error instanceof ForecastUpstreamError) throw error;
    throw new ForecastUpstreamError(
      503,
      isAbortError(error) ? "Forecast service timed out" : "Forecast service is unavailable",
      "request",
      { cause: error },
    );
  }
}

function utcMonth(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 7);
}

function quarterOf(month: string): string {
  return `${month.slice(0, 4)}Q${Math.floor((Number(month.slice(5, 7)) - 1) / MONTHS_PER_QUARTER) + 1}`;
}

// The current month, so it can be compared with its actual spending so far, through the end of the third
// quarter after next month's. The opening quarter may be partial; December asks for thirteen months.
export function forecastMonths(now = new Date()): string[] {
  // Forecast months follow the Asia/Manila calendar.
  const { year, monthIndex: currentMonthIndex } = manilaYearMonth(now);
  const nextMonthIndex = currentMonthIndex + 1;
  const endIndex = Math.floor(nextMonthIndex / MONTHS_PER_QUARTER) * MONTHS_PER_QUARTER + FORECAST_QUARTERS * MONTHS_PER_QUARTER;
  return Array.from({ length: endIndex - currentMonthIndex }, (_, index) => utcMonth(year, currentMonthIndex + index));
}

function sumByCategory(points: CategoryAmount[], scale = 1): CategoryAmount[] {
  const totals = new Map<string, number>();
  for (const point of points) totals.set(point.category, (totals.get(point.category) ?? 0) + point.amountCentavos);
  return [...totals].map(([category, amountCentavos]) => ({ category, amountCentavos: amountCentavos * scale }));
}

function withTotal<T extends { categories: CategoryAmount[] }>(group: T): T & { totalCentavos: number } {
  return { ...group, totalCentavos: group.categories.reduce((total, point) => total + point.amountCentavos, 0) };
}

// From six months of history odin-ml walks each month forward from last month by HFCE, splitting each
// quarter's growth evenly across its months. A partial opening quarter scales its forecast months up to a full three.
// With asOf, the forecast is the one that would have been made that day, from the spending recorded before it.
export async function getMlQuarterlyForecast(userId: string, request: ForecastRequest, fetcher: typeof fetch = fetch): Promise<QuarterlyForecastPayload> {
  const { asOf } = request;
  const targetMonths = forecastMonths(forecastClock(asOf));
  const historicalTransactions = asOf ? request.historicalTransactions.filter((transaction) => transaction.date < asOf) : request.historicalTransactions;
  if (historicalTransactions.length === 0) throw new ForecastUnavailableError("NO_COMPLETED_MONTH");
  const payload = await getMlForecast(userId, { historicalTransactions, targetMonths, ...(asOf ? { asOf } : {}) }, fetcher);
  const months = targetMonths.map((month) => withTotal({ month, categories: payload.forecasts.filter((point) => point.month === month).map(({ category, amountCentavos }) => ({ category, amountCentavos })) }));
  const quarterKeys = [...new Set(targetMonths.map(quarterOf))];
  const quarters = quarterKeys.map((quarter) => {
    const inQuarter = months.filter((month) => quarterOf(month.month) === quarter);
    return withTotal({ quarter, categories: sumByCategory(inQuarter.flatMap((month) => month.categories), MONTHS_PER_QUARTER / inQuarter.length) });
  });
  return {
    quarters,
    months,
    modelVersion: payload.modelVersion,
    generatedAt: new Date().toISOString(),
    quality: payload.forecasts.some((point) => point.baselineMethod === "recency_weighted_provisional") ? "INSUFFICIENT_DATA" : payload.snapshot.quality,
    baselineMethod: payload.forecasts[0]?.baselineMethod ?? "recency_weighted_provisional",
    seasonalUncertainty: payload.forecasts.some((point) => point.seasonalUncertainty),
  };
}

// Mirrors odin-ml: a category needs completed-month spend newer than this many months, or, once the
// history reaches back a full year, any completed-month spend within that year.
const STALE_CATEGORY_MONTHS = 6;
const BASELINE_LOOKBACK_MONTHS = 12;

function monthsAgo(now: Date, months: number): string {
  return manilaMonthStart(months, now).slice(0, 7);
}

function isSupportedExpense(transaction: ForecastTransaction): boolean {
  return transaction.transactionType === "expense" && HFCE_CATEGORIES.has(transaction.category);
}

function hasCompletedMonthSpend(transactions: ForecastTransaction[], now = new Date()): boolean {
  const currentMonth = monthsAgo(now, 0);
  return transactions.some((transaction) => isSupportedExpense(transaction) && transaction.date.slice(0, 7) < currentMonth);
}

function forecastableCategories(transactions: ForecastTransaction[], now = new Date()): string[] {
  const currentMonth = monthsAgo(now, 0);
  const firstLookbackMonth = monthsAgo(now, BASELINE_LOOKBACK_MONTHS);
  const fullYear = transactions.some((transaction) => transaction.transactionType === "expense" && transaction.date.slice(0, 7) === firstLookbackMonth);
  const staleMonth = monthsAgo(now, fullYear ? BASELINE_LOOKBACK_MONTHS + 1 : STALE_CATEGORY_MONTHS);
  return [...new Set(transactions
    .filter((transaction) => {
      const month = transaction.date.slice(0, 7);
      return isSupportedExpense(transaction) && month > staleMonth && month < currentMonth;
    })
    .map((transaction) => transaction.category))];
}

export function mapMlForecast(value: unknown): ForecastPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ForecastUpstreamError(502, "Forecast service returned an invalid response");
  const response = value as Record<string, unknown>;
  if (response.status !== "SUCCESS" || typeof response.model_version !== "string" || !response.model_version.trim() || !Array.isArray(response.forecasts) || !response.snapshot || typeof response.snapshot !== "object" || Array.isArray(response.snapshot)) {
    throw new ForecastUpstreamError(502, "Forecast service returned an invalid response");
  }
  const cents = (amount: unknown) => {
    if (typeof amount !== "number" || !Number.isFinite(amount)) throw new ForecastUpstreamError(502, "Forecast service returned an invalid response");
    return amount * 100;
  };
  const forecasts = response.forecasts.map((point) => {
      if (!point || typeof point !== "object" || Array.isArray(point)) throw new ForecastUpstreamError(502, "Forecast service returned an invalid response");
      const value = point as Record<string, unknown>;
      if (typeof value.category !== "string" || !HFCE_CATEGORIES.has(value.category) || typeof value.month !== "string" || !/^\d{4}-\d{2}$/.test(value.month) || typeof value.quarter !== "string" || !/^\d{4}Q[1-4]$/.test(value.quarter) || typeof value.hfce_multiplier !== "number" || !Number.isFinite(value.hfce_multiplier) || typeof value.hfce_forecast_amount_million_php !== "number" || !Number.isFinite(value.hfce_forecast_amount_million_php) || typeof value.explanation !== "string" || !value.explanation.trim() || !BASELINE_METHODS.includes(value.baseline_method as BaselineMethod) || typeof value.seasonal_uncertainty !== "boolean") throw new ForecastUpstreamError(502, "Forecast service returned an invalid response");
      return { category: value.category, month: value.month, quarter: value.quarter, amountCentavos: cents(value.amount), userBaselineCentavos: cents(value.user_baseline_amount), hfceMultiplier: value.hfce_multiplier, hfceForecastAmountMillionPhp: value.hfce_forecast_amount_million_php, explanation: value.explanation, baselineMethod: value.baseline_method as BaselineMethod, seasonalUncertainty: value.seasonal_uncertainty };
    });
  const snapshot = response.snapshot as Record<string, unknown>;
  if (typeof snapshot.month !== "string" || !/^\d{4}-\d{2}$/.test(snapshot.month) || typeof snapshot.total_amount !== "number" || !Number.isFinite(snapshot.total_amount) || snapshot.total_amount < 0 || typeof snapshot.model_version !== "string" || !snapshot.model_version.trim() || typeof snapshot.generated_at !== "string" || Number.isNaN(Date.parse(snapshot.generated_at)) || !["PERSONALIZED", "FALLBACK", "COLD_START", "INSUFFICIENT_DATA"].includes(snapshot.quality as string) || !Array.isArray(snapshot.category_forecasts)) {
    throw new ForecastUpstreamError(502, "Forecast service returned an invalid response");
  }
  const categoryForecasts = snapshot.category_forecasts.map((point) => {
    if (!point || typeof point !== "object" || Array.isArray(point)) throw new ForecastUpstreamError(502, "Forecast service returned an invalid response");
    const value = point as Record<string, unknown>;
    if (typeof value.category !== "string" || !HFCE_CATEGORIES.has(value.category) || typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount < 0) throw new ForecastUpstreamError(502, "Forecast service returned an invalid response");
    return { category: value.category, amountCentavos: cents(value.amount) };
  });
  // odin-ml rounds total_amount to two decimals and allows a one-centavo difference from the category sum.
  if (Math.abs(categoryForecasts.reduce((total, point) => total + point.amountCentavos, 0) - cents(snapshot.total_amount)) > 1) throw new ForecastUpstreamError(502, "Forecast service returned an invalid response");
  return {
    forecasts,
    snapshot: {
      month: snapshot.month,
      totalAmountCentavos: cents(snapshot.total_amount),
      categoryForecasts,
      modelVersion: snapshot.model_version,
      generatedAt: snapshot.generated_at,
      quality: snapshot.quality as ForecastPayload["snapshot"]["quality"],
    },
    modelVersion: response.model_version,
    status: "SUCCESS",
  };
}
