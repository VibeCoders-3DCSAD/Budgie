import type { PracticeResponder } from "../../../services/practiceMode";
import { practiceAssessmentBody } from "./fixtures/classification";
import { practiceCommitments } from "./fixtures/commitments";
import { planCategoryForecasts, practiceForecast, practiceInterpretation, practiceQuarterlyForecast } from "./fixtures/forecast";
import { payload, refused, requestBody, json } from "./fixtures/http";
import { planPeriod, type PracticeData } from "./fixtures/practiceData";
import { practiceRecommendation, type RecommendationInput } from "./fixtures/recommendation";
import type { ForecastRequest } from "../../forecast/types";

type Route = (data: PracticeData, init: RequestInit) => Promise<Response> | Response;

// Answered from practice data.
const ROUTES: Record<string, Route> = {
  "POST /odin/api/financial-plans/commitments": (data) => payload(practiceCommitments(data)),
  "POST /odin/api/financial-plans/forecast": (data) => payload({ month: planPeriod(data.today).start.slice(0, 7), categoryForecasts: planCategoryForecasts(data) }),
  "POST /odin/api/financial-plans/recommendation": async (data, init) => payload(practiceRecommendation(data, recommendationInput(await requestBody(init)))),
  "POST /odin/api/financial-plans/explanations": async (_data, init) => payload({ explanations: (await requestBody(init)).explanations ?? [] }),
  "POST /odin/api/forecast": async (data, init) => payload(practiceForecast(data, await requestBody(init) as ForecastRequest)),
  "POST /odin/api/forecast/quarterly": (data) => payload(practiceQuarterlyForecast(data)),
  "POST /odin/api/forecast/interpretation": () => payload({ notes: practiceInterpretation() }),
  "POST /odin/api/financial-classification/v2/assess": (data) => payload(practiceAssessmentBody(data)),
  "GET /odin/api/financial-classification/v2/latest": (data) => payload(practiceAssessmentBody(data)),
  // The server posts due recurring entries into the user's real records, so the tour skips it.
  "POST /odin/api/recurring/run/me": () => json(200, {}),
};

// The user's own settings, read from the server unchanged: they are not financial records, and a guessed
// terms consent could lock the tour on the consent screen.
const PASS_THROUGH_READS = new Set([
  "GET /odin/api/me",
  "GET /odin/api/onboarding/preferences",
  "GET /odin/api/account-deletion-requests",
  "GET /odin/api/account-deletion-requests/active",
]);

// Answers every API request while the tour runs. Anything not listed (logout, consent, export, deletion,
// preference changes, sync) is refused, so the tour can never change the account.
export function createPracticeResponder(data: PracticeData, server: (url: string, init: RequestInit) => Promise<Response>): PracticeResponder {
  return async (url, init) => {
    const key = `${(init.method ?? "GET").toUpperCase()} ${new URL(url).pathname}`;
    const route = ROUTES[key];
    if (route) return route(data, init);
    if (PASS_THROUGH_READS.has(key)) return server(url, init);
    return refused();
  };
}

function recommendationInput(body: Record<string, unknown>): RecommendationInput {
  const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  return {
    includedSubcategoryIds: ids(body.includedSubcategoryIds),
    includedCategoryIds: ids(body.includedCategoryIds),
    plannedAmountCentavos: Number(body.plannedAmountCentavos) || 0,
    manualAllocations: Array.isArray(body.manualAllocations) ? body.manualAllocations as RecommendationInput["manualAllocations"] : [],
    skipDebtRepayments: body.skipDebtRepayments === true,
    skipSavingsContributions: body.skipSavingsContributions === true,
    skipScheduledPayments: body.skipScheduledPayments === true,
    commitmentBudgets: Array.isArray(body.commitmentBudgets) ? body.commitmentBudgets as RecommendationInput["commitmentBudgets"] : undefined,
  };
}
