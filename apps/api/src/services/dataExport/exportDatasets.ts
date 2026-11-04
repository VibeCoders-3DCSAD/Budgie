// What a data export contains, in file order. Each dataset reads one user-owned table and only the
// listed columns, so sync bookkeeping and internal metadata never leave the server.
export type ExportDataset = {
  name: string;
  table: string;
  columns: readonly string[];
  // Tables with a soft-delete flag export only rows that are not deleted.
  softDelete: boolean;
  // Built-in categories have no owner and are shared by every user; the user's transactions point at them.
  includeShared?: boolean;
};

export const EXPORT_DATASETS: readonly ExportDataset[] = [
  {
    name: "profile",
    table: "profiles",
    columns: ["id", "display_name", "lifecycle_status", "onboarding_completed_at", "created_at", "updated_at"],
    softDelete: false,
  },
  {
    name: "accounts",
    table: "financial_accounts",
    columns: ["id", "name", "kind", "status", "institution_name", "opening_balance_centavos", "current_balance_centavos", "opened_on", "archived_at", "created_at", "updated_at"],
    softDelete: true,
  },
  {
    name: "income_sources",
    table: "income_sources",
    columns: ["id", "name", "frequency", "expected_amount_centavos", "payday_day_of_month", "payday_second_day_of_month", "payday_day_of_week", "next_expected_date", "is_active", "destination_account_id", "subcategory_id", "notes", "created_at", "updated_at"],
    softDelete: true,
  },
  {
    name: "categories",
    table: "categories",
    includeShared: true,
    columns: ["id", "label", "classification", "is_system", "is_active", "updated_at"],
    softDelete: true,
  },
  {
    name: "subcategories",
    table: "subcategories",
    includeShared: true,
    columns: ["id", "category_id", "kind", "label", "is_system", "is_active", "updated_at"],
    softDelete: true,
  },
  {
    name: "transactions",
    table: "transactions",
    columns: ["id", "transaction_type", "status", "entry_source", "transaction_date", "posted_at", "amount_centavos", "category_id", "subcategory_id", "source_account_id", "destination_account_id", "source_savings_goal_id", "destination_savings_goal_id", "merchant_name", "counterparty_name", "notes", "created_at", "updated_at"],
    softDelete: true,
  },
  {
    name: "savings_goals",
    table: "savings_goals",
    columns: ["id", "name", "goal_type", "status", "is_emergency_fund", "target_amount_centavos", "current_amount_centavos", "starting_amount_centavos", "target_date", "projected_completion_date", "achieved_at", "linked_account_id", "notes", "created_at", "updated_at"],
    softDelete: true,
  },
  {
    name: "savings_contributions",
    table: "savings_goal_activities",
    columns: ["id", "savings_goal_id", "transaction_id", "activity_kind", "amount_centavos", "activity_date", "notes", "created_at"],
    softDelete: true,
  },
  {
    name: "debts",
    table: "debt_accounts",
    columns: ["id", "name", "lender_name", "status", "original_balance_centavos", "current_balance_centavos", "annual_interest_rate_bps", "minimum_payment_centavos", "payment_frequency", "due_day_of_month", "next_due_date", "target_payoff_date", "paid_off_at", "notes", "created_at", "updated_at"],
    softDelete: true,
  },
  {
    name: "debt_payments",
    table: "debt_payments",
    columns: ["id", "debt_account_id", "transaction_id", "payment_date", "amount_centavos", "principal_centavos", "interest_centavos", "notes", "created_at"],
    softDelete: true,
  },
  {
    name: "billers_and_remittances",
    table: "scheduled_payments",
    columns: ["id", "name", "subcategory_id", "source_account_id", "amount_centavos", "frequency", "due_day_of_month", "due_second_day_of_month", "due_day_of_week", "due_month", "starts_on", "ends_on", "auto_post", "status", "notes", "created_at", "updated_at"],
    softDelete: true,
  },
  {
    name: "biller_payments",
    table: "scheduled_payment_records",
    columns: ["id", "scheduled_payment_id", "transaction_id", "occurrence_date", "payment_date", "amount_centavos", "source", "notes", "created_at"],
    softDelete: true,
  },
  {
    name: "financial_plans",
    table: "financial_plans",
    columns: ["id", "period_start", "period_end", "status", "available_funds_centavos", "required_funds_centavos", "shortfall_centavos", "forecast_total_centavos", "created_at", "updated_at"],
    softDelete: true,
  },
  {
    name: "consents",
    table: "user_consents",
    columns: ["id", "consent_kind", "status", "version", "recorded_at", "withdrawn_at"],
    softDelete: false,
  },
];

export const EXPORT_DATASET_NAMES = EXPORT_DATASETS.map((dataset) => dataset.name);

export function findExportDataset(name: unknown): ExportDataset | undefined {
  return EXPORT_DATASETS.find((dataset) => dataset.name === name);
}
