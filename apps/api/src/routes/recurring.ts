import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "node:crypto";
import { hasUserSession, requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { runEngine } from "../services/recurring/recurringService.js";
import { RECURRING_ERRORS } from "../lib/constants.js";

const router = Router();

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function validateCronSecret(
  cronSecret: string | string[] | undefined,
  configuredSecret: string,
): boolean {
  const raw = Array.isArray(cronSecret) ? cronSecret[0] : cronSecret;
  if (!raw) return false;
  return timingSafeEqual(raw, configuredSecret);
}

router.post("/run", async (request: Request, response: Response) => {
  const configuredSecret = process.env.RECURRING_CRON_SECRET;

  if (!configuredSecret) {
    response.status(500).json({
      error: "Internal Server Error",
      message: RECURRING_ERRORS.no_cron_secret,
    });
    return;
  }

  if (await hasUserSession(request)) {
    response.status(403).json({
      error: "Forbidden",
      message: RECURRING_ERRORS.user_session_rejected,
    });
    return;
  }

  if (!validateCronSecret(request.headers["x-cron-secret"], configuredSecret)) {
    response.status(403).json({
      error: "Forbidden",
      message: RECURRING_ERRORS.cron_secret_mismatch,
    });
    return;
  }

  const { as_of, limit } = request.body?.payload ?? {};

  try {
    const result = await runEngine(
      typeof as_of === "string" && as_of.trim() !== "" ? as_of.trim() : undefined,
      typeof limit === "number" && limit > 0 ? Math.floor(limit) : undefined,
    );

    response.status(200).json({ payload: result });
  } catch (error) {
    console.error("Recurring engine run failed", {
      operation: "recurring_engine_run",
      method: request.method,
      route: request.originalUrl,
      request_id: request.header("x-request-id")?.slice(0, 128) ?? null,
      as_of: typeof as_of === "string" ? as_of.slice(0, 32) : null,
      limit: typeof limit === "number" ? limit : null,
      error,
    });
    response.status(500).json({
      error: "Internal Server Error",
      message: "Failed to run recurring transaction engine.",
    });
  }
});

router.post("/run/me", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  try {
    const result = await runEngine(undefined, undefined, userId);

    response.status(200).json({ payload: result });
  } catch (error) {
    console.error("Recurring engine run/me failed", {
      operation: "recurring_engine_run_me",
      method: request.method,
      route: request.originalUrl,
      request_id: request.header("x-request-id")?.slice(0, 128) ?? null,
      user_id: userId,
      error,
    });
    response.status(500).json({
      error: "Internal Server Error",
      message: "Failed to run recurring transaction engine.",
    });
  }
});

export default router;
