import type { Response, NextFunction } from "express";
import { requireAuth, type AuthenticatedRequest } from "./auth.js";

const API_PREFIX = "/odin/api";

// The only API routes reachable without a user session. Each one checks its own credentials:
// the auth routes take an email, password or token in the body, and recurring/run takes the cron secret.
const PUBLIC_API_ROUTES: ReadonlySet<string> = new Set([
  "POST /odin/api/auth/register",
  "POST /odin/api/auth/login",
  "POST /odin/api/auth/password-reset",
  "POST /odin/api/auth/verification-resend",
  "POST /odin/api/auth/session",
  "POST /odin/api/recurring/run",
]);

function routeKey(request: AuthenticatedRequest): string {
  // Express matches routes case-insensitively and ignores a trailing slash, so normalise the same way.
  const path = request.path.toLowerCase().replace(/\/+$/, "");
  return `${request.method} ${path}`;
}

function isApiPath(path: string): boolean {
  return path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
}

// Runs before the body parser so a request without a valid session is rejected before its body is read.
// Routes keep their own requireAuth, which reuses this result instead of checking the token again.
export function authenticateBeforeBody(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
  if (!isApiPath(request.path.toLowerCase())) {
    next();
    return;
  }
  if (PUBLIC_API_ROUTES.has(routeKey(request))) {
    next();
    return;
  }
  void requireAuth(request, response, next).catch(next);
}
