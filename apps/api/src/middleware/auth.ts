import type { Request, Response, NextFunction } from "express";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  createAuthenticatedSupabaseClient,
  supabase,
} from "../lib/supabase.js";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  accessToken?: string;
  user?: User;
  supabase?: SupabaseClient;
}

// The token from an "Authorization: Bearer <token>" header, or undefined when it is missing or empty.
export function bearerToken(request: Request): string | undefined {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  return authHeader.slice(7) || undefined;
}

// True when the request carries a valid user session token. Machine-only routes use this to reject users.
export async function hasUserSession(request: Request): Promise<boolean> {
  const token = bearerToken(request);
  if (!token) return false;
  const { data } = await supabase.auth.getUser(token);
  return Boolean(data?.user);
}

export async function requireAuth(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearerToken(request);

  if (!token) {
    response.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid authorization header",
    });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    response.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired access token",
    });
    return;
  }

  request.userId = data.user.id;
  request.user = data.user;
  request.accessToken = token;
  request.supabase = createAuthenticatedSupabaseClient(token);
  next();
}
