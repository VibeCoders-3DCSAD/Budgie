import type { ConsentRecord } from "./types";

export const TERMS_CONSENT_KIND = "terms";
export const CURRENT_TERMS_VERSION = "2026-06";

// The newest event for the current terms decides; an older grant never outlives a later withdrawal.
export function hasCurrentTermsConsent(consents: ConsentRecord[]) {
  const latest = consents
    .filter((consent) => consent.consent_kind === TERMS_CONSENT_KIND && consent.version === CURRENT_TERMS_VERSION)
    .reduce<ConsentRecord | null>((newest, consent) => {
      if (newest && Date.parse(newest.recorded_at) >= Date.parse(consent.recorded_at)) return newest;
      return consent;
    }, null);
  return latest?.status === "granted";
}

export const ERRORS = {
  TIMEOUT: "Connection timed out.",
  GENERIC: "Something went wrong.",
  EXPORT_UNAVAILABLE: "Export service is unavailable.",
  EXPORT_UNAVAILABLE_RETRY: "Export service is unavailable. Please try again.",
  CONSENT_UNAVAILABLE: "Consent service is unavailable. Please try again.",
  ACTIVE_DELETION_REQUEST: "You already have an active deletion request.",
  UNEXPECTED_RESPONSE: "Unexpected response. Please try again.",
  FAILED_LOAD_PRIVACY: "Failed to load privacy settings.",
  FAILED_SAVE: "Failed to save.",
  FAILED_LOAD: "Failed to load.",
} as const;
