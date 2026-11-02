import { Router } from "express";
import type { Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { ForecastInterpretationValidationError, interpretForecast, parseForecastInterpretationRequest } from "../services/forecast/forecastInterpretationService.js";
import { ForecastUnavailableError, ForecastUpstreamError, ForecastValidationError, getMlForecast, getMlQuarterlyForecast, parseForecastRequest } from "../services/forecast/forecastService.js";

const router = Router();

router.post("/", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  try {
    const forecastRequest = parseForecastRequest(request.body);
    const payload = await getMlForecast(request.userId!, forecastRequest);
    response.status(200).json({ payload });
  } catch (error) {
    sendForecastError(request, response, error);
  }
});

router.post("/quarterly", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  try {
    const forecastRequest = parseForecastRequest(request.body);
    const payload = await getMlQuarterlyForecast(request.userId!, forecastRequest);
    response.status(200).json({ payload });
  } catch (error) {
    sendForecastError(request, response, error);
  }
});

// Rewords the app's forecast notes with Groq; any Groq failure returns the notes unchanged.
router.post("/interpretation", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  try {
    const notes = parseForecastInterpretationRequest(request.body);
    response.status(200).json({ payload: { notes: await interpretForecast(notes, fetch, request.userId) } });
  } catch (error) {
    if (error instanceof ForecastInterpretationValidationError) {
      response.status(400).json({ error: "Bad Request", message: "Invalid forecast interpretation request" });
      return;
    }
    console.error("forecast interpretation failed", { user_id: request.userId, error_class: error instanceof Error ? error.constructor.name : "UnknownError" });
    response.status(503).json({ error: "Service Unavailable", message: "Forecast interpretation is temporarily unavailable" });
  }
});

function sendForecastError(request: AuthenticatedRequest, response: Response, error: unknown) {
  if (error instanceof ForecastUnavailableError) {
    response.status(200).json({ payload: null, reason: error.reason, message: error.message });
    return;
  }
  if (error instanceof ForecastValidationError) {
    response.status(400).json({ error: "Bad Request", message: "Invalid forecast request" });
    return;
  }
  const status = error instanceof ForecastUpstreamError ? error.status : 503;
  console.error("Forecast request failed", {
    user_id: request.userId,
    request_id: request.header("x-request-id")?.slice(0, 128) ?? null,
    transaction_count: Array.isArray(request.body?.historicalTransactions) ? request.body.historicalTransactions.length : 0,
    http_status: status,
    error_class: error instanceof Error ? error.constructor.name : "UnknownError",
    error_message: error instanceof Error ? error.message : "Unknown forecast failure",
    failure_stage: error instanceof ForecastUpstreamError ? error.failureStage : "unknown",
    cause: error instanceof Error && error.cause instanceof Error
      ? { name: error.cause.name, message: error.cause.message }
      : undefined,
  });
  response.status(status === 422 ? 422 : status >= 500 ? 503 : 502).json({
    error: "Service Unavailable",
    message: "Forecast information is temporarily unavailable",
  });
}

export default router;
