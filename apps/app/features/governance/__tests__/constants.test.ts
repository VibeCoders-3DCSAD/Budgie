import { hasCurrentTermsConsent } from "../constants";
import type { ConsentRecord } from "../types";

function terms(status: ConsentRecord["status"], recordedAt: string, version = "2026-06"): ConsentRecord {
  return { consent_kind: "terms", status, version, recorded_at: recordedAt };
}

describe("hasCurrentTermsConsent", () => {
  it("requires the current granted terms version", () => {
    expect(hasCurrentTermsConsent([
      { consent_kind: "privacy", status: "granted", version: "2026-06", recorded_at: "2026-07-01T00:00:00Z" },
      terms("granted", "2026-07-01T00:00:00Z", "2025-01"),
    ])).toBe(false);

    expect(hasCurrentTermsConsent([terms("granted", "2026-07-01T00:00:00Z")])).toBe(true);
  });

  it("treats a withdrawal after a grant as not accepted, whatever the list order", () => {
    const grant = terms("granted", "2026-07-01T00:00:00Z");
    const withdrawal = terms("withdrawn", "2026-07-02T00:00:00Z");

    expect(hasCurrentTermsConsent([withdrawal, grant])).toBe(false);
    expect(hasCurrentTermsConsent([grant, withdrawal])).toBe(false);
  });

  it("accepts a grant made after a withdrawal", () => {
    expect(hasCurrentTermsConsent([
      terms("withdrawn", "2026-07-01T00:00:00Z"),
      terms("granted", "2026-07-02T00:00:00Z"),
    ])).toBe(true);
  });
});
