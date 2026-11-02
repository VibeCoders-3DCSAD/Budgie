export const DEBT_ACCOUNT_FIELDS = new Set([
  "linked_account_id", "name", "lender_name", "preset_key", "status",
  "original_balance_centavos", "current_balance_centavos", "annual_interest_rate_bps",
  "minimum_payment_centavos", "allows_extra_payments", "payment_frequency", "next_due_date", "maturity_date",
  "target_payoff_date", "interest_period", "interest_method", "preset_data", "notes",
]);

export const DEBT_PAYMENT_FIELDS = new Set(["debt_account_id", "transaction_id", "source", "payment_date", "amount_centavos", "principal_centavos", "interest_centavos", "notes", "linked_transaction_type", "linked_source_account_id", "linked_subcategory_id"]);

export const DEBT_STRATEGY_FIELDS = new Set(["strategy"]);

export const DEBT_PRIORITY_FIELDS = new Set(["priorities"]);

export const DEBT_ACCOUNT_TYPES = ["personal_loan", "salary_loan", "multipurpose_loan", "business_loan", "auto_loan", "custom_debt"];
