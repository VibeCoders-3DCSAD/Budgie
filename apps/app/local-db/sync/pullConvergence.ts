import * as SQLite from "expo-sqlite";
import { clearFinancialPlanChildren, restoreFinancialPlanChildren } from "./financialPlanDocuments";

type PullRow = Record<string, unknown>;

export interface PullDb {
  getFirstAsync<T>(sql: string, ...params: SQLite.SQLiteBindValue[]): Promise<T | null>;
  runAsync(sql: string, ...params: SQLite.SQLiteBindValue[]): Promise<SQLite.SQLiteRunResult>;
}

export const SYNCED_TABLES = [
  "categories",
  "subcategories",
  "financial_accounts",
  "savings_account_details",
  "credit_card_details",
  "credit_card_repayment_preferences",
  "transactions",
  "recurring_transaction_templates",
  "recurring_transaction_occurrences",
  "income_sources",
  "financial_plans",
  "credit_card_cycles",
  "credit_card_installments",
  "credit_card_transactions",
  "credit_card_statements",
  "credit_card_payments",
  "debt_accounts",
  "debt_payments",
  "debt_strategy_preferences",
  "user_debt_priorities",
  "credit_card_settlements",
  "credit_card_statement_strategies",
  "alert_notification_preferences",
  "anomaly_whitelist_rules",
  "alert_suppression_rules",
  "anomaly_evaluations",
  "savings_goals",
  "savings_goal_activities",
  "scheduled_payments",
  "scheduled_payment_records",
  "savings_allocation_preferences",
] as const;

