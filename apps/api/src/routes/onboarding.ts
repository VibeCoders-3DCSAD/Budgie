import { Router } from "express";
import type { Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { ONBOARDING_ERRORS } from "../lib/constants.js";
import { getServiceRoleClient } from "../lib/supabase.js";
import { createOnboardingFinancialConditionAssessment } from "../services/classification/financialConditionAssessmentService.js";
import { CUSTOM_EVENT_ID } from "@odin/spending-insights/seasons.js";
import { normalizeSeasonalAnswers, validateSeasonalAnswers } from "../services/onboarding/seasonalAnswers.js";

const router = Router();

const ONBOARDING_ANSWER_KEYS = new Set([
  "questionnaire_version", "monthly_income", "emergency_savings_runway", "monthly_essential_living_costs",
  "paying_off_debt", "monthly_debt_payment_percentage", "credit_card_revolving_months",
  "high_expense_seasons", "low_expense_seasons", "saving_seasons", "custom_seasonal_events",
]);

const ARRAY_ANSWER_KEYS = new Set(["high_expense_seasons", "low_expense_seasons", "saving_seasons"]);
const STRING_ANSWER_KEYS = new Set([...ONBOARDING_ANSWER_KEYS].filter((key) => !ARRAY_ANSWER_KEYS.has(key) && key !== "custom_seasonal_events"));
const EXPENSE_SEASONS = ["q1", "q2", "q3", "q4", "rainy_season", "back_to_school", "undas", "christmas_ber_months", "new_year", "summer", "annual_payments", "family_celebrations", "other", "none"];
const ANSWER_OPTIONS: Record<string, readonly string[]> = {
  questionnaire_version: ["2"],
  emergency_savings_runway: ["1_month", "2_months", "3_months", "more_than_3_months", "not_sure"],
  paying_off_debt: ["true", "false"],
  credit_card_revolving_months: ["no_credit_card", "always_before_due", "1_to_11_months", "over_a_year"],
  high_expense_seasons: EXPENSE_SEASONS,
  low_expense_seasons: EXPENSE_SEASONS,
  saving_seasons: EXPENSE_SEASONS,
};

function validateOnboardingPayload(
  raw_answers: unknown,
  current_step_key: unknown,
  checkReferences = true,
): string | null {
  if (raw_answers !== undefined && (typeof raw_answers !== "object" || raw_answers === null || Array.isArray(raw_answers))) {
    return "raw_answers must be a plain object when provided.";
  }
  if (raw_answers && typeof raw_answers === "object" && !Array.isArray(raw_answers)) {
    for (const [key, value] of Object.entries(raw_answers)) {
      if (!ONBOARDING_ANSWER_KEYS.has(key)) return `Unsupported onboarding answer: ${key}.`;
      if (ARRAY_ANSWER_KEYS.has(key) && (!Array.isArray(value) || value.some((item) => typeof item !== "string"))) {
        return `${key} must be an array of strings.`;
      }
      if (STRING_ANSWER_KEYS.has(key) && typeof value !== "string") return `${key} must be a string.`;
      const options = ANSWER_OPTIONS[key];
      if (options && typeof value === "string" && value !== "" && !options.includes(value)) return `Invalid ${key}.`;
      if (options && Array.isArray(value) && value.some((item) => !options.includes(item) && !(EXPENSE_SEASONS === options && CUSTOM_EVENT_ID.test(item)))) return `Invalid ${key}.`;
      if (key === "monthly_income" && typeof value === "string" && value !== "" && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || !Number.isSafeInteger(Number(value) * 100))) {
        return `${key} must be a non-negative whole number.`;
      }
      if (["monthly_essential_living_costs", "monthly_debt_payment_percentage"].includes(key) && typeof value === "string" && value !== "" && value !== "not_sure" && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || !Number.isSafeInteger(Number(value) * 100))) {
        return `${key} must be a non-negative whole number or not_sure.`;
      }
      if (key === "monthly_debt_payment_percentage" && value !== "not_sure" && Number(value) > 100) return "Debt payment percentage must be between 0 and 100, or not_sure.";
    }
  }
  if (raw_answers && typeof raw_answers === "object" && !Array.isArray(raw_answers)) {
    const answers = raw_answers as Record<string, unknown>;
    const seasonalError = validateSeasonalAnswers(answers, checkReferences);
    if (seasonalError) return seasonalError;
    for (const key of ["high_expense_seasons", "low_expense_seasons", "saving_seasons"]) {
      const selections = answers[key];
      if (Array.isArray(selections) && selections.includes("none") && selections.length > 1) return `${key} cannot combine none with other seasons.`;
    }
    const higher = answers.high_expense_seasons;
    const lower = answers.low_expense_seasons;
    if (Array.isArray(higher) && Array.isArray(lower) && lower.some((season) => season !== "none" && higher.includes(season))) {
      return "A season cannot be selected for both higher and lower expenses.";
    }
  }
  if (current_step_key !== undefined && current_step_key !== null && typeof current_step_key !== "string") {
    return "current_step_key must be a string when provided.";
  }
  return null;
}

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
  const requiredFields = [
    "monthly_income",
    "emergency_savings_runway",
    "monthly_essential_living_costs",
    "paying_off_debt",
    "credit_card_revolving_months",
    "high_expense_seasons",
    "low_expense_seasons",
    "saving_seasons",
  ];
  const missing = requiredFields.filter((f) => {
    const v = rawAnswers[f];
    if (ARRAY_ANSWER_KEYS.has(f))
      return !Array.isArray(v) || v.length === 0;
    return typeof v !== "string" || v === "";
  });
  if (missing.length > 0) {
    response.status(400).json({
      error: "Bad Request",
      message: "Onboarding questionnaire is incomplete. Please complete all required steps before submitting.",
      fields: missing,
    });
    return;
  }
  if (rawAnswers.paying_off_debt === "true" && (typeof rawAnswers.monthly_debt_payment_percentage !== "string" || rawAnswers.monthly_debt_payment_percentage === "")) {
    response.status(400).json({
      error: "Bad Request",
      message: "Enter the percentage of monthly income allocated to debt.",
      fields: ["monthly_debt_payment_percentage"],
    });
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
