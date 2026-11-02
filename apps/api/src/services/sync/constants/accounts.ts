export const FINANCIAL_ACCOUNT_CREATE_FIELDS = new Set([
  "name",
  "kind",
  "opening_balance_centavos",
  "include_in_dashboard_balance",
  "institution_name",
  "opened_on",
  "sort_order",
]);

export const FINANCIAL_ACCOUNT_UPDATE_FIELDS = new Set([
  "name",
  "status",
  "opening_balance_centavos",
  "current_balance_centavos",
  "include_in_dashboard_balance",
  "institution_name",
  "opened_on",
  "archived_at",
  "sort_order",
]);

export const SAVINGS_ACCOUNT_DETAIL_FIELDS = new Set([
  "interest_reference",
  "account_type", "interest_rate_bps", "minimum_balance_centavos",
  "base_interest_rate_bps", "effective_interest_rate_bps", "interest_conditions", "higher_rate_eligible",
  "boosted_interest_rate_bps", "interest_calculation_basis", "interest_credit_frequency",
  "maximum_eligible_balance_centavos", "balance_tiers", "required_deposit_centavos",
  "required_deposit_frequency", "required_transaction_count", "required_transaction_period",
  "direct_deposit_threshold_centavos", "qualification_period", "promotional_interest_rate_bps",
  "promotion_start_date", "promotion_end_date",
  "principal_centavos", "maturity_date", "term_months", "early_withdrawal_rule",
  "planned_contribution_amount_centavos", "contribution_frequency", "contribution_interval_count",
  "contribution_day_of_month", "contribution_second_day_of_month", "contribution_day_of_week",
  "custom_interval_days", "next_contribution_date",
]);

export const VALID_ACCOUNT_KINDS = ["cash", "bank", "e_wallet", "savings", "credit_card", "other"];
