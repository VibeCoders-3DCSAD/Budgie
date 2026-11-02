import { Router, type Response } from "express";
import { validateCommitmentBudgets } from "../services/financialPlan/commitments.js";
import { getFinancialPlanCommitments } from "../services/financialPlan/commitmentsLoader.js";
import { getFinancialPlanForecast } from "../services/financialPlan/planForecast.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { FinancialPlanInputError, FinancialPlanUnavailableError, getFinancialPlanRecommendation } from "../services/financialPlan/recommendationService.js";
import { financialPlanPeriod } from "../services/financialPlan/period.js";
import { FinancialPlanMlError } from "../services/financialPlan/mlAdapter.js";
import { explainFinancialPlanRequest, FinancialPlanExplanationRequestError, parseFinancialPlanExplanationRequest } from "../services/financialPlan/explanationRequest.js";

const router = Router();

router.post("/commitments", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  try {
    const month = request.body?.planMonth;
    if (month !== undefined && typeof month !== "string") throw new FinancialPlanInputError("Plan month is invalid");
    response.json({ payload: await getFinancialPlanCommitments(request.userId!, request.supabase!, month) });
  } catch (error) {
    console.error("financial plan commitments failed", { user_id: request.userId, error });
    response.status(error instanceof FinancialPlanInputError ? 422 : 503).json({ message: "Your commitments could not be loaded. Try again." });
  }
});

router.post("/forecast", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  try {
    const month = request.body?.planMonth;
    if (month !== undefined && typeof month !== "string") throw new FinancialPlanInputError("Plan month is invalid");
    response.json({ payload: await getFinancialPlanForecast(request.userId!, request.supabase!, month) });
  } catch (error) {
    console.error("financial plan forecast failed", { user_id: request.userId, error });
    response.status(error instanceof FinancialPlanInputError ? 422 : 503).json({ message: "Your spending forecast could not be loaded. Try again." });
  }
});

router.post("/recommendation", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  try {
    const { includedSubcategoryIds, includedCategoryIds, plannedAmountCentavos, manualAllocations, skipDebtRepayments, skipSavingsContributions, skipScheduledPayments } = parseRecommendationInput(request.body);
    const planMonth = request.body.planMonth;
    if (planMonth !== undefined) {
      if (typeof planMonth !== "string") throw new FinancialPlanInputError("Plan month is invalid");
      financialPlanPeriod(planMonth);
    }
    const commitmentBudgets = validateCommitmentBudgets(request.body.commitmentBudgets);
    if ((!skipDebtRepayments || !skipSavingsContributions) && request.body.commitmentBudgets === undefined) {
      throw new FinancialPlanInputError("Review savings and debt amounts before recommending category budgets");
    }
    response.status(200).json({ payload: await getFinancialPlanRecommendation(request.userId!, request.supabase!, plannedAmountCentavos, includedSubcategoryIds, includedCategoryIds, manualAllocations, { skipDebtRepayments, skipSavingsContributions, skipScheduledPayments, ...(request.body.commitmentBudgets === undefined ? {} : { commitmentBudgets }) }, ...(planMonth === undefined ? [] : [planMonth])) });
  } catch (error) {
    const status = error instanceof FinancialPlanInputError ? 422 : error instanceof FinancialPlanMlError || error instanceof FinancialPlanUnavailableError ? 503 : 500;
    console.error("financial plan recommendation failed", { user_id: request.userId, request_id: request.header("x-request-id")?.slice(0, 128) ?? null, status, error });
    response.status(status).json({ error: status === 422 ? "Unprocessable Entity" : status === 500 ? "Internal Server Error" : "Service Unavailable", message: status === 422 ? "Financial Plan inputs are incomplete" : "Financial Plan is temporarily unavailable" });
  }
});

