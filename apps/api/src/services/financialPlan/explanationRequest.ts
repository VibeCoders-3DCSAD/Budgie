import { isCalendarDate } from "../../lib/date/calendarDate.js";
import { HFCE_CATEGORY_SLUGS } from "./spendingReasonCatalog.js";
import { MAX_CUSTOM_EVENTS } from "@odin/spending-insights/seasons.js";
import { explainFinancialPlan, fallbackFinancialPlanExplanations, isUserFacingFinancialPlanExplanation, seasonalForecastMismatchExplanations, budgetConstraintExplanations, type FinancialPlanEvidence } from "./explanationService.js";

// The recommendation is returned without waiting for the Groq explanation. The client sends this back to
// POST /financial-plans/explanations, which adds the AI explanations once they are ready.
export type FinancialPlanExplanationRequest = {
  evidence: FinancialPlanEvidence;
  // Plan-specific notices that always lead, ahead of AI and deterministic explanations.
  leading: string[];
};

const MAX_EXPLANATIONS = 3;
const MAX_LEADING = 5;
const MAX_TEXT = 400;
const MAX_LABEL = 128;
const MAX_RATIONALE = 1_000;
const MAX_SEASONAL_PREFERENCES = 3 * (MAX_CUSTOM_EVENTS + 12);
const MAX_FORECAST_CHANGES = 50;

export class FinancialPlanExplanationRequestError extends Error {}

export function mergeFinancialPlanExplanations(leading: string[], ai: string[], deterministic: string[]): string[] {
  const normalize = (explanation: string) => explanation.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  return [...leading, ...ai, ...deterministic]
    .filter(isUserFacingFinancialPlanExplanation)
    .filter((explanation, index, all) => all.findIndex((item) => normalize(item) === normalize(explanation)) === index)
    .slice(0, MAX_EXPLANATIONS);
}

export function deterministicFinancialPlanExplanations(request: FinancialPlanExplanationRequest): string[] {
  return mergeFinancialPlanExplanations([...request.leading, ...budgetConstraintExplanations(request.evidence), ...seasonalForecastMismatchExplanations(request.evidence).slice(0, 1)], [], fallbackFinancialPlanExplanations(request.evidence));
}

export async function explainFinancialPlanRequest(request: FinancialPlanExplanationRequest, fetcher: typeof fetch = fetch, userId?: string): Promise<string[]> {
  const ai = await explainFinancialPlan(request.evidence, fetcher, userId);
  return mergeFinancialPlanExplanations([...request.leading, ...budgetConstraintExplanations(request.evidence), ...seasonalForecastMismatchExplanations(request.evidence).slice(0, 1)], ai, fallbackFinancialPlanExplanations(request.evidence));
}

function invalid(): never {
  throw new FinancialPlanExplanationRequestError("Financial Plan explanation request is invalid");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) invalid();
  return value;
}

function centavos(value: unknown): number {
  if (typeof value !== "number" || (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) invalid();
  return value;
}

function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid();
  return value;
}

function categorySlug(value: unknown): string {
  if (typeof value !== "string" || !HFCE_CATEGORY_SLUGS.some((slug) => slug === value)) invalid();
  return value;
}

function nonnegativeCentavos(value: unknown): number {
  const amount = centavos(value);
  if (amount < 0) invalid();
  return amount;
}