const LOCAL_COLUMNS: Record<string, Set<string>> = {
  categories: new Set([
    "id", "user_id", "slug", "label", "short_label",
    "description", "classification", "icon_key", "color_hex", "is_system", "is_filipino_context", "minimum_amount_centavos", "always_in_budget", "fixed_amount_centavos", "sort_order",
    "is_active", "metadata", "version", "deleted",
    "created_at", "updated_at", "last_synced_at",
  ]),
  subcategories: new Set([
    "id", "user_id", "category_id", "slug", "kind", "label", "short_label",
    "description", "icon_key", "color_hex", "is_system", "is_filipino_context", "is_protected", "minimum_amount_centavos", "always_in_budget", "fixed_amount_centavos",
    "sort_order", "is_active", "metadata", "version", "deleted",
    "created_at", "updated_at", "last_synced_at",
  ]),
  financial_accounts: new Set([
    "id", "user_id", "name", "kind", "status", "opening_balance_centavos",
    "current_balance_centavos",
    "include_in_dashboard_balance", "institution_name", "opened_on",
    "archived_at", "deleted_at", "sort_order", "metadata", "version",
    "deleted", "created_at", "updated_at", "last_synced_at",
  ]),
  savings_account_details: new Set([
    "account_id", "user_id", "account_type", "interest_rate_bps", "minimum_balance_centavos",
    "base_interest_rate_bps", "effective_interest_rate_bps", "interest_conditions", "higher_rate_eligible", "boosted_interest_rate_bps", "interest_calculation_basis", "interest_credit_frequency", "maximum_eligible_balance_centavos", "balance_tiers_json", "interest_reference_json", "required_deposit_centavos", "required_deposit_frequency", "required_transaction_count", "required_transaction_period", "direct_deposit_threshold_centavos", "qualification_period", "promotional_interest_rate_bps", "promotion_start_date", "promotion_end_date", "principal_centavos",
    "maturity_date", "term_months", "early_withdrawal_rule", "planned_contribution_amount_centavos",
    "contribution_frequency", "contribution_interval_count", "contribution_day_of_month",
    "contribution_second_day_of_month", "contribution_day_of_week", "custom_interval_days",
    "next_contribution_date", "version", "deleted", "created_at",
    "updated_at", "last_synced_at",
  ]),
  credit_card_details: new Set([
    "account_id", "user_id", "issuer", "credit_limit_centavos", "available_credit_centavos", "reconciled_available_credit_centavos", "pre_reconciliation_available_credit_centavos", "available_credit_reconciled_at",
    "cutoff_day", "statement_day", "notes", "billing_cycle_days", "alert_threshold_percent", "allows_extra_payments",
    "version", "deleted", "created_at", "updated_at", "last_synced_at",
  ]),
  credit_card_repayment_preferences: new Set([
    "account_id", "user_id", "strategy", "custom_amount_centavos", "percentage_bps",
    "version", "deleted", "created_at", "updated_at", "last_synced_at",
  ]),
  income_sources: new Set([
    "id", "user_id", "name", "frequency", "expected_amount_centavos",
    "payday_day_of_month", "payday_second_day_of_month", "payday_day_of_week", "next_expected_date",
    "destination_account_id", "subcategory_id", "recurring_template_id",
    "is_active", "notes", "metadata", "version",
    "deleted", "created_at", "updated_at", "last_synced_at",
  ]),
  transactions: new Set([
    "id", "user_id", "transaction_type", "status", "entry_source",
    "transaction_date", "posted_at", "credit_card_posting_date", "amount_centavos",
    "subcategory_id", "source_account_id", "destination_account_id", "source_savings_goal_id", "destination_savings_goal_id",
    "recurring_template_id", "merchant_name", "counterparty_name",
    "notes", "client_mutation_id", "metadata", "version", "deleted",
    "created_at", "updated_at", "last_synced_at",
  ]),
  recurring_transaction_templates: new Set([
    "id", "user_id", "transaction_type", "status", "name",
    "amount_centavos", "frequency", "interval_count",
    "day_of_month", "second_day_of_month", "day_of_week",
    "custom_rule", "starts_on", "ends_on", "next_occurrence_date",
    "last_generated_date", "subcategory_id", "source_account_id",
    "destination_account_id", "reminder_enabled", "reminder_days_before", "notes",
    "metadata", "version", "deleted", "created_at", "updated_at", "last_synced_at",
  ]),
  recurring_transaction_occurrences: new Set([
    "id", "user_id", "recurring_template_id", "scheduled_date", "status",
    "generated_transaction_id", "reminder_sent_at", "posted_at",
    "skipped_at", "failure_reason", "metadata",
    "version", "deleted", "created_at", "updated_at", "last_synced_at",
  ]),
  financial_plans: new Set([
    "input_snapshot_json", "recommendation_json",
    "id", "user_id", "period_start", "period_end", "status",
    "forecast_month", "forecast_total_centavos", "forecast_model_version", "forecast_generated_at", "forecast_quality",
    "classification_status", "classification_rule_set_version", "classification_assessed_at",
    "available_funds_centavos", "required_funds_centavos", "shortfall_centavos", "debt_surplus_centavos", "savings_surplus_centavos", "version", "deleted",
    "created_at", "updated_at", "last_synced_at",
  ]),
  credit_card_cycles: new Set([
    "id", "user_id", "account_id", "cycle_start_date", "cutoff_date", "statement_date",
    "version", "deleted", "created_at", "updated_at", "last_synced_at",
  ]),
  credit_card_installments: new Set([
    "id", "user_id", "account_id", "transaction_id", "description", "original_principal_centavos",
    "remaining_principal_centavos", "term_months", "remaining_months", "monthly_amortization_centavos",
    "interest_rate_bps", "interest_type", "settlement_status", "version", "deleted", "created_at", "updated_at", "last_synced_at",
  ]),
  credit_card_transactions: new Set([
    "transaction_id", "user_id", "account_id", "cycle_id", "purchase_type", "installment_id",
    "client_mutation_id", "applied_credit_centavos", "forecast_recorded_at", "version", "deleted", "created_at", "updated_at", "last_synced_at",
  ]),
  credit_card_statements: new Set([
    "id", "user_id", "cycle_id", "statement_date", "statement_balance_centavos", "minimum_due_centavos",
    "finance_charge_centavos", "due_date", "authoritative", "version", "deleted", "created_at", "updated_at", "last_synced_at",
  ]),
  credit_card_payments: new Set([
    "id", "user_id", "cycle_id", "statement_id", "transaction_id", "amount_centavos", "payment_date",
    "source_account_id", "notes", "issuer_recognized", "client_mutation_id", "version", "deleted",
    "forecast_recorded_at", "created_at", "updated_at", "last_synced_at",
  ]),
  debt_accounts: new Set([
    "id", "user_id", "linked_account_id", "name", "lender_name", "preset_key", "status",
    "original_balance_centavos", "current_balance_centavos", "annual_interest_rate_bps",
    "minimum_payment_centavos", "allows_extra_payments", "payment_frequency", "next_due_date", "maturity_date",
    "target_payoff_date", "interest_period", "interest_method", "preset_data", "payment_schedule",
    "notes", "paid_off_at", "archived_at", "version", "deleted", "created_at", "updated_at",
    "last_synced_at",
  ]),
  debt_payments: new Set(["id", "debt_account_id", "user_id", "transaction_id", "source", "payment_date", "amount_centavos", "principal_centavos", "interest_centavos", "notes", "version", "deleted", "created_at", "updated_at", "last_synced_at"]),
  debt_strategy_preferences: new Set(["user_id", "strategy", "version", "deleted", "created_at", "updated_at", "last_synced_at"]),
  user_debt_priorities: new Set(["id", "user_id", "debt_account_id", "priority_rank", "version", "deleted", "created_at", "updated_at", "last_synced_at"]),
  credit_card_settlements: new Set(["id", "user_id", "installment_id", "settlement_date", "remaining_principal_centavos", "settlement_amount_centavos", "pretermination_fee_centavos", "status", "version", "deleted", "created_at", "updated_at", "last_synced_at"]),
  credit_card_statement_strategies: new Set(["statement_id", "user_id", "strategy", "custom_amount_centavos", "percentage_bps", "version", "deleted", "created_at", "updated_at", "last_synced_at"]),
  alert_notification_preferences: new Set(["id", "user_id", "category", "mode", "in_app_enabled", "push_enabled", "duplicate_cooldown_hours", "snoozed_until", "version", "deleted", "updated_at"]),
  anomaly_whitelist_rules: new Set(["id", "user_id", "merchant_name", "subcategory_id", "base_amount_centavos", "tolerance_bps", "allow_any_amount", "status", "notes", "version", "deleted", "updated_at"]),
  alert_suppression_rules: new Set(["id", "user_id", "category", "source_type", "status", "merchant_name", "subcategory_id", "category_id", "amount_center_centavos", "amount_tolerance_bps", "starts_at", "ends_at", "reason", "metadata", "version", "deleted", "updated_at"]),
  anomaly_evaluations: new Set(["id", "user_id", "transaction_id", "subcategory_id", "amount_centavos", "usable_history_count", "usual_spending_centavos", "lower_bound_centavos", "upper_bound_centavos", "severity", "confirmed_recurring_at", "recurrence", "recurrence_months", "model_version", "evaluated_at", "version", "deleted", "created_at", "updated_at", "last_synced_at"]),
  savings_goals: new Set(["id", "user_id", "linked_account_id", "name", "target_amount_centavos", "starting_amount_centavos", "target_date", "priority", "emergency_fund_baseline_centavos", "auto_save_amount_centavos", "planned_contribution_amount_centavos", "contribution_frequency", "contribution_interval_count", "contribution_day_of_month", "contribution_second_day_of_month", "contribution_day_of_week", "custom_interval_days", "next_contribution_date", "interest_rate_bps", "notes", "emergency_fund_target_method", "essential_expense_coverage_months", "is_emergency_fund", "archived_at", "status", "version", "deleted", "created_at", "updated_at", "last_synced_at"]),
  savings_goal_activities: new Set(["id", "user_id", "savings_goal_id", "transaction_id", "activity_kind", "amount_centavos", "activity_date", "notes", "version", "deleted", "created_at", "updated_at", "last_synced_at"]),
  scheduled_payments: new Set([
    "id", "user_id", "name", "subcategory_id", "source_account_id", "amount_centavos", "frequency",
    "due_day_of_month", "due_second_day_of_month", "due_day_of_week", "due_month", "starts_on", "ends_on",
    "auto_post", "auto_post_from", "is_family_support", "is_dependent_support", "protected_by_default", "notes", "status",
    "version", "deleted", "created_at", "updated_at", "last_synced_at",
  ]),
  scheduled_payment_records: new Set([
    "id", "user_id", "scheduled_payment_id", "transaction_id", "occurrence_date", "payment_date", "amount_centavos", "source", "notes", "settles_occurrence",
    "version", "deleted", "created_at", "updated_at", "last_synced_at",
  ]),
  savings_allocation_preferences: new Set(["user_id", "strategy", "version", "deleted", "created_at", "updated_at", "last_synced_at"]),
};

