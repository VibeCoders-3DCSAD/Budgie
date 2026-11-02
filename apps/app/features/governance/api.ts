import type { AccountDeletionRequest, ConsentRecord, DataExportRequest } from "./types";
import { hasCurrentTermsConsent } from "./constants";
import type { SeasonalPreferences } from "@odin/spending-insights/seasons";
import { apiFetch } from "../../lib/helpers/apiFetch";

export function getConsents(accessToken: string) {
  return apiFetch<{ payload?: { consents: ConsentRecord[] }; error?: string; message?: string }>(
    accessToken, "/odin/api/me?include=consents",
  );
}

export function getPreferences(accessToken: string) {
  return apiFetch<{ payload?: { preferences: SeasonalPreferences | null; submitted_at: string | null }; message?: string }>(
    accessToken, "/odin/api/onboarding/preferences",
  );
}

export function savePreferences(accessToken: string, preferences: SeasonalPreferences) {
  return apiFetch<{ payload?: { preferences: SeasonalPreferences; submitted_at: string | null }; message?: string }>(
    accessToken, "/odin/api/onboarding/preferences", { method: "PATCH", body: { payload: { preferences } } },
  );
}

export async function getCurrentTermsConsent(accessToken: string) {
  const result = await getConsents(accessToken);
  const consents = result.body.payload?.consents ?? [];
  return { ...result, hasCurrentTermsConsent: hasCurrentTermsConsent(consents) };
}

export function submitConsent(
  accessToken: string,
  payload: { consent_kind: string; status: string; version: string },
) {
  return apiFetch<{ payload?: { consent: ConsentRecord }; error?: string; message?: string }>(
    accessToken, "/odin/api/consents", { method: "POST", body: { payload } },
  );
}

export function getDataExports(accessToken: string) {
  return apiFetch<{ payload?: { requests: { id: string; status: string; requested_at: string }[] }; error?: string; message?: string }>(
    accessToken, "/odin/api/data-export-requests",
  );
}

export function requestDataExport(accessToken: string) {
  return apiFetch<{ payload?: DataExportRequest; error?: string; message?: string }>(
    accessToken, "/odin/api/data-export-requests", { method: "POST", body: { payload: {} } },
  );
}

export function requestAccountDeletion(accessToken: string) {
  return apiFetch<{ payload?: { request: AccountDeletionRequest }; error?: string; message?: string }>(
    accessToken, "/odin/api/account-deletion-requests", { method: "POST", body: { payload: {} } },
  );
}

export function confirmAccountDeletion(accessToken: string, id: string) {
  return apiFetch<{ payload?: { request: AccountDeletionRequest }; error?: string; message?: string }>(
    accessToken, `/odin/api/account-deletion-requests/${id}/confirm`, { method: "POST", body: { payload: { confirmation: true } } },
  );
}

export function cancelAccountDeletion(accessToken: string, id: string) {
  return apiFetch<{ payload?: { request: AccountDeletionRequest }; error?: string; message?: string }>(
    accessToken, `/odin/api/account-deletion-requests/${id}/cancel`, { method: "POST" },
  );
}
