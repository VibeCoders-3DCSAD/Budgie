export const SCHEDULED_PAYMENT_FIELDS = new Set(["name", "subcategory_id", "source_account_id", "amount_centavos", "frequency", "due_day_of_month", "due_second_day_of_month", "due_day_of_week", "due_month", "starts_on", "ends_on", "auto_post", "auto_post_from", "is_family_support", "is_dependent_support", "protected_by_default", "notes", "status"]);

export const SCHEDULED_PAYMENT_FREQUENCIES = ["daily", "weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "yearly", "once"];

export const SCHEDULED_PAYMENT_RECORD_FIELDS = new Set(["scheduled_payment_id", "transaction_id", "occurrence_date", "payment_date", "amount_centavos", "source", "notes"]);

export const SCHEDULED_PAYMENT_RECORD_SETTLEMENT_FIELDS = new Set(["settles_occurrence"]);

// Only a biller or remittance payment may be an uncategorized expense. Its client_mutation_id names the
// scheduled payment it pays (scheduledPaymentMutationId on the device), which must belong to the user.
export const BILLER_PAYMENT_MUTATION = /^scheduled-payment:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):/i;