const PULL_IDENTITY_COLUMNS: Record<string, string> = {
  credit_card_details: "account_id",
  credit_card_repayment_preferences: "account_id",
  credit_card_transactions: "transaction_id",
  debt_strategy_preferences: "user_id",
  credit_card_statement_strategies: "statement_id",
  savings_account_details: "account_id",
  savings_allocation_preferences: "user_id",
};

function normalizeAnomalyEvaluation(row: PullRow): PullRow {
  const features = row.feature_vector && typeof row.feature_vector === "object" && !Array.isArray(row.feature_vector)
    ? row.feature_vector as Record<string, unknown> : {};
  return {
    ...row,
    usable_history_count: row.usable_history_count ?? row.history_days,
    usual_spending_centavos: row.usual_spending_centavos ?? features.usual_spending_centavos,
    lower_bound_centavos: row.lower_bound_centavos ?? features.lower_bound_centavos,
    upper_bound_centavos: row.upper_bound_centavos ?? features.upper_bound_centavos,
    severity: row.severity ?? row.raw_anomaly_score,
    confirmed_recurring_at: row.confirmed_recurring_at ?? null,
    recurrence: row.recurrence ?? (row.confirmed_recurring_at ? "frequent" : null),
    recurrence_months: Array.isArray(row.recurrence_months) ? JSON.stringify(row.recurrence_months) : null,
  };
}

