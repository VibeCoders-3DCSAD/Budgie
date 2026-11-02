import { Router } from "express";
import type { Request, Response } from "express";
import {
  createAuthenticatedSupabaseClient,
  supabase,
} from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { AUTH_ERRORS } from "../lib/constants.js";
import { isStrongPassword, normalizeEmail } from "../lib/authValidation.js";

const router = Router();

async function ensureProfile(
  userId: string,
  authenticatedSupabase = supabase,
): Promise<void> {
  const { data: profile, error: profileError } = await authenticatedSupabase
    .from("profiles")
    .upsert({ user_id: userId }, { onConflict: "user_id" })
    .select("user_id")
    .single();

  if (profileError || !profile) {
    throw new Error("Failed to create profile");
  }
}

async function ensurePrivacySettings(
  userId: string,
  authenticatedSupabase = supabase,
): Promise<{ personalization_enabled: boolean } | null> {
  const { data: privacy, error: privacyError } = await authenticatedSupabase
    .from("user_privacy_settings")
    .upsert({ user_id: userId }, { onConflict: "user_id" })
    .select("personalization_enabled")
    .single();

  if (privacyError || !privacy) {
    return null;
  }

  return privacy;
}

const MAX_CANCEL_RETRIES = 3;
const CANCEL_RETRY_DELAY_MS = 500;

async function cancelActiveDeletionRequests(
  userId: string,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_CANCEL_RETRIES; attempt++) {
    const { error } = await supabase
      .from("account_deletion_requests")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        metadata: { cancelled_by: "reauthentication" },
      })
      .eq("user_id", userId)
      .in("status", ["requested", "processing"]);

    if (!error) return;

    console.error("Failed to cancel active deletion requests", { user_id: userId, attempt, timestamp_utc: new Date().toISOString(), timestamp_ph: new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" }), code: error.code, message: error.message });

    if (attempt < MAX_CANCEL_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, CANCEL_RETRY_DELAY_MS));
    }
  }
}

async function bootstrapAuthenticatedUser(
  userId: string,
  accessToken: string,
): Promise<{
  user: { id: string };
  onboarding: { status: string };
  privacy_settings: { personalization_enabled: boolean };
}> {
  const authenticatedSupabase = createAuthenticatedSupabaseClient(accessToken);
  await ensureProfile(userId, authenticatedSupabase);
  const privacy = await ensurePrivacySettings(userId, authenticatedSupabase);

  await cancelActiveDeletionRequests(userId);

  const { data: onboarding, error: onboardingError } = await authenticatedSupabase
    .from("onboarding_sessions")
    .select("status")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (onboardingError) {
    throw new Error("Failed to fetch onboarding status");
  }

  return {
    user: { id: userId },
    onboarding: {
      status: onboarding?.status ?? "in_progress",
    },
    privacy_settings: {
      personalization_enabled: privacy?.personalization_enabled ?? true,
    },
  };
}

router.post("/register", async (request: Request, response: Response) => {
  const { email, password, display_name } = request.body?.payload ?? {};
  const normalizedEmail = normalizeEmail(email);

  if (typeof email !== "string" || email.trim() === "") {
    response.status(400).json({
      error: "Bad Request",
      message: AUTH_ERRORS.email_required,
    });
    return;
  }

  if (!normalizedEmail) {
    response.status(400).json({ error: "Bad Request", message: AUTH_ERRORS.email_invalid });
    return;
  }

  if (typeof password !== "string" || password === "") {
    response.status(400).json({
      error: "Bad Request",
      message: AUTH_ERRORS.password_required,
    });
    return;
  }

  if (!isStrongPassword(password)) {
    response.status(400).json({ error: "Bad Request", message: AUTH_ERRORS.password_invalid });
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data:
        typeof display_name === "string" && display_name.trim() !== ""
          ? { display_name: display_name.trim() }
          : undefined,
        emailRedirectTo: process.env.AUTH_VERIFY_REDIRECT_URL ?? "odin://auth/verify",
    },
  });

  if (error) {
    if (error.status === 429) {
      response.status(429).json({
        error: "Too Many Requests",
        message: AUTH_ERRORS.too_many_requests,
      });
      return;
    }

    if (error.status === 409) {
      response.status(409).json({
        error: "Conflict",
        message: AUTH_ERRORS.conflict,
      });
      return;
    }

    response.status(500).json({
      error: "Internal Server Error",
      message: AUTH_ERRORS.registration_failed,
    });
    return;
  }

  response.status(201).json({
    payload: {
      user: { id: data.user?.id },
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      },
      activation: {
        email_confirmation_required: true,
        delivery: "email_link",
      },
    },
  });
});

