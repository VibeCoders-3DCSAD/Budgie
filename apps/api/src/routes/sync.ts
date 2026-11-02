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
  SYNCED_TABLES,
} from "../services/sync/syncService.js";

const SYNCED_CURSOR_TABLES = new Set<string>(SYNCED_TABLES);
const MAX_PUSH_OPERATIONS = 100;
const MAX_ID_LENGTH = 128;
const MAX_CHANGED_FIELDS = 50;
const MAX_PAYLOAD_KEYS = 100;
const MAX_PAYLOAD_BYTES = 256_000;
const MAX_DEVICE_ID_LENGTH = 128;
const isDeviceId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_DEVICE_ID_LENGTH && /^[a-zA-Z0-9._:-]+$/.test(value);

function isBoundedPayload(payload: Record<string, unknown>): boolean {
  if (Object.keys(payload).length > MAX_PAYLOAD_KEYS || JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) return false;
  const priorities = payload.priorities;
  return priorities === undefined || (Array.isArray(priorities) && priorities.length <= 100 && priorities.every((id) => typeof id === "string" && id.length <= MAX_ID_LENGTH));
}

function isPushOperation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const operation = value as Record<string, unknown>;
  return typeof operation.operation_id === "string" && operation.operation_id.length <= MAX_ID_LENGTH && typeof operation.entity === "string" && operation.entity.length <= MAX_ID_LENGTH
    && typeof operation.record_id === "string" && operation.record_id.length <= MAX_ID_LENGTH && ["create", "update", "delete"].includes(operation.operation_type as string)
    && (operation.base_version === null || typeof operation.base_version === "number")
    && Array.isArray(operation.changed_fields) && operation.changed_fields.length <= MAX_CHANGED_FIELDS && operation.changed_fields.every((field) => typeof field === "string" && field.length <= MAX_ID_LENGTH)
    && !!operation.payload && typeof operation.payload === "object" && !Array.isArray(operation.payload) && isBoundedPayload(operation.payload as Record<string, unknown>);
}

export function isCursorMap(value: unknown): value is Record<string, { ts: string; id: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([table, cursor]) => {
    if (!SYNCED_CURSOR_TABLES.has(table) || !cursor || typeof cursor !== "object") return false;
    const item = cursor as Record<string, unknown>;
    return typeof item.ts === "string" && !Number.isNaN(Date.parse(item.ts))
      && typeof item.id === "string" && (item.id === "" || /^[0-9a-f-]{8,}$/i.test(item.id));
  });
}

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

       if (!Array.isArray(operations) || operations.length === 0 || operations.length > MAX_PUSH_OPERATIONS || operations.some((operation) => !isPushOperation(operation))) {
        response.status(400).json({
          error: "Bad Request",
           message: `operations must contain 1-${MAX_PUSH_OPERATIONS} items`,
        });
        return;
      }

      const active = await isDeviceActive(supabase, userId, device_id);
      if (!active) {
        console.warn("[sync/push] device inactive", { userId, device_id });
        response.status(400).json({
          error: "Bad Request",
          message: "Device is not registered or has been deactivated",
        });
        return;
      }

      console.log("[sync/push] start", { userId, device_id, opCount: operations.length });

      const results = await pushOperations(supabase, userId, device_id, operations as never[]);

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
