import { Router } from "express";
import type { Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

const VALID_INCLUDE_FIELDS = ["privacy", "consents"];

function parseIncludeParam(includeValue: unknown): Set<string> {
  if (typeof includeValue !== "string" || includeValue.trim().length === 0) {
    return new Set(["privacy"]);
  }

  const requestedFields = includeValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const invalidField = requestedFields.find(
    (value) => !VALID_INCLUDE_FIELDS.includes(value),
  );

  if (invalidField) {
    throw new Error(`Invalid include field: ${invalidField}`);
  }

  return new Set(requestedFields);
}

router.get("/", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;

  let includeFields: Set<string>;
  try {
    includeFields = parseIncludeParam(request.query.include);
  } catch {
    response.status(400).json({
      error: "Bad Request",
      message: `Invalid include parameter. Must be a comma-separated subset of: ${VALID_INCLUDE_FIELDS.join(", ")}`,
    });
    return;
  }

  const payload: Record<string, unknown> = {};

  if (includeFields.has("privacy")) {
    const { data: privacy, error: privacyError } = await authenticatedSupabase
      .from("user_privacy_settings")
      .select("personalization_enabled, notifications_opt_in")
      .eq("user_id", userId)
      .single();

    if (privacyError && privacyError.code !== "PGRST116") {
      response.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch privacy settings",
      });
      return;
    }

    payload.privacy_settings = {
      personalization_enabled: privacy?.personalization_enabled ?? true,
      notifications_opt_in: privacy?.notifications_opt_in ?? false,
    };
  }

  if (includeFields.has("consents")) {
    const { data: consents, error: consentsError } = await authenticatedSupabase
      .from("user_consents")
      .select("consent_kind, status, version, recorded_at")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .limit(20);

    if (consentsError) {
      response.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch consents",
      });
      return;
    }

    payload.consents = consents ?? [];
  }

  response.status(200).json({
    payload,
  });
});

export default router;