router.post("/login", async (request: Request, response: Response) => {
  const { email, password } = request.body?.payload ?? {};
  const normalizedEmail = normalizeEmail(email);

  if (typeof email !== "string" || email.trim() === "") {
    response.status(400).json({
      error: "Bad Request",
      message: AUTH_ERRORS.email_required,
    });
    return;
  }

  if (!normalizedEmail) {
    response.status(400).json({ error: "Bad Request", message: AUTH_ERRORS.email_invalid });
    return;
  }

  if (typeof password !== "string" || password.trim() === "") {
    response.status(400).json({
      error: "Bad Request",
      message: AUTH_ERRORS.password_required,
    });
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error?.status === 429) {
    response.status(429).json({ error: "Too Many Requests", message: AUTH_ERRORS.too_many_requests });
    return;
  }

  if (error?.code === "email_not_confirmed") {
    response.status(401).json({ error: "Unauthorized", code: "email_unverified", message: AUTH_ERRORS.verification_required });
    return;
  }

  if (error || !data.user || !data.session?.access_token) {
    response.status(401).json({
      error: "Unauthorized",
      message: AUTH_ERRORS.unauthorized,
    });
    return;
  }

  let bootstrapPayload: Awaited<ReturnType<typeof bootstrapAuthenticatedUser>>;
  try {
    bootstrapPayload = await bootstrapAuthenticatedUser(
      data.user.id,
      data.session.access_token,
    );
  } catch {
    response.status(500).json({
      error: "Internal Server Error",
      message: AUTH_ERRORS.bootstrap_failed,
    });
    return;
  }

  response.status(200).json({
    payload: {
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
      ...bootstrapPayload,
    },
  });
});

router.post("/password-reset", async (request: Request, response: Response) => {
  const { email } = request.body?.payload ?? {};
  const normalizedEmail = normalizeEmail(email);

  if (typeof email !== "string" || email.trim() === "") {
    response.status(400).json({
      error: "Bad Request",
      message: AUTH_ERRORS.email_required,
    });
    return;
  }

  if (!normalizedEmail) {
    response.status(400).json({ error: "Bad Request", message: AUTH_ERRORS.email_invalid });
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: process.env.AUTH_REDIRECT_URL ?? "odin://auth/reset",
  });

  if (error) {
    if (error.status === 429) {
      response.status(429).json({
        error: "Too Many Requests",
        message: AUTH_ERRORS.too_many_requests,
      });
      return;
    }

    response.status(500).json({
      error: "Internal Server Error",
      message: AUTH_ERRORS.password_reset_failed,
    });
    return;
  }

  response.status(200).json({
    payload: { requested: true },
  });
});

