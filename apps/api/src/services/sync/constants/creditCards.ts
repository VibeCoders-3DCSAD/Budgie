export const CREDIT_CARD_CYCLE_CREATE_FIELDS = new Set([
  "account_id", "cycle_start_date", "cutoff_date",
]);

export const CREDIT_CARD_CYCLE_FIELDS = new Set([
  "account_id", "cycle_start_date", "cutoff_date", "statement_date",
]);

export const CREDIT_CARD_STATEMENT_CREATE_FIELDS = new Set([
  "cycle_id", "statement_date", "statement_balance_centavos", "minimum_due_centavos",
  "finance_charge_centavos", "due_date",
]);

export const CREDIT_CARD_STATEMENT_UPDATE_FIELDS = new Set([
  "statement_date", "statement_balance_centavos", "minimum_due_centavos",
  "finance_charge_centavos", "due_date",
]);

export const CREDIT_CARD_PAYMENT_CREATE_FIELDS = new Set([
  "cycle_id", "statement_id", "transaction_id", "amount_centavos", "payment_date",
  "source_account_id", "notes", "client_mutation_id", "forecast_recorded_at",
]);

export const CREDIT_CARD_PAYMENT_UPDATE_FIELDS = new Set([
  "amount_centavos", "payment_date", "source_account_id", "notes",
]);

export const CREDIT_CARD_DETAILS_CREATE_FIELDS = new Set([
  "account_id", "issuer", "credit_limit_centavos", "available_credit_centavos",
  "cutoff_day", "statement_day", "notes", "billing_cycle_days", "alert_threshold_percent", "allows_extra_payments",
  "reconciled_available_credit_centavos", "pre_reconciliation_available_credit_centavos", "available_credit_reconciled_at",
]);

export const CREDIT_CARD_DETAILS_UPDATE_FIELDS = new Set([
  "account_id", "issuer", "credit_limit_centavos", "available_credit_centavos", "cutoff_day", "statement_day",
  "notes", "billing_cycle_days", "alert_threshold_percent", "allows_extra_payments", "reconciled_available_credit_centavos", "pre_reconciliation_available_credit_centavos", "available_credit_reconciled_at",
]);

export const CREDIT_CARD_REPAYMENT_PREFERENCE_FIELDS = new Set([
  "account_id", "strategy", "custom_amount_centavos", "percentage_bps",
]);

export const CREDIT_CARD_INSTALLMENT_CREATE_FIELDS = new Set([
  "account_id", "transaction_id", "description", "original_principal_centavos",
  "remaining_principal_centavos", "term_months", "remaining_months", "monthly_amortization_centavos",
  "interest_rate_bps", "interest_type", "settlement_status",
]);

export const CREDIT_CARD_SETTLEMENT_FIELDS = new Set(["installment_id", "settlement_date", "remaining_principal_centavos", "settlement_amount_centavos", "pretermination_fee_centavos", "status"]);

export const CREDIT_CARD_STATEMENT_STRATEGY_FIELDS = new Set(["statement_id", "strategy", "custom_amount_centavos", "percentage_bps"]);

export const CREDIT_CARD_TRANSACTION_FIELDS = new Set([
  "transaction_id", "account_id", "cycle_id", "purchase_type", "installment_id", "client_mutation_id", "applied_credit_centavos", "forecast_recorded_at",
]);
