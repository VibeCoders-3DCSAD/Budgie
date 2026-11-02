import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { VALID_CONSENT_KINDS, VALID_CONSENT_STATUSES } from "../lib/constants.js";

const router = Router();

router.post("/", requireAuth, async (request: AuthenticatedRequest, response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;

  const payload = request.body?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    response.status(400).json({ error: "Bad Request", message: "Payload is required" });
    return;
  }

  const { consent_kind, status, version } = payload as Record<string, unknown>;

  if (typeof consent_kind !== "string" || !VALID_CONSENT_KINDS.includes(consent_kind)) {
    response.status(400).json({
      error: "Bad Request",
      message: `consent_kind must be one of: ${VALID_CONSENT_KINDS.join(", ")}`,
    });
    return;
  }

  if (typeof status !== "string" || !VALID_CONSENT_STATUSES.includes(status)) {
    response.status(400).json({
      error: "Bad Request",
      message: `status must be one of: ${VALID_CONSENT_STATUSES.join(", ")}`,
    });
    return;
  }

  if (typeof version !== "string" || version.trim() === "") {
    response.status(400).json({
      error: "Bad Request",
      message: "version is required",
    });
    return;
  }

  // The database requires a withdrawal time on withdrawals; the server sets it, never the client.
  const withdrawnAt = status === "withdrawn" ? new Date().toISOString() : null;

  const { data, error } = await authenticatedSupabase
    .from("user_consents")
    .insert({
      user_id: userId,
      consent_kind,
      status,
      version: version.trim(),
      withdrawn_at: withdrawnAt,
    })
    .select("consent_kind, status, version, recorded_at")
    .single();

  if (error) {
    response.status(500).json({
      error: "Internal Server Error",
      message: "Failed to record consent",
    });
    return;
  }

  response.status(201).json({
    payload: { consent: data },
  });
});

export default router;
