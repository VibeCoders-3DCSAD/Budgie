export const AUTH_ERRORS = {
  bad_request: "Invalid request. Check your input and try again.",
  unauthorized: "Invalid email or password.",
  email_not_verified: "Verify your email first, then sign in.",
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
  display_name_optional: "",
  registration_failed: "Registration failed. Please try again.",
  bootstrap_failed: "Failed to bootstrap user session.",
  bootstrap_profile_failed: "Failed to bootstrap user profile.",
  password_reset_failed: "Password reset request failed. Please try again.",
  password_update_failed: "Password update failed.",
  verification_resend_failed: "Verification email could not be sent. Please try again.",
  verification_required: "Verify your email first, then sign in.",
  verification_complete: "Email verification completed.",
  logout_failed: "Logout failed.",
  session_failed: "Failed to restore your session.",
  generic: "Something went wrong. Please try again.",
} as const;

export const VALID_METRO_MANILA_PRESENCE = [
  "lives_in_metro_manila",
  "works_in_metro_manila",
  "lives_and_works_in_metro_manila",
];

export const VALID_EMPLOYMENT_CLASSIFICATIONS = [
  "full_time_employee",
  "part_time_employee",
  "self_employed",
  "freelancer",
  "business_owner",
  "entrepreneur",
  "contractual_project_based",
  "gig_worker",
  "other",
];

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

export const VALID_REQUEST_STATUSES = [
  "requested",
  "processing",
  "available",
  "completed",
  "failed",
  "expired",
  "cancelled",
];

export const ONBOARDING_ERRORS = {
  session_not_found: "Onboarding session not found.",
  session_not_in_progress: "Session is not in progress.",
  session_belongs_to_another_user: "Session does not belong to the authenticated user.",
  session_already_submitted: "Session has already been submitted.",
  session_create_failed: "Failed to create onboarding session.",
  session_update_failed: "Failed to update onboarding session.",
  session_fetch_failed: "Failed to fetch onboarding sessions.",
  no_active_session: "No active onboarding session found.",
  submit_failed: "Failed to submit onboarding session.",
  submit_not_confirmed: "You must confirm data use before submitting.",
  eligibility_incomplete: "Your eligibility profile must be complete before submitting.",
} as const;

export const ONBOARDING_STATUSES = [
  "not_started",
  "in_progress",
  "submitted",
  "abandoned",
  "superseded",
] as const;

export const FINANCIAL_PROFILE_LABELS = [
  "STABLE_FLEXIBLE_TOLERANT",
  "STABLE_FLEXIBLE_AT_RISK",
  "STABLE_OBLIGATED_TOLERANT",
  "STABLE_OBLIGATED_AT_RISK",
  "VARIABLE_FLEXIBLE_TOLERANT",
  "VARIABLE_FLEXIBLE_AT_RISK",
  "VARIABLE_OBLIGATED_TOLERANT",
  "VARIABLE_OBLIGATED_AT_RISK",
] as const;

export const INCOME_PATTERNS = ["no_current_income", "predictable_income", "variable_income"] as const;
export const OBLIGATION_LOADS = ["no_income_with_obligations", "no_income_without_obligations", "low", "medium", "high"] as const;
export const EMERGENCY_RUNWAYS = ["less_than_1_month", "1_to_3_months", "3_to_6_months", "6_plus_months"] as const;

export const PROFILE_ASSESSMENT_STATUSES = [
  "queued",
  "running",
  "suggested",
  "confirmed",
  "rejected",
  "failed",
  "expired",
] as const;

export const PROFILE_EVENT_ACTIONS = [
  "assessment_requested",
  "assessment_generated",
  "change_suggested",
  "confirmed",
  "rejected",
  "manual_override",
  "activated",
  "deactivated",
] as const;

export const PROFILE_ASSESSMENT_METHODS = [
  "manual",
  "questionnaire",
  "cold_start",
  "standard",
] as const;

export const PROFILE_ERRORS = {
  assignment_not_found: "Assignment not found.",
  confirmation_required: "You must confirm before proceeding.",
  select_failed: "Failed to select profile.",
  confirm_failed: "Failed to confirm assignment.",
  reject_failed: "Failed to reject assignment.",
  reject_reason_required: "Override reason is required.",
  fetch_failed: "Failed to fetch profile assignment.",
  invalid_assignment_id: "Invalid assignment ID format.",
  invalid_profile_label: `Invalid profile label. Must be one of: ${FINANCIAL_PROFILE_LABELS.join(", ")}.`,
  reassess_failed: "Failed to request reassessment.",
} as const;
