import { Router } from "express";
import type { Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { ONBOARDING_ERRORS } from "../lib/constants.js";
import { getServiceRoleClient } from "../lib/supabase.js";
import { createOnboardingFinancialConditionAssessment } from "../services/classification/financialConditionAssessmentService.js";
import { normalizeSeasonalAnswers } from "../services/onboarding/seasonalAnswers.js";
import { onboardingSubmissionError, validateOnboardingPayload } from "../services/onboarding/onboardingValidation.js";

const router = Router();

router.post("/onboarding/sessions", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;
  const { raw_answers, current_step_key } = request.body?.payload ?? {};

  const validationError = validateOnboardingPayload(raw_answers, current_step_key);
  if (validationError) {
    response.status(400).json({
      error: "Bad Request",
      message: validationError,
    });
    return;
  }

  const { data: session, error: rpcError } = await authenticatedSupabase
    .rpc("create_onboarding_session", {
      p_raw_answers: normalizeSeasonalAnswers(raw_answers ?? {}),
      p_current_step_key: current_step_key ?? null,
    })
    .single();

  if (rpcError || !session) {
    response.status(500).json({
      error: "Internal Server Error",
      message: ONBOARDING_ERRORS.session_create_failed,
    });
    return;
  }

  response.status(201).json({ payload: { session } });
});

router.patch("/onboarding/sessions/:id", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;
  const sessionId = request.params.id;
  const { raw_answers, current_step_key } = request.body?.payload ?? {};

  const validationError = validateOnboardingPayload(raw_answers, current_step_key, false);
  if (validationError) {
    response.status(400).json({
      error: "Bad Request",
      message: validationError,
    });
    return;
  }

  const { data: existing, error: fetchError } = await authenticatedSupabase
    .from("onboarding_sessions")
    .select("id, status, raw_answers")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    response.status(500).json({
      error: "Internal Server Error",
      message: ONBOARDING_ERRORS.session_fetch_failed,
    });
    return;
  }

  if (!existing) {
    response.status(404).json({
      error: "Not Found",
      message: ONBOARDING_ERRORS.session_not_found,
    });
    return;
  }

  if (existing.status !== "in_progress") {
    response.status(409).json({
      error: "Conflict",
      message: ONBOARDING_ERRORS.session_not_in_progress,
    });
    return;
  }

  const updateData: Record<string, unknown> = {};

  if (raw_answers !== undefined) {
    const mergedAnswers = normalizeSeasonalAnswers({ ...(existing.raw_answers as Record<string, unknown> | undefined), ...raw_answers });
    const mergedError = validateOnboardingPayload(mergedAnswers, current_step_key);
    if (mergedError) {
      response.status(400).json({ error: "Bad Request", message: mergedError });
      return;
    }
    updateData.raw_answers = normalizeSeasonalAnswers(mergedAnswers);
  }

  if (current_step_key !== undefined) {
    updateData.current_step_key = current_step_key;
  }

  if (Object.keys(updateData).length === 0) {
    response.status(400).json({
      error: "Bad Request",
      message: "No fields to update.",
    });
    return;
  }

  const { data: updated, error: updateError } = await authenticatedSupabase
    .from("onboarding_sessions")
    .update(updateData)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("id, user_id, status, started_at, submitted_at, current_step_key, raw_answers, metadata")
    .single();

  if (updateError) {
    response.status(500).json({
      error: "Internal Server Error",
      message: ONBOARDING_ERRORS.session_update_failed,
    });
    return;
  }

  response.status(200).json({ payload: { session: updated } });
});

router.post("/onboarding/sessions/:id/submit", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;
  const sessionId = request.params.id;
  const { confirm_data_use } = request.body?.payload ?? {};

  if (confirm_data_use !== true) {
    response.status(400).json({
      error: "Bad Request",
      message: ONBOARDING_ERRORS.submit_not_confirmed,
    });
    return;
  }

  const { data: session, error: sessionError } = await authenticatedSupabase
    .from("onboarding_sessions")
    .select("id, status, raw_answers")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sessionError) {
    response.status(500).json({
      error: "Internal Server Error",
      message: ONBOARDING_ERRORS.session_fetch_failed,
    });
    return;
  }

  if (!session) {
    response.status(404).json({
      error: "Not Found",
      message: ONBOARDING_ERRORS.session_not_found,
    });
    return;
  }

  if (session.status !== "in_progress") {
    response.status(409).json({
      error: "Conflict",
      message: ONBOARDING_ERRORS.session_not_in_progress,
    });
    return;
  }

  const rawAnswers = (session.raw_answers ?? {}) as Record<string, unknown>;
  const rawAnswersValidationError = validateOnboardingPayload(rawAnswers, undefined);
  if (rawAnswersValidationError) {
    response.status(400).json({ error: "Bad Request", message: rawAnswersValidationError });
    return;
  }
  const submissionError = onboardingSubmissionError(rawAnswers);
  if (submissionError) {
    response.status(400).json({ error: "Bad Request", ...submissionError });
    return;
  }

  const { data: result, error: rpcError } = await getServiceRoleClient()
    .rpc("submit_onboarding_session_v2", {
      p_session_id: sessionId,
      p_user_id: userId,
    });

  if (rpcError) {
    console.error("submit_onboarding_session RPC error", {
      operation: "submit_onboarding_session",
      method: request.method,
      route: request.originalUrl,
      request_id: request.header("x-request-id")?.slice(0, 128) ?? null,
      user_id: userId,
      session_id: sessionId,
      error: rpcError,
    });
    response.status(500).json({
      error: "Internal Server Error",
      message: ONBOARDING_ERRORS.submit_failed,
    });
    return;
  }

  const assessment = await createOnboardingFinancialConditionAssessment(userId, rawAnswers, getServiceRoleClient());

  response.status(200).json({
    payload: {
      session: { id: sessionId, status: "submitted" },
      classification_available: assessment != null,
      assessment: assessment ?? null,
    },
  });
});

router.get("/onboarding/sessions/current", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;

  const { data: inProgress, error: inProgressError } = await authenticatedSupabase
    .from("onboarding_sessions")
    .select("id, status, started_at, submitted_at, current_step_key, raw_answers")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inProgressError) {
    response.status(500).json({
      error: "Internal Server Error",
      message: ONBOARDING_ERRORS.session_fetch_failed,
    });
    return;
  }

  if (inProgress) {
    response.status(200).json({ payload: { session: inProgress } });
    return;
  }

  const { data: submitted, error: submittedError } = await authenticatedSupabase
    .from("onboarding_sessions")
    .select("id, status, started_at, submitted_at, current_step_key, raw_answers")
    .eq("user_id", userId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (submittedError) {
    response.status(500).json({
      error: "Internal Server Error",
      message: ONBOARDING_ERRORS.session_fetch_failed,
    });
    return;
  }

  if (!submitted) {
    response.status(200).json({ payload: { session: null } });
    return;
  }

  response.status(200).json({ payload: { session: submitted } });
});

export default router;