function optionalPlanContext(evidence: Record<string, unknown>): Pick<FinancialPlanEvidence, "planMonth" | "forecastComparisonBasis" | "confirmedExpenses" | "financialConstraints"> {
  const context: Pick<FinancialPlanEvidence, "planMonth" | "forecastComparisonBasis" | "confirmedExpenses" | "financialConstraints"> = {};
  if (evidence.planMonth !== undefined) {
    const month = text(evidence.planMonth, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) invalid();
    context.planMonth = month;
  }
  if (evidence.forecastComparisonBasis !== undefined) {
    if (evidence.forecastComparisonBasis !== "usual_category_spending") invalid();
    context.forecastComparisonBasis = evidence.forecastComparisonBasis;
  }
  if (evidence.confirmedExpenses !== undefined) {
    context.confirmedExpenses = list(evidence.confirmedExpenses, 1_000).map((item) => {
      const expense = record(item);
      const dueDate = text(expense.dueDate, 10);
      if (!isCalendarDate(dueDate)) invalid();
      return { scheduledPaymentId: text(expense.scheduledPaymentId, MAX_LABEL), categorySlug: categorySlug(expense.categorySlug), dueDate, amountCentavos: nonnegativeCentavos(expense.amountCentavos) };
    });
  }
  if (evidence.financialConstraints !== undefined) {
    const constraints = record(evidence.financialConstraints);
    context.financialConstraints = {
      plannedAmountCentavos: nonnegativeCentavos(constraints.plannedAmountCentavos),
      categoryBudgetCentavos: centavos(constraints.categoryBudgetCentavos),
      debtReservationsCentavos: nonnegativeCentavos(constraints.debtReservationsCentavos),
      savingsReservationsCentavos: nonnegativeCentavos(constraints.savingsReservationsCentavos),
      scheduledPaymentsCentavos: nonnegativeCentavos(constraints.scheduledPaymentsCentavos),
    };
  }
  return context;
}

// The evidence is the user's own plan data echoed back, but it still feeds an LLM prompt, so every field is
// rebuilt from a known shape with bounded sizes instead of being forwarded as received.
export function parseFinancialPlanExplanationRequest(value: unknown): FinancialPlanExplanationRequest {
  const body = record(value);
  const evidence = record(body.evidence);
  const shortfall = evidence.shortfall === undefined ? undefined : record(evidence.shortfall);
  return {
    leading: list(body.leading, MAX_LEADING).map((item) => text(item, MAX_TEXT)),
    evidence: {
      planPeriodLabel: text(evidence.planPeriodLabel, MAX_LABEL),
      ...optionalPlanContext(evidence),
      surplusCentavos: centavos(evidence.surplusCentavos),
      debtSurplusCentavos: centavos(evidence.debtSurplusCentavos),
      savingsSurplusCentavos: centavos(evidence.savingsSurplusCentavos),
      ...(shortfall ? { shortfall: { plannedAmountCentavos: centavos(shortfall.plannedAmountCentavos), requiredFundsCentavos: centavos(shortfall.requiredFundsCentavos), shortfallCentavos: centavos(shortfall.shortfallCentavos) } } : {}),
      seasonalPreferences: list(evidence.seasonalPreferences, MAX_SEASONAL_PREFERENCES).map((item) => {
        const preference = record(item);
        if (preference.preference !== "saving" && preference.preference !== "higher_expense" && preference.preference !== "lower_expense") invalid();
        return { evidenceId: text(preference.evidenceId, MAX_LABEL), season: text(preference.season, MAX_LABEL), seasonWindow: text(preference.seasonWindow, MAX_LABEL), preference: preference.preference };
      }),
      forecastChanges: list(evidence.forecastChanges, MAX_FORECAST_CHANGES).map((item) => {
        const change = record(item);
        const percentageChange = change.percentageChange;
        if (percentageChange !== null && (typeof percentageChange !== "number" || !Number.isFinite(percentageChange))) invalid();
        return {
          evidenceId: text(change.evidenceId, MAX_LABEL),
          categoryName: text(change.categoryName, MAX_LABEL),
          ...(change.categorySlug === undefined ? {} : { categorySlug: categorySlug(change.categorySlug) }),
          baselineCentavos: centavos(change.baselineCentavos),
          forecastCentavos: centavos(change.forecastCentavos),
          allocationCentavos: centavos(change.allocationCentavos),
          allocationForecastDifferenceCentavos: centavos(change.allocationForecastDifferenceCentavos),
          differenceCentavos: centavos(change.differenceCentavos),
          percentageChange,
          forecastRationale: text(change.forecastRationale, MAX_RATIONALE),
          possibleSeasonalContext: change.possibleSeasonalContext === null ? null : text(change.possibleSeasonalContext, MAX_LABEL),
        };
      }),
    },
  };
}