export function normalizePullRow(
  table: string,
  remoteRow: PullRow,
  userId: string,
): PullRow {
  const columns = LOCAL_COLUMNS[table];
  if (!columns) return remoteRow;
  const row = table === "anomaly_evaluations" ? normalizeAnomalyEvaluation(remoteRow) : remoteRow;

  const now = new Date().toISOString();
  const normalized: PullRow = {};

  for (const col of columns) {
    if (col === "user_id") {
      normalized[col] = (row[col] as string | null) ?? userId;
    } else if (col === "created_at") {
      normalized[col] = (row[col] as string | undefined) ?? (row.updated_at as string) ?? now;
    } else if (col === "last_synced_at") {
      normalized[col] = (row[col] as string | undefined) ?? now;
    } else if (col === "is_protected") {
      const isProtectedDefault = (row.is_protected_default as boolean) === true;
      const isProtected = (row.is_protected as boolean) === true;
      normalized[col] = isProtectedDefault || isProtected ? 1 : 0;
    } else if ((table === "debt_accounts" || table === "credit_card_details") && col === "allows_extra_payments") {
      normalized[col] = row[col] === true || row[col] === 1 ? 1 : 0;
    } else if (table === "financial_plans" && (col === "input_snapshot_json" || col === "recommendation_json")) {
      normalized[col] = row[col] == null ? null : typeof row[col] === "object" ? JSON.stringify(row[col]) : row[col];
    } else if (col === "metadata" || col === "preset_data" || col === "payment_schedule" || col.endsWith("_snapshot_json") || col === "recommendation_json") {
      const val = row[col];
      normalized[col] = typeof val === "object" && val !== null ? JSON.stringify(val) : (val ?? "{}");
    } else if (table === "savings_account_details" && col === "interest_reference_json") {
      normalized[col] = row.interest_reference == null ? null : JSON.stringify(row.interest_reference);
    } else if (table === "savings_account_details" && col === "balance_tiers_json") {
      const tiers = row.balance_tiers;
      normalized[col] = typeof tiers === "object" && tiers !== null ? JSON.stringify(tiers) : null;
    } else {
      const val = row[col];
      normalized[col] = typeof val === "boolean" ? (val ? 1 : 0) : val;
    }
  }

  return normalized;
}

