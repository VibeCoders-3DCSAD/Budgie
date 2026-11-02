import { Router, type Response } from "express";
import { getFinancialPlanCommitments } from "../services/financialPlan/commitmentsLoader.js";
import { getFinancialPlanForecast } from "../services/financialPlan/planForecast.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { FinancialPlanInputError, FinancialPlanUnavailableError, getFinancialPlanRecommendation } from "../services/financialPlan/recommendationService.js";
import { parseRecommendationRequest } from "../services/financialPlan/recommendationRequest.js";
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

// 422 for bad input, 503 when the ML service or plan data is unavailable, 500 otherwise.
function recommendationErrorStatus(error: unknown): number {
  if (error instanceof FinancialPlanInputError) return 422;
  if (error instanceof FinancialPlanMlError || error instanceof FinancialPlanUnavailableError) return 503;
  return 500;
}

const RECOMMENDATION_ERROR_BODIES: Record<number, { error: string; message: string }> = {
  422: { error: "Unprocessable Entity", message: "Financial Plan inputs are incomplete" },
  500: { error: "Internal Server Error", message: "Financial Plan is temporarily unavailable" },
  503: { error: "Service Unavailable", message: "Financial Plan is temporarily unavailable" },
};

router.post("/recommendation", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  try {
    const { plannedAmountCentavos, includedSubcategoryIds, includedCategoryIds, manualAllocations, reservationSkips, planMonth } = parseRecommendationRequest(request.body);
    response.status(200).json({ payload: await getFinancialPlanRecommendation(request.userId!, request.supabase!, plannedAmountCentavos, includedSubcategoryIds, includedCategoryIds, manualAllocations, reservationSkips, ...(planMonth === undefined ? [] : [planMonth])) });
  } catch (error) {
    const status = recommendationErrorStatus(error);
    console.error("financial plan recommendation failed", { user_id: request.userId, request_id: request.header("x-request-id")?.slice(0, 128) ?? null, status, error });
    response.status(status).json(RECOMMENDATION_ERROR_BODIES[status]);
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

export default router;
