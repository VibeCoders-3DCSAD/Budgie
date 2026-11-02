export const TRANSACTION_CREATE_FIELDS = new Set([
  "savings_goal_contribution",
  "savings_goal_withdrawals",
  "transaction_type",
  "transaction_date",
  "credit_card_posting_date",
  "amount_centavos",
  "category_id",
  "subcategory_id",
  "source_account_id",
  "destination_account_id",
  "merchant_name",
  "counterparty_name",
  "notes",
  "entry_source",
  "recurring_template_id",
  "client_mutation_id",
]);

export const TRANSACTION_UPDATE_FIELDS = new Set([
  "savings_goal_contribution",
  "savings_goal_withdrawals",
  "amount_centavos",
  "category_id",
  "subcategory_id",
  "source_account_id",
  "destination_account_id",
  "transaction_date",
  "credit_card_posting_date",
  "merchant_name",
  "counterparty_name",
  "notes",
]);

export const VALID_TRANSACTION_TYPES = ["income", "expense", "transfer"];

export const RECURRING_TEMPLATE_FIELDS = new Set([
  "transaction_type", "name", "amount_centavos", "frequency", "interval_count",
  "day_of_month", "second_day_of_month", "day_of_week",
  "starts_on", "ends_on", "subcategory_id", "source_account_id", "destination_account_id", "notes",
]);

export const RECURRING_TEMPLATE_UPDATE_FIELDS = new Set(
  [...RECURRING_TEMPLATE_FIELDS].filter((field) => field !== "transaction_type"),
);

export const RECURRING_OCCURRENCE_FIELDS = new Set([
  "recurring_template_id", "scheduled_date", "generated_transaction_id",
]);

export const RECURRING_FREQUENCIES = ["daily", "weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "yearly", "custom"];
