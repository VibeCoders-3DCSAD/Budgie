import { Router } from "express";
import type { Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { rateLimitPerUser } from "../middleware/rateLimit.js";
import { loggableError } from "../lib/errorLog.js";
import { ACTIVE_REQUEST_STATUSES } from "../lib/constants.js";
import { UUID_PATTERN } from "../lib/uuid.js";
import { EXPORT_DATASET_NAMES } from "../services/dataExport/exportDatasets.js";
import { fetchExportBatch, parseBatchQuery } from "../services/dataExport/exportBatch.js";

const router = Router();

const VALID_FORMATS = ["csv"];
const MAX_FAILURE_REASON_LENGTH = 200;

// Starting an export is rare; batches arrive steadily while one runs. Clients pace batches to stay under this.
const createLimit = rateLimitPerUser({ name: "data-export-create", windowMs: 60 * 60 * 1000, max: 10 });
const batchLimit = rateLimitPerUser({ name: "data-export-batch", windowMs: 60 * 1000, max: 120 });

type ExportRequestRow = { id: string; status: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function respondBadRequest(response: Response, message: string): void {
  response.status(400).json({ error: "Bad Request", message });
}

function respondNotFound(response: Response): void {
  response.status(404).json({ error: "Not Found", message: "Export request not found" });
}

function respondInactive(response: Response): void {
  response.status(409).json({ error: "Conflict", message: "Export request is no longer active" });
}

function respondServerError(response: Response, message: string): void {
  response.status(500).json({ error: "Internal Server Error", message });
}

// The caller's own export request, or null when it does not exist or belongs to someone else.
async function findOwnExportRequest(supabase: SupabaseClient, userId: string, id: string): Promise<ExportRequestRow | null> {
  const { data, error } = await supabase
    .from("data_export_requests")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle<ExportRequestRow>();
  if (error) throw error;
  return data;
}

// Moves an active request to a final status. Returns false when it was no longer active.
async function finishExportRequest(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  changes: { status: "completed" | "failed"; failure_reason?: string | null },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("data_export_requests")
    .update({ ...changes, processed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .in("status", ACTIVE_REQUEST_STATUSES)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

router.get("/data-export-requests", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;

  const { data, error } = await authenticatedSupabase
    .from("data_export_requests")
    .select("id, status, requested_at, processed_at")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[data-export] export request list failed", { user_id: userId, error: loggableError(error) });
    respondServerError(response, "Failed to fetch export requests");
    return;
  }

  response.status(200).json({ payload: { requests: data ?? [] } });
});

router.post("/data-export-requests", requireAuth, createLimit, async (request: AuthenticatedRequest, response: Response) => {
  const authenticatedSupabase = request.supabase!;

  const payload = request.body?.payload;
  if (!isRecord(payload)) {
    respondBadRequest(response, "Payload is required");
    return;
  }

  const metadata: Record<string, string> = { format: "csv" };

  if (payload.format !== undefined) {
    if (typeof payload.format !== "string" || !VALID_FORMATS.includes(payload.format)) {
      respondBadRequest(response, "format must be csv");
      return;
    }
    metadata.format = payload.format;
  }

  if (payload.reason !== undefined) {
    if (typeof payload.reason !== "string") {
      respondBadRequest(response, "reason must be a string");
      return;
    }
    metadata.reason = payload.reason;
  }

  // Cancels the active export and creates the new one in one transaction.
  const { data, error } = await authenticatedSupabase
    .rpc("replace_data_export_request", { p_metadata: metadata })
    .single<{ id: string; status: string }>();

  if (error || !data) {
    console.error("[data-export] export request replacement failed", { user_id: request.userId, error: error ? loggableError(error) : "no row returned" });
    respondServerError(response, "Failed to create data export request");
    return;
  }

  response.status(201).json({
    payload: {
      request: { id: data.id, status: data.status },
      datasets: EXPORT_DATASET_NAMES,
    },
  });
});

// One page of one dataset. The first batch marks the request as processing; a request replaced by a newer
// export stops serving batches, so only one export runs per user.
router.get("/data-export-requests/:id/batches", requireAuth, batchLimit, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const authenticatedSupabase = request.supabase!;
  const requestId = String(request.params.id);

  if (!UUID_PATTERN.test(requestId)) {
    respondNotFound(response);
    return;
  }

  const query = parseBatchQuery(request.query as Record<string, unknown>);
  if ("error" in query) {
    respondBadRequest(response, query.error);
    return;
  }

  try {
    const exportRequest = await findOwnExportRequest(authenticatedSupabase, userId, requestId);
    if (!exportRequest) {
      respondNotFound(response);
      return;
    }
    if (!ACTIVE_REQUEST_STATUSES.includes(exportRequest.status)) {
      respondInactive(response);
      return;
    }
    if (exportRequest.status === "requested") {
      const { error } = await authenticatedSupabase
        .from("data_export_requests")
        .update({ status: "processing" })
        .eq("id", requestId)
        .eq("user_id", userId)
        .eq("status", "requested");
      if (error) throw error;
    }

    const batch = await fetchExportBatch(authenticatedSupabase, userId, query);
    response.status(200).json({ payload: { dataset: query.dataset.name, rows: batch.rows, next_cursor: batch.nextCursor } });
  } catch (error) {
    console.error("[data-export] export batch failed", { user_id: userId, request_id: requestId, dataset: query.dataset.name, error: loggableError(error) });
    respondServerError(response, "Failed to read export batch");
  }
});

router.post("/data-export-requests/:id/complete", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const requestId = String(request.params.id);
  if (!UUID_PATTERN.test(requestId)) {
    respondNotFound(response);
    return;
  }

  try {
    const finished = await finishExportRequest(request.supabase!, userId, requestId, { status: "completed", failure_reason: null });
    if (!finished) {
      respondInactive(response);
      return;
    }
    response.status(200).json({ payload: { request: { id: requestId, status: "completed" } } });
  } catch (error) {
    console.error("[data-export] export completion failed", { user_id: userId, request_id: requestId, error: loggableError(error) });
    respondServerError(response, "Failed to complete export request");
  }
});

router.post("/data-export-requests/:id/fail", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const requestId = String(request.params.id);
  if (!UUID_PATTERN.test(requestId)) {
    respondNotFound(response);
    return;
  }

  const reason = request.body?.payload?.reason;
  if (reason !== undefined && typeof reason !== "string") {
    respondBadRequest(response, "reason must be a string");
    return;
  }

  try {
    const failureReason = reason?.trim().slice(0, MAX_FAILURE_REASON_LENGTH) || null;
    const finished = await finishExportRequest(request.supabase!, userId, requestId, { status: "failed", failure_reason: failureReason });
    if (!finished) {
      respondInactive(response);
      return;
    }
    response.status(200).json({ payload: { request: { id: requestId, status: "failed" } } });
  } catch (error) {
    console.error("[data-export] export failure update failed", { user_id: userId, request_id: requestId, error: loggableError(error) });
    respondServerError(response, "Failed to update export request");
  }
});

export default router;
