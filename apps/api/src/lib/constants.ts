export const AUTH_ERRORS = {
  unauthorized: "Invalid email or password.",
  too_many_requests: "Too many attempts. Please wait and try again.",
  conflict: "An account with this email already exists.",
  token_expired: "Invalid or expired access token.",
  token_required: "Authorization header is required.",
  refresh_token_required: "Refresh token is required.",
  email_required: "Email is required.",
  email_invalid: "Enter a valid email address.",
  password_required: "Password is required.",
  password_invalid: "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.",
  new_password_required: "New password is required.",
  registration_failed: "Registration failed. Please try again.",
  bootstrap_failed: "Failed to bootstrap user session.",
  bootstrap_profile_failed: "Failed to bootstrap user profile.",
  password_reset_failed: "Password reset request failed. Please try again.",
  password_update_failed: "Password update failed.",
  verification_resend_failed: "Verification email could not be sent. Please try again.",
  verification_required: "Verify your email first, then sign in.",
  logout_failed: "Logout failed.",
} as const;

export const VALID_CONSENT_KINDS = [
  "data_collection",
  "personalization",
  "model_training",
  "research_evaluation",
  "notifications",
  "terms",
  "advisory_disclaimer",
];

export const VALID_CONSENT_STATUSES = ["granted", "withdrawn"];

export const ONBOARDING_ERRORS = {
  session_not_found: "Onboarding session not found.",
  session_not_in_progress: "Session is not in progress.",
  session_create_failed: "Failed to create onboarding session.",
  session_update_failed: "Failed to update onboarding session.",
  session_fetch_failed: "Failed to fetch onboarding sessions.",
  submit_failed: "Failed to submit onboarding session.",
  submit_not_confirmed: "You must confirm data use before submitting.",
} as const;

export const RECURRING_ERRORS = {
  cron_secret_mismatch: "Invalid cron secret.",
  user_session_rejected: "User sessions are not allowed on this endpoint. Use the cron secret.",
  no_cron_secret: "RECURRING_CRON_SECRET is not configured.",
} as const;

// Deletion and data-export requests in these statuses are still open.
export const ACTIVE_REQUEST_STATUSES = ["requested", "processing"];
