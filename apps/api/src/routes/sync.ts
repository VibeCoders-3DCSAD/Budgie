import { Router } from "express";
import type { Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import {
  pushOperations,
  pullChanges,
  countRemainingChanges,
  registerDevice,
  isDeviceActive,
} from "../services/sync/syncService.js";
import { hasOperationId, isCursorMap, isDeviceId, isPushOperation, MAX_PUSH_OPERATIONS } from "../services/sync/syncRequestValidation.js";
import { DEVICE_NOT_REGISTERED, SYNC_REJECTION_REASONS } from "@odin/sync-config";

const router = Router();

router.post(
  "/push",
  requireAuth,
  async (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    try {
      const userId = request.userId!;
      const supabase = request.supabase!;

      const payload = request.body?.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        response.status(400).json({
          error: "Bad Request",
          message: "Request body must have a payload object",
        });
        return;
      }

      const { device_id, operations } = payload as {
        device_id?: string;
        operations?: unknown[];
      };

       if (!isDeviceId(device_id)) {
        response.status(400).json({
          error: "Bad Request",
          message: "device_id is required",
        });
        return;
      }

      if (!Array.isArray(operations) || operations.length === 0 || operations.length > MAX_PUSH_OPERATIONS || operations.some((operation) => !hasOperationId(operation))) {
        response.status(400).json({
          error: "Bad Request",
          message: `operations must contain 1-${MAX_PUSH_OPERATIONS} items, each with an operation_id`,
        });
        return;
      }

      const active = await isDeviceActive(supabase, userId, device_id);
      if (!active) {
        console.warn("[sync/push] device inactive", { userId, device_id });
        response.status(400).json({
          error: "Bad Request",
          code: DEVICE_NOT_REGISTERED,
          message: "Device is not registered or has been deactivated",
        });
        return;
      }

      console.log("[sync/push] start", { userId, device_id, opCount: operations.length });

      // A malformed operation is rejected on its own, so the valid ones sent with it still apply
      // instead of the whole batch failing and every operation in it spending a retry.
      const validOperations = operations.filter(isPushOperation);
      const invalidResults = operations
        .filter((operation) => !isPushOperation(operation))
        .map((operation) => ({
          operation_id: (operation as { operation_id: string }).operation_id,
          status: "rejected" as const,
          reason: SYNC_REJECTION_REASONS.invalidOperation,
        }));
      if (invalidResults.length > 0) {
        console.warn("[sync/push] invalid operations", { userId, device_id, operation_ids: invalidResults.map((result) => result.operation_id) });
      }

      const appliedResults = validOperations.length > 0
        ? await pushOperations(supabase, userId, device_id, validOperations as never[])
        : [];
      const results = [...invalidResults, ...appliedResults];

       const summary = { applied: 0, rejected: 0, conflict: 0, duplicate: 0 };
      for (const r of results) summary[r.status]++;

      console.log("[sync/push] done", { userId, device_id, ...summary });

      response.status(200).json({ payload: { results } });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/pull",
  requireAuth,
  async (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    try {
      const userId = request.userId!;
      const supabase = request.supabase!;

      let cursors: Record<string, { ts: string; id: string }> = {};
      const cursorsParam = request.query.cursors;
      if (typeof cursorsParam === "string") {
        try {
          const parsed: unknown = JSON.parse(cursorsParam);
          if (isCursorMap(parsed)) cursors = parsed;
        } catch { /* keep empty */ }
      }

      console.log("[sync/pull] start", { userId, cursorTables: Object.keys(cursors) });

      // Counted from the request cursors, before this page advances them, so the total includes this page.
      // Both read from the same cursors, so they run together to get the first page out sooner.
      const [remaining, result] = await Promise.all([
        request.query.include_remaining === "1" ? countRemainingChanges(supabase, userId, cursors) : undefined,
        pullChanges(supabase, userId, cursors),
      ]);

      const changeSummary: Record<string, number> = {};
      for (const [table, rows] of Object.entries(result.changes)) {
        changeSummary[table] = rows.length;
      }

      console.log("[sync/pull] done", { userId, ...changeSummary });

      response.set("Cache-Control", "no-store");
      response.status(200).json({ payload: remaining ? { ...result, remaining } : result });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/register-device",
  requireAuth,
  async (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    try {
      const userId = request.userId!;
      const supabase = request.supabase!;

      const payload = request.body?.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        response.status(400).json({
          error: "Bad Request",
          message: "Request body must have a payload object",
        });
        return;
      }

      const deviceId = payload.device_id;
       if (!isDeviceId(deviceId)) {
        response.status(400).json({
          error: "Bad Request",
          message: "device_id is required",
        });
        return;
      }

      await registerDevice(supabase, userId, deviceId);

      response.status(200).json({
        payload: { status: "registered", device_id: deviceId },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
