import type { SupabaseClient } from "@supabase/supabase-js";
import { createAuthenticatedSupabaseClient } from "../../lib/supabase.js";
import { ACTIVE_REQUEST_STATUSES } from "../../lib/constants.js";

async function ensureProfile(
  userId: string,
  authenticatedSupabase: SupabaseClient,
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
  authenticatedSupabase: SupabaseClient,
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

// RLS only lets the owner update their own requests, so this must run as the signed-in user.
// A deletion that cannot be cancelled must stop sign-in rather than leave the account scheduled for removal.
async function cancelActiveDeletionRequests(
  userId: string,
  authenticatedSupabase: SupabaseClient,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_CANCEL_RETRIES; attempt++) {
    const { error } = await authenticatedSupabase
      .from("account_deletion_requests")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        metadata: { cancelled_by: "reauthentication" },
      })
      .eq("user_id", userId)
      .in("status", ACTIVE_REQUEST_STATUSES);

    if (!error) return;

    console.error("Failed to cancel active deletion requests", { user_id: userId, attempt, timestamp_utc: new Date().toISOString(), timestamp_ph: new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" }), code: error.code, message: error.message });

    if (attempt < MAX_CANCEL_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, CANCEL_RETRY_DELAY_MS));
    }
  }
  throw new Error("Failed to cancel active deletion requests");
}

export async function bootstrapAuthenticatedUser(
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

  await cancelActiveDeletionRequests(userId, authenticatedSupabase);

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
