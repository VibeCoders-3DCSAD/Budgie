import type { ForecastPayload, ForecastRequest, QuarterlyForecastPayload } from "../../../forecast/types";
import { addMonths } from "../../../../lib/dates";
import { categorySlugBySubcategory, monthlySpendBySubcategory, planPeriod, type PracticeData } from "./practiceData";

const MODEL_VERSION = "practice-tour-v1";

// This month's expected spending per parent category, from the practice history.
export function planCategoryForecasts(data: PracticeData): { category: string; amountCentavos: number }[] {
  const slugs = categorySlugBySubcategory(data.taxonomy);
  const totals = new Map<string, number>();
  for (const [subcategoryId, amount] of monthlySpendBySubcategory(data)) {
    const slug = slugs.get(subcategoryId);
    if (slug) totals.set(slug, (totals.get(slug) ?? 0) + amount);
  }
  return [...totals].map(([category, amountCentavos]) => ({ category, amountCentavos })).sort((a, b) => b.amountCentavos - a.amountCentavos);
}

// The Spending Forecast screen: the average of each category's completed months, with a short reason.
export function practiceForecast(data: PracticeData, request: ForecastRequest): ForecastPayload {
  const month = (request.asOf ?? data.today).slice(0, 7);
  const categoryForecasts = planCategoryForecasts(data);
  const quarter = quarterOf(month);
  return {
    forecasts: categoryForecasts.map((point) => ({ ...point, month, quarter, userBaselineCentavos: point.amountCentavos, hfceMultiplier: 1, hfceForecastAmountMillionPhp: 0, explanation: "Based on your average spending over the last three months." })),
    snapshot: { month, totalAmountCentavos: total(categoryForecasts), categoryForecasts, modelVersion: MODEL_VERSION, generatedAt: `${data.today}T00:00:00.000Z`, quality: "PERSONALIZED" },
    modelVersion: MODEL_VERSION,
    status: "SUCCESS",
  };
}

// The quarterly outlook: the same monthly pattern for the next three months, with December's holidays added.
export function practiceQuarterlyForecast(data: PracticeData): QuarterlyForecastPayload {
  const base = planCategoryForecasts(data);
  const start = planPeriod(data.today).start;
  const months = [0, 1, 2].map((offset) => {
    const month = addMonths(start, offset).slice(0, 7);
    const lift = month.endsWith("-12") ? 1.25 : 1;
    const categories = base.map((point) => ({ category: point.category, amountCentavos: Math.round(point.amountCentavos * lift) }));
    return { month, totalCentavos: total(categories), categories };
  });
  const quarters = [...new Set(months.map((row) => quarterOf(row.month)))].map((quarter) => {
    const inQuarter = months.filter((row) => quarterOf(row.month) === quarter);
    const categories = base.map((point) => ({ category: point.category, amountCentavos: inQuarter.reduce((sum, row) => sum + (row.categories.find((item) => item.category === point.category)?.amountCentavos ?? 0), 0) }));
    return { quarter, totalCentavos: total(categories), categories };
  });
  return { quarters, months, modelVersion: MODEL_VERSION, generatedAt: `${data.today}T00:00:00.000Z`, quality: "PERSONALIZED", baselineMethod: "median_monthly", seasonalUncertainty: true, interpretation: practiceInterpretation() };
}

export function practiceInterpretation(): string[] {
  return [
    "Your spending is steady month to month, led by housing and food.",
    "Expect higher spending in December for gifts and Noche Buena.",
  ];
}

function total(points: { amountCentavos: number }[]): number {
  return points.reduce((sum, point) => sum + point.amountCentavos, 0);
}

function quarterOf(month: string): string {
  return `${month.slice(0, 4)}-Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`;
}
