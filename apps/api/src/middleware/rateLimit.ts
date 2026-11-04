import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./auth.js";

type RateLimitOptions = {
  // Distinguishes limiters so each route keeps its own counts.
  name: string;
  windowMs: number;
  max: number;
  now?: () => number;
};

type Window = { startedAt: number; count: number };

// A fixed-window limit per authenticated user, held in this process's memory. Mount it after requireAuth.
// Rejected requests get 429 with Retry-After in seconds, so clients can wait exactly as long as needed.
export function rateLimitPerUser({ name, windowMs, max, now = Date.now }: RateLimitOptions) {
  const windows = new Map<string, Window>();

  return function rateLimit(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
    const key = `${name}:${request.userId}`;
    const time = now();
    let window = windows.get(key);
    if (!window || time - window.startedAt >= windowMs) {
      pruneExpired(windows, time, windowMs);
      window = { startedAt: time, count: 0 };
      windows.set(key, window);
    }

    window.count += 1;
    const resetSeconds = Math.max(1, Math.ceil((window.startedAt + windowMs - time) / 1000));
    response.setHeader("RateLimit-Limit", String(max));
    response.setHeader("RateLimit-Remaining", String(Math.max(0, max - window.count)));
    response.setHeader("RateLimit-Reset", String(resetSeconds));

    if (window.count > max) {
      response.setHeader("Retry-After", String(resetSeconds));
      response.status(429).json({ error: "Too Many Requests", message: "Too many requests. Wait a moment and try again." });
      return;
    }
    next();
  };
}

// Keeps the map from growing with users who stopped sending requests.
function pruneExpired(windows: Map<string, Window>, time: number, windowMs: number): void {
  for (const [key, window] of windows) {
    if (time - window.startedAt >= windowMs) windows.delete(key);
  }
}
