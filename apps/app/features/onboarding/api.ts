import type { Classification } from "../dashboard/components/FinancialHealthCard";
import type { OnboardingSession, ProfileAssignment } from "./types";
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

export function getProfileAssignment(accessToken: string) {
  return apiFetch<{ payload?: { assignment: ProfileAssignment | null; drivers: ProfileDriver[] }; error?: string; message?: string }>(
    accessToken,
    "/odin/api/profile/assignment/current",
  );
}

export function selectProfileAssignment(accessToken: string, profileLabel: string, rejectCurrent: boolean) {
  return apiFetch<{ error?: string; message?: string }>(
    accessToken,
    "/odin/api/profile/assignment/select",
    { method: "POST", body: { payload: { profile_label: profileLabel, reject_current: rejectCurrent } } },
  );
}

export function confirmProfileAssignment(accessToken: string, assignmentId: string) {
  return apiFetch<{ error?: string; message?: string }>(
    accessToken,
    "/odin/api/profile/assignment/confirm",
    { method: "POST", body: { payload: { assignment_id: assignmentId, confirmation: true } } },
  );
}

export function rejectProfileAssignment(accessToken: string, assignmentId: string, reason: string) {
  return apiFetch<{ error?: string; message?: string }>(
    accessToken,
    "/odin/api/profile/assignment/reject",
    { method: "POST", body: { payload: { assignment_id: assignmentId, override_reason: reason } } },
  );
}

export function requestProfileReassessment(accessToken: string, reason: string, useRecentTransactions: boolean) {
  return apiFetch<{ payload?: { status?: string }; error?: string; message?: string }>(
    accessToken,
    "/odin/api/profile/reassess",
    { method: "POST", body: { payload: { reason, use_recent_transactions: useRecentTransactions, assessment_method: "questionnaire" } } },
  );
}

export type ProfileDriver = {
  driver_key: string;
  driver_label: string;
  value_text: string;
  explanation: string;
};