router.post(
  "/password-update",
  requireAuth,
  async (request: AuthenticatedRequest, response: Response) => {
    const { password, refresh_token: refreshToken } = request.body?.payload ?? {};

    if (typeof password !== "string" || password === "") {
      response.status(400).json({
        error: "Bad Request",
        message: AUTH_ERRORS.new_password_required,
      });
      return;
    }

    if (!isStrongPassword(password)) {
      response.status(400).json({ error: "Bad Request", message: AUTH_ERRORS.password_invalid });
      return;
    }

    if (typeof refreshToken !== "string" || refreshToken.trim() === "") {
      response.status(400).json({
        error: "Bad Request",
        message: AUTH_ERRORS.refresh_token_required,
      });
      return;
    }

    const recoverySupabase = createAuthenticatedSupabaseClient(request.accessToken!);
    const { error: sessionError } = await recoverySupabase.auth.setSession({
      access_token: request.accessToken!,
      refresh_token: refreshToken.trim(),
    });

    if (sessionError) {
      response.status(401).json({
        error: "Unauthorized",
        message: AUTH_ERRORS.token_expired,
      });
      return;
    }

    const { error } = await recoverySupabase.auth.updateUser({
      password,
    });

    if (error) {
      response.status(500).json({
        error: "Internal Server Error",
        message: AUTH_ERRORS.password_update_failed,
      });
      return;
    }

    response.status(200).json({
      payload: { updated: true },
    });
  },
);

router.post(
  "/verification-resend",
  async (request: Request, response: Response) => {
    const email = normalizeEmail(request.body?.payload?.email);
    if (!email) {
      response.status(400).json({ error: "Bad Request", message: AUTH_ERRORS.email_invalid });
      return;
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: process.env.AUTH_VERIFY_REDIRECT_URL ?? "odin://auth/verify" },
    });

    if (error) {
      response.status(error.status === 429 ? 429 : 500).json({
        error: error.status === 429 ? "Too Many Requests" : "Internal Server Error",
        message: error.status === 429 ? AUTH_ERRORS.too_many_requests : AUTH_ERRORS.verification_resend_failed,
      });
      return;
    }

    response.status(200).json({ payload: { sent: true } });
  },
);

router.post(
  "/verify",
  requireAuth,
  async (request: AuthenticatedRequest, response: Response) => {
    const { data, error } = await supabase.auth.getUser(request.accessToken!);
    if (error || !data.user?.email_confirmed_at) {
      response.status(401).json({ error: "Unauthorized", message: AUTH_ERRORS.verification_required });
      return;
    }
    response.status(200).json({ payload: { verified: true, user_id: data.user.id } });
  },
);

router.post("/session", async (request: Request, response: Response) => {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    response.status(400).json({
      error: "Bad Request",
      message: AUTH_ERRORS.token_required,
    });
    return;
  }

  const token = authHeader.slice(7);

  if (!token) {
    response.status(400).json({
      error: "Bad Request",
      message: AUTH_ERRORS.token_required,
    });
    return;
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    response.status(401).json({
      error: "Unauthorized",
      message: AUTH_ERRORS.token_expired,
    });
    return;
  }

  if (!userData.user.email_confirmed_at) {
    response.status(401).json({
      error: "Unauthorized",
      code: "email_unverified",
      message: AUTH_ERRORS.verification_required,
    });
    return;
  }

  const userId = userData.user.id;
  let bootstrapPayload: Awaited<ReturnType<typeof bootstrapAuthenticatedUser>>;
  try {
    bootstrapPayload = await bootstrapAuthenticatedUser(userId, token);
  } catch {
    response.status(500).json({
      error: "Internal Server Error",
      message: AUTH_ERRORS.bootstrap_profile_failed,
    });
    return;
  }

  const verifiedAt = Date.now();
  response.status(200).json({
    payload: {
      ...bootstrapPayload,
      verified_at: new Date(verifiedAt).toISOString(),
      offline_access_expires_at: new Date(verifiedAt + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
});

router.post(
  "/logout",
  requireAuth,
  async (request: AuthenticatedRequest, response: Response) => {
    const { error } = await request.supabase!.auth.signOut();

    if (error) {
      response.status(500).json({
        error: "Internal Server Error",
        message: AUTH_ERRORS.logout_failed,
      });
      return;
    }

    response.status(200).json({
      payload: { logged_out: true },
    });
  },
);

export default router;
