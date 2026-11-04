import type { AccountDeletionRequest, ConsentRecord, DataExportBatch, DataExportRequest } from "./types";
import { EXPORT_BATCH_SIZE } from "./dataExport/constants";
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

export function requestDataExport(accessToken: string) {
  return apiFetch<{ payload?: DataExportRequest; error?: string; message?: string }>(
    accessToken, "/odin/api/data-export-requests", { method: "POST", body: { payload: { format: "csv" } } },
  );
}

export function getDataExportBatch(accessToken: string, requestId: string, dataset: string, after: string | null) {
  const query = new URLSearchParams({ dataset, limit: String(EXPORT_BATCH_SIZE) });
  if (after) query.set("after", after);
  return apiFetch<{ payload?: DataExportBatch; error?: string; message?: string }>(
    accessToken, `/odin/api/data-export-requests/${requestId}/batches?${query.toString()}`,
  );
}

export function completeDataExport(accessToken: string, requestId: string) {
  return apiFetch<{ message?: string }>(
    accessToken, `/odin/api/data-export-requests/${requestId}/complete`, { method: "POST", body: { payload: {} } },
  );
}

export function failDataExport(accessToken: string, requestId: string, reason: string) {
  return apiFetch<{ message?: string }>(
    accessToken, `/odin/api/data-export-requests/${requestId}/fail`, { method: "POST", body: { payload: { reason } } },
  );
}

export function getAccountDeletionHistory(accessToken: string) {
  return apiFetch<{ payload?: { requests: AccountDeletionRequest[] }; error?: string; message?: string }>(
    accessToken, "/odin/api/account-deletion-requests",
  );
}

export function getActiveAccountDeletion(accessToken: string) {
  return apiFetch<{ payload?: { request: AccountDeletionRequest | null }; error?: string; message?: string }>(
    accessToken, "/odin/api/account-deletion-requests/active",
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
