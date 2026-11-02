export const ALERT_PREFERENCE_CREATE_FIELDS = new Set(["category", "mode", "in_app_enabled", "push_enabled", "duplicate_cooldown_hours", "snoozed_until"]);

export const ALERT_PREFERENCE_UPDATE_FIELDS = new Set(["mode", "in_app_enabled", "push_enabled", "duplicate_cooldown_hours", "snoozed_until"]);

export const ANOMALY_WHITELIST_CREATE_FIELDS = new Set(["merchant_name", "subcategory_id", "base_amount_centavos", "tolerance_bps", "allow_any_amount", "status", "notes"]);

export const ANOMALY_WHITELIST_UPDATE_FIELDS = new Set(["status", "notes"]);

export const ALERT_SUPPRESSION_CREATE_FIELDS = new Set(["category", "source_type", "status", "merchant_name", "subcategory_id", "category_id", "amount_center_centavos", "amount_tolerance_bps", "starts_at", "ends_at", "reason", "metadata"]);

export const ALERT_SUPPRESSION_UPDATE_FIELDS = new Set(["status", "ends_at", "reason"]);

export const ANOMALY_EVALUATION_CREATE_FIELDS = new Set(["transaction_id", "subcategory_id", "amount_centavos", "usable_history_count", "usual_spending_centavos", "lower_bound_centavos", "upper_bound_centavos", "severity", "model_version", "evaluated_at"]);

export const ANOMALY_EVALUATION_UPDATE_FIELDS = new Set(["recurrence", "confirmed_recurring_at", "recurrence_months"]);

export const ANOMALY_RECURRENCES = new Set(["one_time", "frequent", "yearly"]);
