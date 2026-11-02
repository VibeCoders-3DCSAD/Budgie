import { Router } from "express";
import type { Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { ACTIVE_REQUEST_STATUSES } from "../lib/constants.js";

const router = Router();


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

router.post("/account-deletion-requests", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;

  const payload = request.body?.payload;
  if (!isRecord(payload)) {
    response.status(400).json({
      error: "Bad Request",
      message: "Payload is required",
    });
    return;
  }

  if (payload.reason !== undefined && typeof payload.reason !== "string") {
    response.status(400).json({
      error: "Bad Request",
      message: "reason must be a string",
    });
    return;
  }

  const { data: active } = await authenticatedSupabase
    .from("account_deletion_requests")
    .select("id")
    .eq("user_id", userId)
    .in("status", ACTIVE_REQUEST_STATUSES)
    .limit(1);

  if (active && active.length > 0) {
    response.status(409).json({
      error: "Conflict",
      message: "An active deletion request already exists",
    });
    return;
  }

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 30);
  const minDeleteAt = minDate.toISOString();

  let scheduledDeleteAt: string;
  if (payload.scheduled_delete_at !== undefined) {
    let parsed: Date;
    try {
      parsed = new Date(payload.scheduled_delete_at as string);
      if (isNaN(parsed.getTime())) throw new Error();
    } catch {
      response.status(400).json({
        error: "Bad Request",
        message: "scheduled_delete_at must be a valid date string",
      });
      return;
    }
    scheduledDeleteAt = parsed.toISOString();
    if (scheduledDeleteAt < minDeleteAt) {
      response.status(400).json({
        error: "Bad Request",
        message: "scheduled_delete_at must be at least 30 days from now",
      });
      return;
    }
  } else {
    scheduledDeleteAt = minDeleteAt;
  }

  const { data, error } = await authenticatedSupabase
    .from("account_deletion_requests")
    .insert({
      user_id: userId,
      scheduled_delete_at: scheduledDeleteAt,
      reason: payload.reason ?? null,
    })
    .select("id, status, requested_at, scheduled_delete_at")
    .single();

  if (error || !data) {
    response.status(500).json({
      error: "Internal Server Error",
      message: "Failed to create deletion request",
    });
    return;
  }

  response.status(201).json({
    payload: {
      request: {
        id: data.id,
        status: data.status,
        requested_at: data.requested_at,
        scheduled_delete_at: data.scheduled_delete_at,
      },
    },
  });
});

router.post("/account-deletion-requests/:id/confirm", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;
  const requestId = request.params.id;

  const payload = request.body?.payload;
  if (!isRecord(payload) || payload.confirmation !== true) {
    response.status(400).json({
      error: "Bad Request",
      message: "confirmation must be true",
    });
    return;
  }

  const { data, error } = await authenticatedSupabase
    .from("account_deletion_requests")
    .update({
      status: "processing",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("user_id", userId)
    .eq("status", "requested")
    .select("id, status, confirmed_at, scheduled_delete_at")
    .single();

  if (error || !data) {
    response.status(404).json({
      error: "Not Found",
      message: "Deletion request not found or already processed",
    });
    return;
  }

  response.status(200).json({
    payload: {
      request: {
        id: data.id,
        status: data.status,
        confirmed_at: data.confirmed_at,
        scheduled_delete_at: data.scheduled_delete_at,
      },
    },
  });
});

router.post("/account-deletion-requests/:id/cancel", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;
  const requestId = request.params.id;

  const payload = request.body?.payload;
  const metadata: Record<string, string> = {};

  if (isRecord(payload)) {
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
  }

  const { data, error } = await authenticatedSupabase
    .from("account_deletion_requests")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      metadata,
    })
    .eq("id", requestId)
    .eq("user_id", userId)
    .in("status", ACTIVE_REQUEST_STATUSES)
    .select("id, status, cancelled_at")
    .single();

  if (error || !data) {
    response.status(404).json({
      error: "Not Found",
      message: "Deletion request not found or cannot be cancelled",
    });
    return;
  }

  response.status(200).json({
    payload: {
      request: {
        id: data.id,
        status: data.status,
        cancelled_at: data.cancelled_at,
      },
    },
  });
});

export default router;
