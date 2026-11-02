import type { Classification } from "../dashboard/components/FinancialHealthCard";
import type { OnboardingSession } from "./types";
import { apiFetch } from "../../lib/helpers/apiFetch";

export function getCurrentSession(accessToken: string) {
  return apiFetch<{ payload?: { session: OnboardingSession | null }; error?: string; message?: string }>(
    accessToken,
    "/odin/api/onboarding/sessions/current",
  );
}

export function createSession(
  accessToken: string,
  rawAnswers?: Record<string, unknown>,
  currentStep?: string | null,
) {
  return apiFetch<{ payload?: { session: OnboardingSession }; error?: string; message?: string }>(
    accessToken,
    "/odin/api/onboarding/sessions",
    { method: "POST", body: { payload: { raw_answers: rawAnswers ?? {}, current_step_key: currentStep ?? null } } },
  );
}

export function updateSession(
  accessToken: string,
  sessionId: string,
  data: { raw_answers?: Record<string, unknown>; current_step_key?: string },
) {
  return apiFetch<{ payload?: { session: OnboardingSession }; error?: string; message?: string }>(
    accessToken,
    `/odin/api/onboarding/sessions/${sessionId}`,
    { method: "PATCH", body: { payload: data } },
  );
}

export function submitSession(accessToken: string, sessionId: string) {
  return apiFetch<{
    payload?: {
      session: { id: string; status: string };
      classification_available: boolean;
      assessment?: { output_snapshot?: Classification } | null;
    };
    error?: string;
    message?: string;
  }>(
    accessToken,
    `/odin/api/onboarding/sessions/${sessionId}/submit`,
    { method: "POST", body: { payload: { confirm_data_use: true } } },
  );
}

