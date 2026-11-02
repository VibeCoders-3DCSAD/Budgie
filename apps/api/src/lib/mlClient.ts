import { isAbortError, withTimeout } from "./http/withTimeout.js";
import { trustedMlHeaders } from "./mlInferenceGateway.js";

type FinancialClassificationFailureReason = "not_configured" | "timeout" | "network_error" | "http_error" | "invalid_response";

type FinancialClassificationResult =
  | { ok: true; classification: Record<string, unknown>; modelVersion: string }
  | { ok: false; reason: FinancialClassificationFailureReason };

export async function classifyFinancialCondition(
  userId: string,
  input: Record<string, unknown>,
): Promise<FinancialClassificationResult> {
  const baseUrl = process.env.ML_SERVICE_URL?.replace(/\/$/, "");
  if (!baseUrl) return { ok: false, reason: "not_configured" };
  const {
    source_updated_at: _sourceUpdatedAt,
    assessment_source: _assessmentSource,
    ...classificationInput
  } = input;
  const requestBody = JSON.stringify({ request_id: crypto.randomUUID(), user_id: userId, ...classificationInput });
  const headers = trustedMlHeaders(userId, requestBody);
  if (!headers) return { ok: false, reason: "not_configured" };

  try {
    return await withTimeout(5_000, async (signal): Promise<FinancialClassificationResult> => {
      const response = await fetch(`${baseUrl}/api/v1/classification/v2`, {
        method: "POST",
        headers,
        signal,
        body: requestBody,
      });
      if (!response.ok) return { ok: false, reason: "http_error" };
      const body: unknown = await response.json();
      const value = body as { classification?: unknown; metadata?: { model_version?: unknown; strategy_used?: unknown } };
      const modelVersion = value.metadata?.model_version;
      if (!value.classification || typeof value.classification !== "object"
        || typeof modelVersion !== "string" || !modelVersion.trim()
        || value.metadata?.strategy_used !== "rule_based") return { ok: false, reason: "invalid_response" };
      return { ok: true, classification: value.classification as Record<string, unknown>, modelVersion };
    });
  } catch (error) {
    return { ok: false, reason: isAbortError(error) ? "timeout" : "network_error" };
  }
}