export async function applyPullRow(db: PullDb, table: string, row: PullRow): Promise<void> {
  if (table !== "financial_plans") {
    return applyPullRowContents(db, table, row);
  }
  await db.runAsync("SAVEPOINT financial_plan_pull");
  try {
    await applyPullRowContents(db, table, row);
    await db.runAsync("RELEASE SAVEPOINT financial_plan_pull");
  } catch (error) {
    await db.runAsync("ROLLBACK TO SAVEPOINT financial_plan_pull");
    await db.runAsync("RELEASE SAVEPOINT financial_plan_pull");
    throw error;
  }
}

async function applyPullRowContents(
  db: PullDb,
  table: string,
  row: PullRow,
): Promise<void> {
  const identityColumn = PULL_IDENTITY_COLUMNS[table] ?? "id";
  const userScoped = true;
  const recordId = row[identityColumn] as string;
  const identityWhere = `"${identityColumn}" = ?${userScoped ? " AND user_id = ?" : ""}`;
  const identityParams: SQLite.SQLiteBindValue[] = userScoped ? [recordId, row.user_id as string] : [recordId];
  const rowVersion = (row.version as number) ?? 1;
  const rowDeleted = row.deleted === true || (row.deleted as number) === 1;
  const now = new Date().toISOString();

  const existing = await db.getFirstAsync<{ version: number; user_id: string; statement_date?: string | null }>(
    `SELECT version, user_id${table === "credit_card_cycles" ? ", statement_date" : ""} FROM "${table}" WHERE ${identityWhere}`,
    ...identityParams,
  );

  if (!existing) {
    if (rowDeleted) return;

    const columns = Object.keys(row).join(", ");
    const placeholders = Object.keys(row).map(() => "?").join(", ");
    const values = Object.keys(row).map((k) => row[k] as SQLite.SQLiteBindValue);

    await db.runAsync(
      `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
      ...values,
    );
    if (table === "financial_plans") await restoreFinancialPlanChildren(db, row);
    return;
  }

  if (rowVersion <= existing.version) return;

  if (rowDeleted) {
    if (
      table === "financial_accounts" ||
       table === "transactions" ||
        table === "debt_accounts" ||
        table === "savings_goals" ||
       table === "recurring_transaction_templates" ||
       table === "recurring_transaction_occurrences"
    ) {
      await db.runAsync(
       `UPDATE "${table}" SET deleted = 1, status = 'deleted', version = ?,
          updated_at = ? WHERE ${identityWhere}`,
        rowVersion,
        now,
        ...identityParams,
      );
    } else if (table === "financial_plans") {
      await clearFinancialPlanChildren(db, recordId);
      await db.runAsync(
         `UPDATE "${table}" SET input_snapshot_json = NULL, recommendation_json = NULL, deleted = 1, status = 'deleted', version = ?,
          updated_at = ? WHERE ${identityWhere}`,
        rowVersion,
        now,
        ...identityParams,
      );
    } else if (table === "credit_card_cycles" || table === "credit_card_details" || table === "credit_card_payments" || table === "debt_payments" || table === "savings_account_details" || table === "savings_goal_activities" || table === "scheduled_payments" || table === "scheduled_payment_records") {
      await db.runAsync(
        `UPDATE "${table}" SET deleted = 1, version = ?,
          updated_at = ? WHERE ${identityWhere}`,
        rowVersion,
        now,
        ...identityParams,
      );
    } else {
      await db.runAsync(
        `UPDATE "${table}" SET deleted = 1, is_active = 0, version = ?,
         updated_at = ? WHERE ${identityWhere}`,
        rowVersion,
        now,
        ...identityParams,
      );
    }
    return;
  }

  const columns = table === "credit_card_cycles" && existing.statement_date !== null && existing.statement_date !== undefined
    // SQLite fires UPDATE OF triggers even when the assigned value is unchanged.
    // Recorded cycle dates are immutable, while statement_date remains server-owned.
    ? Object.keys(row).filter((column) => column !== "cycle_start_date" && column !== "cutoff_date")
    : Object.keys(row);
  const setClauses = columns.map((c) => `"${c}" = ?`).join(", ");

  await db.runAsync(
    `UPDATE "${table}" SET ${setClauses} WHERE ${identityWhere}`,
    ...columns.map((c) => row[c] as SQLite.SQLiteBindValue),
    ...identityParams,
  );
  if (table === "financial_plans") await restoreFinancialPlanChildren(db, row);
}