// Adds AI explanations to a recommendation that was returned without them. Groq failures fall back to the
// deterministic explanations inside explainFinancialPlanRequest, so only a malformed request is an error.
router.post("/explanations", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  try {
    const explanationRequest = parseFinancialPlanExplanationRequest(request.body);
    response.status(200).json({ payload: { explanations: await explainFinancialPlanRequest(explanationRequest, fetch, request.userId) } });
  } catch (error) {
    const status = error instanceof FinancialPlanExplanationRequestError ? 422 : 500;
    console.error("financial plan explanation failed", { user_id: request.userId, status, error });
    response.status(status).json({ error: status === 422 ? "Unprocessable Entity" : "Internal Server Error", message: status === 422 ? "Financial Plan explanation request is invalid" : "Financial Plan explanations are temporarily unavailable" });
  }
});

type ManualAllocation = { target: "category" | "subcategory"; id: string; amountCentavos: number };

function parseRecommendationInput(value: unknown): { includedSubcategoryIds: string[]; includedCategoryIds: string[]; plannedAmountCentavos: number; manualAllocations: ManualAllocation[]; skipDebtRepayments: boolean; skipSavingsContributions: boolean; skipScheduledPayments: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FinancialPlanInputError("Planning amount is invalid");
  const parse = (key: "includedSubcategoryIds" | "includedCategoryIds") => {
    const ids = (value as Record<string, unknown>)[key];
    if (ids === undefined) return [];
    if (!Array.isArray(ids) || ids.length > 200 || ids.some((id) => typeof id !== "string" || !id.trim() || id.length > 128)) throw new FinancialPlanInputError("Included categories are invalid");
    return [...new Set(ids.map((id) => id.trim()))];
  };
  const includedSubcategoryIds = parse("includedSubcategoryIds");
  const includedCategoryIds = parse("includedCategoryIds");
  if (includedSubcategoryIds.length + includedCategoryIds.length > 200) {
    throw new FinancialPlanInputError("Included subcategories are invalid");
  }
  const plannedAmountCentavos = (value as Record<string, unknown>).plannedAmountCentavos;
  if (typeof plannedAmountCentavos !== "number" || !Number.isSafeInteger(plannedAmountCentavos) || plannedAmountCentavos <= 0 || plannedAmountCentavos > 100_000_000_000) throw new FinancialPlanInputError("Planning amount is invalid");
  const rawManualAllocations = (value as Record<string, unknown>).manualAllocations;
  if (rawManualAllocations !== undefined && (!Array.isArray(rawManualAllocations) || rawManualAllocations.length > 200)) throw new FinancialPlanInputError("Manual category allocations are invalid");
  const manualAllocations = (rawManualAllocations ?? []).map((allocation): ManualAllocation => {
    if (!allocation || typeof allocation !== "object" || Array.isArray(allocation)) throw new FinancialPlanInputError("Manual category allocations are invalid");
    const record = allocation as Record<string, unknown>;
    if ((record.target !== "category" && record.target !== "subcategory") || typeof record.id !== "string" || !record.id.trim() || record.id.length > 128 || typeof record.amountCentavos !== "number" || !Number.isSafeInteger(record.amountCentavos) || record.amountCentavos <= 0 || record.amountCentavos > plannedAmountCentavos) throw new FinancialPlanInputError("Manual category allocations are invalid");
    return { target: record.target, id: record.id.trim(), amountCentavos: record.amountCentavos };
  });
  if (new Set(manualAllocations.map((allocation) => `${allocation.target}:${allocation.id}`)).size !== manualAllocations.length) throw new FinancialPlanInputError("Manual category allocations are invalid");
  // Billers and remittances were always planned before they could be skipped, so older clients keep them included.
  const parseSkip = (key: "skipDebtRepayments" | "skipSavingsContributions" | "skipScheduledPayments", fallback = true) => {
    const skip = (value as Record<string, unknown>)[key];
    if (skip !== undefined && typeof skip !== "boolean") throw new FinancialPlanInputError("Reservation skips are invalid");
    return skip ?? fallback;
  };
  return { includedSubcategoryIds, includedCategoryIds, plannedAmountCentavos, manualAllocations, skipDebtRepayments: parseSkip("skipDebtRepayments"), skipSavingsContributions: parseSkip("skipSavingsContributions"), skipScheduledPayments: parseSkip("skipScheduledPayments", false) };
}

export default router;
