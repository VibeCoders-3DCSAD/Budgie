import { Router } from "express";
import type { Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { ACTIVE_REQUEST_STATUSES } from "../lib/constants.js";

const router = Router();

const VALID_FORMATS = ["json", "csv"];

router.get("/data-export-requests", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;

  const { data, error } = await authenticatedSupabase
    .from("data_export_requests")
    .select("id, status, requested_at")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(10);

  if (error) {
    response.status(500).json({ error: "Internal Server Error", message: "Failed to fetch export requests" });
    return;
  }

  response.status(200).json({ payload: { requests: data ?? [] } });
});

router.post("/data-export-requests", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;

  const payload = request.body?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    response.status(400).json({
      error: "Bad Request",
      message: "Payload is required",
    });
    return;
  }

  const metadata: Record<string, string> = {};

  if (payload.format !== undefined) {
    if (typeof payload.format !== "string" || !VALID_FORMATS.includes(payload.format)) {
      response.status(400).json({
        error: "Bad Request",
        message: "format must be one of: json, csv",
      });
      return;
    }
    metadata.format = payload.format;
  }

  if (payload.reason !== undefined) {
    if (typeof payload.reason !== "string") {
      response.status(400).json({
        error: "Bad Request",
        message: "reason must be a string",
      });
      return;
    }
    metadata.reason = payload.reason;
  }

  const { error: cancelError } = await authenticatedSupabase
    .from("data_export_requests")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .in("status", ACTIVE_REQUEST_STATUSES);

  if (cancelError) {
    response.status(500).json({
      error: "Internal Server Error",
      message: "Failed to cancel previous export request",
    });
    return;
  }

  const { data, error } = await authenticatedSupabase
    .from("data_export_requests")
    .insert({ user_id: userId, metadata })
    .select("id, status")
    .single();

  if (error || !data) {
    response.status(500).json({
      error: "Internal Server Error",
      message: "Failed to create data export request",
    });
    return;
  }

  response.status(201).json({
    payload: {
      request: {
        id: data.id,
        status: data.status,
      },
    },
  });
});

export default router;
