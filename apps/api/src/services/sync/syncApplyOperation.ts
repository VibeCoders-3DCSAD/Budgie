import { validateSavingsGoalContributionPayload } from "./savingsGoalContribution.js";
import { validateSavingsExpenseWithdrawalPayload } from "./savingsExpenseWithdrawals.js";
import { normalizeSavingsInterestReference } from "@odin/savings-interest";
import { normalizeRecurrenceMonths } from "@odin/spending-insights/recurringMonths.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Operation = {
  operation_id: string;
  entity: string;
  record_id: string;
  operation_type: "create" | "update" | "delete";
  base_version: number | null;
  changed_fields: string[];
  payload: Record<string, unknown>;
};

const SYNCED_ENTITIES = new Set([
  "categories",
  "subcategories",
  "financial_accounts",
  "savings_account_details",
  "transactions",
  "income_sources",
  "recurring_transaction_templates",
  "recurring_transaction_occurrences",
  "financial_plans",
  "credit_card_details",
  "credit_card_repayment_preferences",
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
  "savings_allocation_preferences",
  "scheduled_payments",
  "scheduled_payment_records",
]);

const ALERT_PREFERENCE_CREATE_FIELDS = new Set(["category", "mode", "in_app_enabled", "push_enabled", "duplicate_cooldown_hours", "snoozed_until"]);
const ALERT_PREFERENCE_UPDATE_FIELDS = new Set(["mode", "in_app_enabled", "push_enabled", "duplicate_cooldown_hours", "snoozed_until"]);
const ANOMALY_WHITELIST_CREATE_FIELDS = new Set(["merchant_name", "subcategory_id", "base_amount_centavos", "tolerance_bps", "allow_any_amount", "status", "notes"]);
const ANOMALY_WHITELIST_UPDATE_FIELDS = new Set(["status", "notes"]);
const ALERT_SUPPRESSION_CREATE_FIELDS = new Set(["category", "source_type", "status", "merchant_name", "subcategory_id", "category_id", "amount_center_centavos", "amount_tolerance_bps", "starts_at", "ends_at", "reason", "metadata"]);
const ALERT_SUPPRESSION_UPDATE_FIELDS = new Set(["status", "ends_at", "reason"]);
const ANOMALY_EVALUATION_CREATE_FIELDS = new Set(["transaction_id", "subcategory_id", "amount_centavos", "usable_history_count", "usual_spending_centavos", "lower_bound_centavos", "upper_bound_centavos", "severity", "model_version", "evaluated_at"]);
const ANOMALY_EVALUATION_UPDATE_FIELDS = new Set(["recurrence", "confirmed_recurring_at", "recurrence_months"]);
const ANOMALY_RECURRENCES = new Set(["one_time", "frequent", "yearly"]);
const TAXONOMY_ICON_KEYS = new Set([
  "bowl-food", "wine", "t-shirt", "house", "armchair", "first-aid",
  "car", "device-mobile", "game-controller", "graduation-cap", "fork-knife",
  "sparkle", "tag", "airplane", "bank", "basket", "bus", "camera", "coffee",
  "credit-card", "dog", "gift", "heart", "laptop", "music-note", "storefront",
  "carrot", "fish", "bread", "egg", "cookie", "orange", "pill", "stethoscope", "tooth",
  "eye", "test-tube", "hospital", "heartbeat", "shield-check",
  "cake", "ice-cream", "hamburger", "pizza", "cooking-pot", "tea-bag",
  "beer-bottle", "beer-stein", "martini", "cigarette", "champagne", "brandy",
  "pants", "dress", "hoodie", "sock", "sneaker", "baseball-cap",
  "handbag", "watch", "lightning", "drop", "flame", "wifi-high",
  "key", "wrench", "plug", "bed", "washing-machine", "broom",
  "fan", "oven", "potted-plant", "lightbulb", "toolbox", "syringe",
  "thermometer", "wheelchair", "bandaids", "brain", "ambulance", "bicycle",
  "train", "gas-pump", "motorcycle", "taxi", "steering-wheel", "truck",
  "boat", "phone", "envelope", "globe", "sim-card", "chat-circle",
  "headphones", "film-slate", "ticket", "palette", "barbell", "book-open",
  "trophy", "tent", "pencil", "notebook", "calculator", "certificate",
  "backpack", "student", "scissors", "paw-print", "baby", "diamond",
  "scales", "identification-card", "wallet", "coat-hanger",
]);
const COLOR_HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const SERVER_COLUMNS = new Set([
  "id",
  "user_id",
  "version",
  "deleted",
  "created_at",
  "updated_at",
  "last_synced_at",
  "is_system",
  "is_protected_default",
]);

const CATEGORY_CREATE_FIELDS = new Set([
  "slug",
  "label",
  "short_label",
  "description",
  "icon_key",
  "color_hex",
  "is_filipino_context",
  "minimum_amount_centavos",
  "always_in_budget",
  "fixed_amount_centavos",
  "sort_order",
]);

const CATEGORY_UPDATE_FIELDS = new Set([
  "label",
  "short_label",
  "description",
  "icon_key",
  "color_hex",
  "is_filipino_context",
  "minimum_amount_centavos",
  "always_in_budget",
  "fixed_amount_centavos",
  "sort_order",
  "is_active",
]);

const SUBCATEGORY_CREATE_FIELDS = new Set([
  "category_id",
  "slug",
  "kind",
  "label",
  "short_label",
  "description",
  "icon_key",
  "color_hex",
  "is_filipino_context",
  "is_protected",
  "minimum_amount_centavos",
  "always_in_budget",
  "fixed_amount_centavos",
  "sort_order",
]);

const SUBCATEGORY_UPDATE_FIELDS = new Set([
  "label",
  "slug",
  "short_label",
  "description",
  "icon_key",
  "color_hex",
  "is_filipino_context",
  "is_protected",
  "minimum_amount_centavos",
  "always_in_budget",
  "fixed_amount_centavos",
  "is_active",
]);

const FINANCIAL_ACCOUNT_CREATE_FIELDS = new Set([
  "name",
  "kind",
  "opening_balance_centavos",
  "include_in_dashboard_balance",
  "institution_name",
  "opened_on",
  "sort_order",
]);

const FINANCIAL_ACCOUNT_UPDATE_FIELDS = new Set([
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

const SAVINGS_ACCOUNT_DETAIL_FIELDS = new Set([
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

const CREDIT_CARD_CYCLE_CREATE_FIELDS = new Set([
  "account_id", "cycle_start_date", "cutoff_date",
]);

const CREDIT_CARD_CYCLE_FIELDS = new Set([
  "account_id", "cycle_start_date", "cutoff_date", "statement_date",
]);

const CREDIT_CARD_STATEMENT_CREATE_FIELDS = new Set([
  "cycle_id", "statement_date", "statement_balance_centavos", "minimum_due_centavos",
  "finance_charge_centavos", "due_date",
]);

const CREDIT_CARD_STATEMENT_UPDATE_FIELDS = new Set([
  "statement_date", "statement_balance_centavos", "minimum_due_centavos",
  "finance_charge_centavos", "due_date",
]);

const CREDIT_CARD_PAYMENT_CREATE_FIELDS = new Set([
  "cycle_id", "statement_id", "transaction_id", "amount_centavos", "payment_date",
  "source_account_id", "notes", "client_mutation_id", "forecast_recorded_at",
]);

const CREDIT_CARD_PAYMENT_UPDATE_FIELDS = new Set([
  "amount_centavos", "payment_date", "source_account_id", "notes",
]);

const CREDIT_CARD_DETAILS_CREATE_FIELDS = new Set([
  "account_id", "issuer", "credit_limit_centavos", "available_credit_centavos",
  "cutoff_day", "statement_day", "notes", "billing_cycle_days", "alert_threshold_percent", "allows_extra_payments",
  "reconciled_available_credit_centavos", "pre_reconciliation_available_credit_centavos", "available_credit_reconciled_at",
]);

const CREDIT_CARD_DETAILS_UPDATE_FIELDS = new Set([
  "account_id", "issuer", "credit_limit_centavos", "available_credit_centavos", "cutoff_day", "statement_day",
  "notes", "billing_cycle_days", "alert_threshold_percent", "allows_extra_payments", "reconciled_available_credit_centavos", "pre_reconciliation_available_credit_centavos", "available_credit_reconciled_at",
]);
const CREDIT_CARD_REPAYMENT_PREFERENCE_FIELDS = new Set([
  "account_id", "strategy", "custom_amount_centavos", "percentage_bps",
]);

const TRANSACTION_CREATE_FIELDS = new Set([
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

const TRANSACTION_UPDATE_FIELDS = new Set([
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

const VALID_ACCOUNT_KINDS = ["cash", "bank", "e_wallet", "savings", "credit_card", "other"];
const VALID_TRANSACTION_TYPES = ["income", "expense", "transfer"];

const INCOME_FREQUENCIES = ["daily", "weekly", "semi_monthly", "monthly"];

const INCOME_SOURCE_CREATE_FIELDS = new Set([
  "name",
  "frequency",
  "recurring_template_id",
  "destination_account_id",
  "subcategory_id",
  "expected_amount_centavos",
  "payday_day_of_month",
  "payday_second_day_of_month",
  "payday_day_of_week",
  "next_expected_date",
  "is_active",
  "notes",
]);

const INCOME_SOURCE_UPDATE_FIELDS = new Set([
  "name",
  "frequency",
  "recurring_template_id",
  "destination_account_id",
  "subcategory_id",
  "expected_amount_centavos",
  "payday_day_of_month",
  "payday_second_day_of_month",
  "payday_day_of_week",
  "next_expected_date",
  "is_active",
  "notes",
]);

const RECURRING_TEMPLATE_FIELDS = new Set([
  "transaction_type", "name", "amount_centavos", "frequency", "interval_count",
  "day_of_month", "second_day_of_month", "day_of_week",
  "starts_on", "ends_on", "subcategory_id", "source_account_id", "destination_account_id", "notes",
]);

const RECURRING_TEMPLATE_UPDATE_FIELDS = new Set(
  [...RECURRING_TEMPLATE_FIELDS].filter((field) => field !== "transaction_type"),
);

const RECURRING_OCCURRENCE_FIELDS = new Set([
  "recurring_template_id", "scheduled_date", "generated_transaction_id",
]);

const FINANCIAL_PLAN_CREATE_FIELDS = new Set([
  "period_start", "period_end", "status", "input_snapshot", "recommendation",
]);

const CREDIT_CARD_INSTALLMENT_CREATE_FIELDS = new Set([
  "account_id", "transaction_id", "description", "original_principal_centavos",
  "remaining_principal_centavos", "term_months", "remaining_months", "monthly_amortization_centavos",
  "interest_rate_bps", "interest_type", "settlement_status",
]);

const DEBT_ACCOUNT_FIELDS = new Set([
  "linked_account_id", "name", "lender_name", "preset_key", "status",
  "original_balance_centavos", "current_balance_centavos", "annual_interest_rate_bps",
  "minimum_payment_centavos", "allows_extra_payments", "payment_frequency", "next_due_date", "maturity_date",
  "target_payoff_date", "interest_period", "interest_method", "preset_data", "notes",
]);
const DEBT_PAYMENT_FIELDS = new Set(["debt_account_id", "transaction_id", "source", "payment_date", "amount_centavos", "principal_centavos", "interest_centavos", "notes", "linked_transaction_type", "linked_source_account_id", "linked_subcategory_id"]);
const DEBT_STRATEGY_FIELDS = new Set(["strategy"]);
const DEBT_PRIORITY_FIELDS = new Set(["priorities"]);
const CREDIT_CARD_SETTLEMENT_FIELDS = new Set(["installment_id", "settlement_date", "remaining_principal_centavos", "settlement_amount_centavos", "pretermination_fee_centavos", "status"]);
const CREDIT_CARD_STATEMENT_STRATEGY_FIELDS = new Set(["statement_id", "strategy", "custom_amount_centavos", "percentage_bps"]);
const DEBT_ACCOUNT_TYPES = ["personal_loan", "salary_loan", "multipurpose_loan", "business_loan", "auto_loan", "custom_debt"];
const SAVINGS_GOAL_FIELDS = new Set(["linked_account_id", "name", "goal_type", "target_amount_centavos", "starting_amount_centavos", "target_date", "priority", "emergency_fund_baseline_centavos", "auto_save_amount_centavos", "planned_contribution_amount_centavos", "contribution_frequency", "contribution_interval_count", "contribution_day_of_month", "contribution_second_day_of_month", "contribution_day_of_week", "custom_interval_days", "next_contribution_date", "interest_rate_bps", "notes", "emergency_fund_target_method", "essential_expense_coverage_months", "is_emergency_fund", "status", "archived_at"]);
const SCHEDULED_PAYMENT_FIELDS = new Set(["name", "subcategory_id", "source_account_id", "amount_centavos", "frequency", "due_day_of_month", "due_second_day_of_month", "due_day_of_week", "due_month", "starts_on", "ends_on", "auto_post", "auto_post_from", "is_family_support", "is_dependent_support", "protected_by_default", "notes", "status"]);
const SCHEDULED_PAYMENT_FREQUENCIES = ["daily", "weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "yearly", "once"];
const SCHEDULED_PAYMENT_RECORD_FIELDS = new Set(["scheduled_payment_id", "transaction_id", "occurrence_date", "payment_date", "amount_centavos", "source", "notes"]);
const SCHEDULED_PAYMENT_RECORD_SETTLEMENT_FIELDS = new Set(["settles_occurrence"]);
const SAVINGS_GOAL_ACTIVITY_FIELDS = new Set(["savings_goal_id", "transaction_id", "activity_kind", "amount_centavos", "activity_date", "notes"]);
const SAVINGS_ALLOCATION_PREFERENCE_FIELDS = new Set(["strategy"]);
const SAVINGS_GOAL_TYPES = ["emergency_fund", "custom"];
const SAVINGS_GOAL_PRIORITIES = ["low", "medium", "high"];
const SAVINGS_GOAL_CONTRIBUTION_FREQUENCIES = ["daily", "weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "yearly", "custom"];

const CREDIT_CARD_TRANSACTION_FIELDS = new Set([
  "transaction_id", "account_id", "cycle_id", "purchase_type", "installment_id", "client_mutation_id", "applied_credit_centavos", "forecast_recorded_at",
]);

export async function prepareOperation(
  supabase: SupabaseClient,
  userId: string,
  op: Operation,
): Promise<Operation> {
  if (!SYNCED_ENTITIES.has(op.entity)) {
    throw new Error(`entity '${op.entity}' is not in the sync allowlist`);
  }
  switch (op.operation_type) {
    case "create":
      return {
        ...op,
        payload: await validateCreatePayload(supabase, userId, op.entity, op.payload, op.record_id),
      };
    case "update":
      return {
        ...op,
        payload: await validateUpdatePayload(supabase, userId, op.entity, op.record_id,
          filterPayloadFields(op.payload, op.entity === "transactions"
            ? [...op.changed_fields, "savings_goal_contribution", "savings_goal_withdrawals"]
            : op.changed_fields)),
      };
    case "delete":
      return op;
    default:
      throw new Error(`Unknown operation_type: ${op.operation_type}`);
  }
}

function sanitizePayload(
  payload: Record<string, unknown>,
  allowedFields: Set<string>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!SERVER_COLUMNS.has(key) && allowedFields.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

async function validateCreatePayload(
  supabase: SupabaseClient,
  userId: string,
  entity: string,
  payload: Record<string, unknown>,
  recordId?: string,
): Promise<Record<string, unknown>> {
  if (entity === "categories" || entity === "subcategories" || entity === "transactions") {
    return validateTaxonomyCreatePayload(supabase, userId, entity, payload);
  }
  if (entity === "scheduled_payments") return validateScheduledPaymentPayload(payload, true);
  if (entity === "scheduled_payment_records") return validateScheduledPaymentRecordPayload(payload);

  if (entity === "financial_accounts") {
    assertOnlyAllowed(payload, FINANCIAL_ACCOUNT_CREATE_FIELDS);
    const sanitized = sanitizePayload(payload, FINANCIAL_ACCOUNT_CREATE_FIELDS);
    requireString(sanitized, "name");
    requireString(sanitized, "kind");
     const validKinds = ["cash", "bank", "e_wallet", "savings", "credit_card", "other"];
    if (!validKinds.includes(sanitized.kind as string)) {
      throw new Error(`kind must be one of: ${validKinds.join(", ")}`);
    }
    optionalBigInt(sanitized, "opening_balance_centavos");
    optionalBoolean(sanitized, "include_in_dashboard_balance");
    optionalString(sanitized, "institution_name");
    optionalString(sanitized, "opened_on");
    optionalNumber(sanitized, "sort_order");
    return Promise.resolve(sanitized);
  }

  if (entity === "savings_account_details") {
    return validateSavingsAccountDetailsPayload(supabase, userId, payload, true, recordId);
  }

  if (entity === "credit_card_cycles") {
    assertOnlyAllowed(payload, CREDIT_CARD_CYCLE_CREATE_FIELDS);
    const sanitized = sanitizePayload(payload, CREDIT_CARD_CYCLE_CREATE_FIELDS);
    requireString(sanitized, "account_id");
    requireString(sanitized, "cycle_start_date");
    requireString(sanitized, "cutoff_date");
    requireDateString(sanitized, "cycle_start_date");
    requireDateString(sanitized, "cutoff_date");
    validateDateOrdering(sanitized, "cycle_start_date", "cutoff_date");
    await verifyAccountOwnership(supabase, userId, sanitized.account_id as string);
    return sanitized;
  }

  if (entity === "credit_card_statements") {
    assertOnlyAllowed(payload, CREDIT_CARD_STATEMENT_CREATE_FIELDS);
    const sanitized = sanitizePayload(payload, CREDIT_CARD_STATEMENT_CREATE_FIELDS);
    requireString(sanitized, "cycle_id");
    requireDateString(sanitized, "statement_date");
    requireDateString(sanitized, "due_date");
    requireBigInt(sanitized, "statement_balance_centavos");
    requireBigInt(sanitized, "minimum_due_centavos");
    if (sanitized.finance_charge_centavos === undefined) sanitized.finance_charge_centavos = 0;
    // jsonb_populate_record inserts NULL for absent fields instead of applying
    // the database default, so authoritative must be supplied server-side.
    sanitized.authoritative = true;
    requireBigInt(sanitized, "finance_charge_centavos");
    for (const field of ["statement_balance_centavos", "minimum_due_centavos", "finance_charge_centavos"]) {
      const value = sanitized[field];
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${field} must be a non-negative whole number`);
      }
    }
    if ((sanitized.minimum_due_centavos as number) > (sanitized.statement_balance_centavos as number)) {
      throw new Error("minimum_due_centavos must be <= statement_balance_centavos");
    }
    await verifyStatementCycle(supabase, userId, sanitized.cycle_id as string, sanitized.statement_date as string);
    return sanitized;
  }

  if (entity === "credit_card_payments") {
    assertOnlyAllowed(payload, CREDIT_CARD_PAYMENT_CREATE_FIELDS);
    const sanitized = sanitizePayload(payload, CREDIT_CARD_PAYMENT_CREATE_FIELDS);
    for (const field of ["cycle_id", "statement_id", "transaction_id", "source_account_id", "client_mutation_id"]) requireString(sanitized, field);
    requireDateString(sanitized, "payment_date");
    requireIsoTimestamp(sanitized, "forecast_recorded_at");
    requirePositiveInteger(sanitized, "amount_centavos");
    optionalString(sanitized, "notes");
    await verifyCreditCardPaymentReferences(supabase, userId, sanitized);
    sanitized.issuer_recognized = false;
    return sanitized;
  }

  if (entity === "credit_card_details") {
    assertOnlyAllowed(payload, CREDIT_CARD_DETAILS_CREATE_FIELDS);
    const sanitized = sanitizePayload(payload, CREDIT_CARD_DETAILS_CREATE_FIELDS);
    requireString(sanitized, "account_id");
    requirePositiveInteger(sanitized, "credit_limit_centavos");
    requireNumberInRange(sanitized, "cutoff_day", 1, 31);
     if (sanitized.statement_day != null) requireNumberInRange(sanitized, "statement_day", 1, 31);
    optionalString(sanitized, "issuer");
    optionalString(sanitized, "notes");
    optionalFiniteInteger(sanitized, "available_credit_centavos");
    optionalFiniteInteger(sanitized, "billing_cycle_days");
    optionalFiniteInteger(sanitized, "alert_threshold_percent");
    if (sanitized.allows_extra_payments !== undefined && typeof sanitized.allows_extra_payments !== "boolean") throw new Error("allows_extra_payments must be a boolean");
    optionalFiniteInteger(sanitized, "reconciled_available_credit_centavos");
    optionalFiniteInteger(sanitized, "pre_reconciliation_available_credit_centavos");
    if (sanitized.available_credit_reconciled_at !== undefined && sanitized.available_credit_reconciled_at !== null) requireIsoTimestamp(sanitized, "available_credit_reconciled_at");
    validateOptionalRange(sanitized, "billing_cycle_days", 28, 31);
    validateOptionalRange(sanitized, "alert_threshold_percent", 0, 100);
    await verifyAccountOwnership(supabase, userId, sanitized.account_id as string);
    return sanitized;
  }

  if (entity === "credit_card_repayment_preferences") {
    assertOnlyAllowed(payload, CREDIT_CARD_REPAYMENT_PREFERENCE_FIELDS);
    const sanitized = sanitizePayload(payload, CREDIT_CARD_REPAYMENT_PREFERENCE_FIELDS);
    requireString(sanitized, "account_id");
    requireString(sanitized, "strategy");
    if (!["pay_in_full", "pay_minimum", "percentage_of_statement", "custom_payment"].includes(sanitized.strategy as string)) throw new Error("repayment strategy is invalid");
    if (sanitized.strategy === "custom_payment") requirePositiveInteger(sanitized, "custom_amount_centavos");
    if (sanitized.strategy === "percentage_of_statement" && (!Number.isSafeInteger(sanitized.percentage_bps) || (sanitized.percentage_bps as number) < 1 || (sanitized.percentage_bps as number) > 10_000)) throw new Error("percentage_bps must be between 1 and 10000");
    await verifyAccountOwnership(supabase, userId, sanitized.account_id as string);
    return sanitized;
  }

  if (entity === "credit_card_installments") {
    assertOnlyAllowed(payload, CREDIT_CARD_INSTALLMENT_CREATE_FIELDS);
    const sanitized = sanitizePayload(payload, CREDIT_CARD_INSTALLMENT_CREATE_FIELDS);
    for (const field of ["account_id", "transaction_id", "description", "interest_type", "settlement_status"]) requireString(sanitized, field);
    for (const field of ["original_principal_centavos", "remaining_principal_centavos", "term_months", "remaining_months", "monthly_amortization_centavos"]) requireBigInt(sanitized, field);
    if (sanitized.interest_rate_bps === undefined) sanitized.interest_rate_bps = 0;
    requireBigInt(sanitized, "interest_rate_bps");
    const original = sanitized.original_principal_centavos as number;
    const remaining = sanitized.remaining_principal_centavos as number;
    const term = sanitized.term_months as number;
    const remainingMonths = sanitized.remaining_months as number;
    if (original <= 0 || remaining < 0 || remaining > original || term <= 0 || remainingMonths < 0 || remainingMonths > term || (sanitized.monthly_amortization_centavos as number) <= 0 || (sanitized.interest_rate_bps as number) < 0) throw new Error("credit-card installment amounts are invalid");
    if (!["zero_interest", "interest_bearing"].includes(sanitized.interest_type as string)) throw new Error("interest_type is invalid");
    if (!["active", "early_settlement_requested", "completed"].includes(sanitized.settlement_status as string)) throw new Error("settlement_status is invalid");
    await verifyAccountOwnership(supabase, userId, sanitized.account_id as string);
    const { data: transaction, error: transactionError } = await supabase
      .from("transactions")
      .select("id, transaction_type, source_account_id")
      .eq("id", sanitized.transaction_id as string)
      .eq("user_id", userId)
      .eq("deleted", false)
      .maybeSingle();
    if (transactionError) throw new Error(`installment transaction validation failed: ${transactionError.message}`);
    if (!transaction || transaction.transaction_type !== "expense" || transaction.source_account_id !== sanitized.account_id) {
      throw new Error("installment transaction does not belong to the selected credit card");
    }
    return sanitized;
  }

  if (entity === "debt_accounts") {
    assertOnlyAllowed(payload, DEBT_ACCOUNT_FIELDS);
    const sanitized = sanitizePayload(payload, DEBT_ACCOUNT_FIELDS);
    for (const field of ["name", "preset_key", "status", "payment_frequency", "next_due_date"]) requireString(sanitized, field);
    for (const field of ["original_balance_centavos", "current_balance_centavos", "annual_interest_rate_bps", "minimum_payment_centavos"]) requireBigInt(sanitized, field);
    if (!DEBT_ACCOUNT_TYPES.includes(sanitized.preset_key as string)) throw new Error("preset_key is not a supported non-credit-card debt type");
    if (sanitized.status !== "active") throw new Error("new debt accounts must be active");
    if ((sanitized.current_balance_centavos as number) > (sanitized.original_balance_centavos as number)) throw new Error("current_balance_centavos must not exceed original_balance_centavos");
    if (!sanitized.preset_data || typeof sanitized.preset_data !== "object" || Array.isArray(sanitized.preset_data)) throw new Error("preset_data must be an object");
    for (const field of ["lender_name", "maturity_date", "target_payoff_date", "interest_period", "interest_method", "notes"]) optionalString(sanitized, field);
    if (sanitized.allows_extra_payments !== undefined && typeof sanitized.allows_extra_payments !== "boolean") throw new Error("allows_extra_payments must be a boolean");
    if (sanitized.linked_account_id != null) { requireString(sanitized, "linked_account_id"); await verifyAccountOwnership(supabase, userId, sanitized.linked_account_id as string); }
    await validateDebtPreset(supabase, userId, sanitized.preset_key as string, sanitized.preset_data as Record<string, unknown>);
    return sanitized;
  }
  if (entity === "debt_payments") {
    assertOnlyAllowed(payload, DEBT_PAYMENT_FIELDS);
    const sanitized = sanitizePayload(payload, DEBT_PAYMENT_FIELDS);
    for (const field of ["debt_account_id", "transaction_id", "source", "payment_date", "linked_transaction_type", "linked_source_account_id", "linked_subcategory_id"]) requireString(sanitized, field);
    requirePositiveInteger(sanitized, "amount_centavos"); requireBigInt(sanitized, "principal_centavos"); requireBigInt(sanitized, "interest_centavos");
    if (sanitized.source !== "transaction" || sanitized.linked_transaction_type !== "expense") throw new Error("debt payment must link an expense transaction");
    return sanitized;
  }
  if (entity === "savings_goals") {
    return validateSavingsGoalPayload(payload, true, supabase, userId);
  }
  if (entity === "savings_goal_activities") {
    assertOnlyAllowed(payload, SAVINGS_GOAL_ACTIVITY_FIELDS);
    const sanitized = sanitizePayload(payload, SAVINGS_GOAL_ACTIVITY_FIELDS);
    for (const field of ["savings_goal_id", "transaction_id", "activity_kind", "activity_date"]) requireString(sanitized, field);
    requirePositiveInteger(sanitized, "amount_centavos");
    if (sanitized.activity_kind !== "contribution" && sanitized.activity_kind !== "withdrawal") throw new Error("savings activity kind is invalid");
    optionalString(sanitized, "notes");
    const { data: goal, error: goalError } = await supabase.from("savings_goals").select("id, status").eq("id", sanitized.savings_goal_id as string).eq("user_id", userId).eq("deleted", false).maybeSingle();
    if (goalError) throw new Error(`savings goal validation failed: ${goalError.message}`);
    if (!goal || goal.status !== "active") throw new Error("savings activity requires an active owned savings goal");
    const { data: transaction, error: transactionError } = await supabase.from("transactions").select("id, transaction_type").eq("id", sanitized.transaction_id as string).eq("user_id", userId).eq("deleted", false).maybeSingle();
    if (transactionError) throw new Error(`savings transaction validation failed: ${transactionError.message}`);
    if (!transaction || transaction.transaction_type !== "transfer") throw new Error("savings activity requires an owned transfer transaction");
    return sanitized;
  }
  if (entity === "savings_allocation_preferences") {
    assertOnlyAllowed(payload, SAVINGS_ALLOCATION_PREFERENCE_FIELDS);
    const sanitized = sanitizePayload(payload, SAVINGS_ALLOCATION_PREFERENCE_FIELDS);
    if (sanitized.strategy !== "snowball" && sanitized.strategy !== "avalanche") throw new Error("strategy must be snowball or avalanche");
    return sanitized;
  }
  if (entity === "debt_strategy_preferences") {
    assertOnlyAllowed(payload, DEBT_STRATEGY_FIELDS); const sanitized = sanitizePayload(payload, DEBT_STRATEGY_FIELDS);
    if (sanitized.strategy !== "snowball" && sanitized.strategy !== "avalanche") throw new Error("strategy must be snowball or avalanche");
    return sanitized;
  }
  if (entity === "user_debt_priorities") {
    assertOnlyAllowed(payload, DEBT_PRIORITY_FIELDS); const sanitized = sanitizePayload(payload, DEBT_PRIORITY_FIELDS);
    if (!Array.isArray(sanitized.priorities) || !sanitized.priorities.every((value) => typeof value === "string")) throw new Error("priorities must be debt IDs");
    return sanitized;
  }
  if (entity === "credit_card_settlements") {
    assertOnlyAllowed(payload, CREDIT_CARD_SETTLEMENT_FIELDS); const sanitized = sanitizePayload(payload, CREDIT_CARD_SETTLEMENT_FIELDS);
    for (const field of ["installment_id", "settlement_date", "status"]) requireString(sanitized, field);
    for (const field of ["remaining_principal_centavos", "settlement_amount_centavos"]) requireBigInt(sanitized, field);
    if (sanitized.pretermination_fee_centavos !== undefined) requireBigInt(sanitized, "pretermination_fee_centavos");
    if (!["requested", "recognized", "rejected"].includes(sanitized.status as string)) throw new Error("settlement status is invalid");
    const { data: installment, error } = await supabase.from("credit_card_installments").select("id").eq("id", sanitized.installment_id as string).eq("user_id", userId).eq("deleted", false).maybeSingle();
    if (error) throw new Error(`settlement installment validation failed: ${error.message}`);
    if (!installment) throw new Error("settlement installment is not accessible");
    return sanitized;
  }
  if (entity === "credit_card_statement_strategies") {
    assertOnlyAllowed(payload, CREDIT_CARD_STATEMENT_STRATEGY_FIELDS); const sanitized = sanitizePayload(payload, CREDIT_CARD_STATEMENT_STRATEGY_FIELDS);
    for (const field of ["statement_id", "strategy"]) requireString(sanitized, field);
    if (!["pay_in_full", "pay_minimum", "percentage_of_statement", "custom_payment"].includes(sanitized.strategy as string)) throw new Error("statement repayment strategy is invalid");
    const { data: statement, error } = await supabase.from("credit_card_statements").select("statement_balance_centavos, minimum_due_centavos").eq("id", sanitized.statement_id as string).eq("user_id", userId).eq("authoritative", true).eq("deleted", false).maybeSingle();
    if (error) throw new Error(`statement repayment strategy validation failed: ${error.message}`);
    if (!statement) throw new Error("statement repayment strategy requires an authoritative owned statement");
    const balance = Number(statement.statement_balance_centavos);
    const minimum = Number(statement.minimum_due_centavos);
    const strategy = sanitized.strategy as string;
    if (strategy === "custom_payment") requirePositiveInteger(sanitized, "custom_amount_centavos");
    if (strategy === "percentage_of_statement" && (!Number.isSafeInteger(sanitized.percentage_bps) || (sanitized.percentage_bps as number) <= 0 || (sanitized.percentage_bps as number) > 10_000)) throw new Error("percentage_bps must be between 1 and 10000");
    const target = strategy === "pay_in_full" ? balance : strategy === "pay_minimum" ? minimum : strategy === "custom_payment" ? sanitized.custom_amount_centavos : Math.round(balance * Number(sanitized.percentage_bps) / 10_000);
    if (!Number.isSafeInteger(target) || (target as number) < minimum || (target as number) > balance) throw new Error("statement repayment target must be between the minimum due and statement balance");
    return sanitized;
  }

  if (entity === "credit_card_transactions") {
    assertOnlyAllowed(payload, CREDIT_CARD_TRANSACTION_FIELDS);
    const sanitized = sanitizePayload(payload, CREDIT_CARD_TRANSACTION_FIELDS);
    requireString(sanitized, "transaction_id");
    requireString(sanitized, "account_id");
    requireString(sanitized, "cycle_id");
    requireString(sanitized, "purchase_type");
    if (sanitized.purchase_type !== "regular" && sanitized.purchase_type !== "installment") {
      throw new Error("purchase_type must be regular or installment");
    }
    if (sanitized.purchase_type === "installment") requireString(sanitized, "installment_id");
    if (sanitized.purchase_type === "regular" && sanitized.installment_id != null) throw new Error("regular purchases cannot reference an installment");
    requireIsoTimestamp(sanitized, "forecast_recorded_at");
    await verifyAccountOwnership(supabase, userId, sanitized.account_id as string);
    return sanitized;
  }

  if (entity === "income_sources") {
    assertOnlyAllowed(payload, INCOME_SOURCE_CREATE_FIELDS);
    const sanitized = sanitizePayload(payload, INCOME_SOURCE_CREATE_FIELDS);
    requireString(sanitized, "name");
    requireString(sanitized, "frequency");
    requireString(sanitized, "destination_account_id");
    requireString(sanitized, "subcategory_id");
    if (!INCOME_FREQUENCIES.includes(sanitized.frequency as string)) {
      throw new Error(`frequency must be one of: ${INCOME_FREQUENCIES.join(", ")}`);
    }
    requirePositiveInteger(sanitized, "expected_amount_centavos");
    optionalNumber(sanitized, "payday_day_of_month");
    optionalNumber(sanitized, "payday_second_day_of_month");
    optionalNumber(sanitized, "payday_day_of_week");
    optionalString(sanitized, "next_expected_date");
    optionalBoolean(sanitized, "is_active");
    optionalString(sanitized, "notes");
    optionalString(sanitized, "recurring_template_id");
    validateDayRange(sanitized, "payday_day_of_month", 1, 31);
    validateDayRange(sanitized, "payday_second_day_of_month", 1, 31);
    validateDayRange(sanitized, "payday_day_of_week", 0, 6);
     await verifyAccountOwnership(supabase, userId, sanitized.destination_account_id as string);
    await verifySubcategoryOwnership(supabase, userId, sanitized.subcategory_id as string, "income");
    if (sanitized.recurring_template_id !== undefined && sanitized.recurring_template_id !== null) {
      const { data: template, error: templateErr } = await supabase
        .from("recurring_transaction_templates")
        .select("id")
        .eq("id", sanitized.recurring_template_id as string)
        .eq("user_id", userId)
        .maybeSingle();
      if (templateErr) throw new Error(`recurring_template_id validation failed: ${templateErr.message}`);
      if (!template) throw new Error("recurring_template_id does not reference an accessible recurring template");
    }
    return Promise.resolve(sanitized);
  }

  if (entity === "financial_plans") {
    return validateFinancialPlanPayload(supabase, userId, payload);
  }

  if (entity === "recurring_transaction_templates") {
    assertOnlyAllowed(payload, RECURRING_TEMPLATE_FIELDS);
    const sanitized = sanitizePayload(payload, RECURRING_TEMPLATE_FIELDS);
    requireString(sanitized, "transaction_type");
    if (!VALID_TRANSACTION_TYPES.includes(sanitized.transaction_type as string)) {
      throw new Error(`transaction_type must be one of: ${VALID_TRANSACTION_TYPES.join(", ")}`);
    }
    requireString(sanitized, "name");
    requirePositiveInteger(sanitized, "amount_centavos");
    requireString(sanitized, "frequency");
    if (!["daily", "weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "yearly", "custom"].includes(sanitized.frequency as string)) {
      throw new Error("frequency must be a valid schedule");
    }
    requireString(sanitized, "starts_on");
    optionalString(sanitized, "ends_on");
    if (sanitized.interval_count != null) {
      if (typeof sanitized.interval_count !== "number" || !Number.isInteger(sanitized.interval_count) || (sanitized.interval_count as number) <= 0) {
        throw new Error("interval_count must be a positive integer");
      }
    }
    optionalNumber(sanitized, "day_of_month");
    optionalNumber(sanitized, "second_day_of_month");
    optionalNumber(sanitized, "day_of_week");
    validateDayRange(sanitized, "day_of_month", 1, 31);
    validateDayRange(sanitized, "second_day_of_month", 1, 31);
    validateDayRange(sanitized, "day_of_week", 0, 6);
    validateDateOrdering(sanitized, "starts_on", "ends_on");
    const transactionType = sanitized.transaction_type as string;
    optionalString(sanitized, "subcategory_id");
    optionalString(sanitized, "source_account_id");
    optionalString(sanitized, "destination_account_id");
    validateRecurringTemplateShape(sanitized, transactionType);
    if (sanitized.subcategory_id) {
      if (transactionType === "transfer") throw new Error("transfer templates cannot have a subcategory_id");
      await verifySubcategoryOwnership(supabase, userId, sanitized.subcategory_id as string, transactionType);
    }
    if (sanitized.source_account_id) await verifyAccountOwnership(supabase, userId, sanitized.source_account_id as string);
    if (sanitized.destination_account_id) await verifyAccountOwnership(supabase, userId, sanitized.destination_account_id as string);
    return sanitized;
  }

  if (entity === "recurring_transaction_occurrences") {
    assertOnlyAllowed(payload, RECURRING_OCCURRENCE_FIELDS);
    const sanitized = sanitizePayload(payload, RECURRING_OCCURRENCE_FIELDS);
    requireString(sanitized, "recurring_template_id");
    requireString(sanitized, "scheduled_date");
    const { data: template, error: templateErr } = await supabase
      .from("recurring_transaction_templates")
      .select("id")
      .eq("id", sanitized.recurring_template_id as string)
      .eq("user_id", userId)
      .eq("deleted", false)
      .maybeSingle();
    if (templateErr) throw new Error(`recurring template validation failed: ${templateErr.message}`);
    if (!template) throw new Error("recurring template not found or inaccessible");
    return sanitized;
  }
  if (entity === "alert_notification_preferences" || entity === "anomaly_whitelist_rules" || entity === "alert_suppression_rules") {
    const fields = entity === "alert_notification_preferences" ? ALERT_PREFERENCE_CREATE_FIELDS : entity === "anomaly_whitelist_rules" ? ANOMALY_WHITELIST_CREATE_FIELDS : ALERT_SUPPRESSION_CREATE_FIELDS;
    assertOnlyAllowed(payload, fields);
    const sanitized = sanitizePayload(payload, fields);
    if (entity === "alert_notification_preferences") requireString(sanitized, "category");
    if (entity === "anomaly_whitelist_rules") { requireString(sanitized, "merchant_name"); requireString(sanitized, "subcategory_id"); }
    if (entity === "alert_suppression_rules") { requireString(sanitized, "category"); requireString(sanitized, "reason"); }
    return sanitized;
  }
  if (entity === "anomaly_evaluations") {
    assertOnlyAllowed(payload, ANOMALY_EVALUATION_CREATE_FIELDS);
    const sanitized = sanitizePayload(payload, ANOMALY_EVALUATION_CREATE_FIELDS);
    requireString(sanitized, "transaction_id");
    requireString(sanitized, "subcategory_id");
    requirePositiveInteger(sanitized, "amount_centavos");
    requirePositiveInteger(sanitized, "usable_history_count");
    for (const field of ["usual_spending_centavos", "lower_bound_centavos", "upper_bound_centavos"]) optionalFiniteInteger(sanitized, field);
    optionalNumber(sanitized, "severity");
    requireString(sanitized, "model_version");
    requireString(sanitized, "evaluated_at");
    return sanitized;
  }

  throw new Error(`entity '${entity}' is not in the sync allowlist`);
}

async function validateTaxonomyCreatePayload(
  supabase: SupabaseClient,
  userId: string,
  entity: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (entity === "categories") {
    assertOnlyAllowed(payload, CATEGORY_CREATE_FIELDS);
    const sanitized = sanitizePayload(payload, CATEGORY_CREATE_FIELDS);
    requireString(sanitized, "slug");
    requireString(sanitized, "label");
    requireString(sanitized, "description");
    optionalString(sanitized, "short_label");
    validateTaxonomyVisuals(sanitized);
    optionalBoolean(sanitized, "is_filipino_context");
    optionalNumber(sanitized, "minimum_amount_centavos");
    optionalBoolean(sanitized, "always_in_budget");
    optionalNumber(sanitized, "fixed_amount_centavos");
    validateNonNegative(sanitized, ["minimum_amount_centavos", "fixed_amount_centavos"]);
    validateMinMaxOrdering(sanitized, "minimum_amount_centavos", "fixed_amount_centavos");
    optionalNumber(sanitized, "sort_order");

    return sanitized;
  }

  if (entity === "financial_accounts") {
    assertOnlyAllowed(payload, FINANCIAL_ACCOUNT_CREATE_FIELDS);
    const sanitized = sanitizePayload(payload, FINANCIAL_ACCOUNT_CREATE_FIELDS);
    requireString(sanitized, "name");
    requireString(sanitized, "kind");
    if (!VALID_ACCOUNT_KINDS.includes(sanitized.kind as string)) {
      throw new Error(`kind must be one of: ${VALID_ACCOUNT_KINDS.join(", ")}`);
    }
    optionalFiniteInteger(sanitized, "opening_balance_centavos");
    optionalBoolean(sanitized, "include_in_dashboard_balance");
    optionalString(sanitized, "institution_name");
    optionalString(sanitized, "opened_on");
    optionalNumber(sanitized, "sort_order");
    return sanitized;
  }

  if (entity === "transactions") {
    // Older clients briefly queued this UI-only routing context with the
    // transaction. It is not a transaction column and must not reach the RPC.
    const { debt_account_id: _debtAccountId, ...transactionPayload } = payload;
    payload = transactionPayload;
    assertOnlyAllowed(payload, TRANSACTION_CREATE_FIELDS);
    const sanitized = sanitizePayload(payload, TRANSACTION_CREATE_FIELDS);
    validateSavingsExpenseWithdrawalPayload(sanitized.savings_goal_withdrawals);
    validateSavingsGoalContributionPayload(sanitized.savings_goal_contribution);
    if (sanitized.savings_goal_withdrawals !== undefined && sanitized.transaction_type !== "expense") throw new Error("savings goal funding requires an expense");
    requireString(sanitized, "transaction_type");
    if (!VALID_TRANSACTION_TYPES.includes(sanitized.transaction_type as string)) {
      throw new Error(`transaction_type must be one of: ${VALID_TRANSACTION_TYPES.join(", ")}`);
    }
    requireString(sanitized, "transaction_date");
    requirePositiveInteger(sanitized, "amount_centavos");

    const txType = sanitized.transaction_type as string;
    if (sanitized.savings_goal_contribution !== undefined && txType !== "transfer") throw new Error("savings contribution requires a transfer");

    if (txType === "income") {
      requireString(sanitized, "destination_account_id");
      if (Boolean(sanitized.category_id) === Boolean(sanitized.subcategory_id)) throw new Error("income requires one category target");
      if (sanitized.source_account_id != null) throw new Error("source_account_id must not be set for income");
      await verifyOwnedAccount(supabase, userId, sanitized.destination_account_id as string);
      if (sanitized.category_id) await verifyCategoryOwnership(supabase, userId, sanitized.category_id as string); else await verifySubcategoryOwnership(supabase, userId, sanitized.subcategory_id as string, "income");
      sanitized.source_account_id = null;
    } else if (txType === "expense") {
      requireString(sanitized, "source_account_id");
      if (sanitized.category_id && sanitized.subcategory_id) throw new Error("expense takes at most one category target");
      if (sanitized.destination_account_id != null) throw new Error("destination_account_id must not be set for expense");
      await verifyOwnedAccount(supabase, userId, sanitized.source_account_id as string);
      if (sanitized.category_id) await verifyCategoryOwnership(supabase, userId, sanitized.category_id as string);
      else if (sanitized.subcategory_id) await verifySubcategoryOwnership(supabase, userId, sanitized.subcategory_id as string, "expense");
      else await verifyUncategorizedBillerPayment(supabase, userId, sanitized.client_mutation_id);
      sanitized.destination_account_id = null;
    } else {
      requireString(sanitized, "source_account_id");
      requireString(sanitized, "destination_account_id");
      if (sanitized.source_account_id === sanitized.destination_account_id && !sanitized.savings_goal_contribution) {
        throw new Error("source and destination accounts must differ");
      }
      if (sanitized.subcategory_id != null || sanitized.category_id != null) throw new Error("category target must not be set for transfer");
      await verifyOwnedAccount(supabase, userId, sanitized.source_account_id as string);
      await verifyOwnedAccount(supabase, userId, sanitized.destination_account_id as string);
      sanitized.subcategory_id = null;
      sanitized.category_id = null;
    }

    optionalString(sanitized, "merchant_name");
    optionalString(sanitized, "counterparty_name");
    optionalString(sanitized, "notes");
    return sanitized;
  }

  if (entity === "subcategories") {
    assertOnlyAllowed(payload, SUBCATEGORY_CREATE_FIELDS);
    const sanitized = sanitizePayload(payload, SUBCATEGORY_CREATE_FIELDS);
    requireString(sanitized, "kind");
    if (!["income", "expense", "transfer_adjustment"].includes(sanitized.kind as string)) {
      throw new Error("kind must be income, expense, or transfer_adjustment");
    }
    requireString(sanitized, "slug");
    requireString(sanitized, "label");
    requireString(sanitized, "description");
    optionalString(sanitized, "short_label");
    validateTaxonomyVisuals(sanitized);
    optionalBoolean(sanitized, "is_filipino_context");
    optionalBoolean(sanitized, "is_protected");
    optionalNumber(sanitized, "minimum_amount_centavos");
    optionalBoolean(sanitized, "always_in_budget");
    optionalNumber(sanitized, "fixed_amount_centavos");
    validateNonNegative(sanitized, ["minimum_amount_centavos", "fixed_amount_centavos"]);
    validateMinMaxOrdering(sanitized, "minimum_amount_centavos", "fixed_amount_centavos");
    optionalNumber(sanitized, "sort_order");

    if (sanitized.kind === "expense") {
      requireString(sanitized, "category_id");
      const { data: category, error } = await supabase
        .from("categories")
        .select("id")
        .eq("id", sanitized.category_id as string)
        .eq("deleted", false)
        .eq("is_active", true)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(`category_id validation failed: ${error.message}`);
      if (!category) throw new Error("category_id does not reference an accessible active category");
    } else if (sanitized.category_id !== undefined && sanitized.category_id !== null) {
      throw new Error("category_id must not be set for non-expense subcategories");
    }

    sanitized.category_id = sanitized.kind === "expense" ? sanitized.category_id : null;
    return sanitized;
  }

  if (entity === "recurring_transaction_templates") {
    assertOnlyAllowed(payload, RECURRING_TEMPLATE_FIELDS);
    const sanitized = sanitizePayload(payload, RECURRING_TEMPLATE_FIELDS);
    requireString(sanitized, "transaction_type");
    if (!VALID_TRANSACTION_TYPES.includes(sanitized.transaction_type as string)) {
      throw new Error(`transaction_type must be one of: ${VALID_TRANSACTION_TYPES.join(", ")}`);
    }
    requireString(sanitized, "name");
    requirePositiveInteger(sanitized, "amount_centavos");
    requireString(sanitized, "frequency");
    if (!["daily", "weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "yearly", "custom"].includes(sanitized.frequency as string)) {
      throw new Error("frequency must be a valid schedule");
    }
    requireString(sanitized, "starts_on");
    if (sanitized.interval_count != null) {
      if (typeof sanitized.interval_count !== "number" || !Number.isInteger(sanitized.interval_count) || (sanitized.interval_count as number) <= 0) {
        throw new Error("interval_count must be a positive integer");
      }
    }
    if (sanitized.subcategory_id) await verifySubcategoryOwnership(supabase, userId, sanitized.subcategory_id as string);
    if (sanitized.source_account_id) await verifyAccountOwnership(supabase, userId, sanitized.source_account_id as string);
    if (sanitized.destination_account_id) await verifyAccountOwnership(supabase, userId, sanitized.destination_account_id as string);
    return sanitized;
  }
  if (entity === "recurring_transaction_occurrences") {
    assertOnlyAllowed(payload, RECURRING_OCCURRENCE_FIELDS);
    const sanitized = sanitizePayload(payload, RECURRING_OCCURRENCE_FIELDS);
    requireString(sanitized, "recurring_template_id");
    requireString(sanitized, "scheduled_date");
    // ponytail: verify the template exists and belongs to this user
    const { data: template, error: templateErr } = await supabase
      .from("recurring_transaction_templates")
      .select("id")
      .eq("id", sanitized.recurring_template_id as string)
      .eq("user_id", userId)
      .eq("deleted", false)
      .maybeSingle();
    if (templateErr) throw new Error(`recurring template validation failed: ${templateErr.message}`);
    if (!template) throw new Error("recurring template not found or inaccessible");
    return sanitized;
  }

  throw new Error(`Unknown entity for create: ${entity}`);
}

async function validateUpdatePayload(
  supabase: SupabaseClient,
  userId: string,
  entity: string,
  recordId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (entity === "scheduled_payments") return validateScheduledPaymentPayload(payload, false);
  if (entity === "scheduled_payment_records") return validateScheduledPaymentRecordSettlement(payload);
  let allowedFields: Set<string>;
  if (entity === "categories") {
    allowedFields = CATEGORY_UPDATE_FIELDS;
  } else if (entity === "subcategories") {
    allowedFields = SUBCATEGORY_UPDATE_FIELDS;
  } else if (entity === "financial_accounts") {
    allowedFields = FINANCIAL_ACCOUNT_UPDATE_FIELDS;
  } else if (entity === "savings_account_details") {
    return validateSavingsAccountDetailsPayload(supabase, userId, payload, false, recordId);
  } else if (entity === "credit_card_cycles") {
    allowedFields = CREDIT_CARD_CYCLE_FIELDS;
  } else if (entity === "credit_card_statements") {
    allowedFields = CREDIT_CARD_STATEMENT_UPDATE_FIELDS;
  } else if (entity === "credit_card_payments") {
    allowedFields = CREDIT_CARD_PAYMENT_UPDATE_FIELDS;
  } else if (entity === "credit_card_details") {
    allowedFields = CREDIT_CARD_DETAILS_UPDATE_FIELDS;
  } else if (entity === "credit_card_repayment_preferences") {
    allowedFields = CREDIT_CARD_REPAYMENT_PREFERENCE_FIELDS;
  } else if (entity === "transactions") {
    allowedFields = TRANSACTION_UPDATE_FIELDS;
  } else if (entity === "income_sources") {
    allowedFields = INCOME_SOURCE_UPDATE_FIELDS;
  } else if (entity === "debt_accounts") {
    allowedFields = DEBT_ACCOUNT_FIELDS;
  } else if (entity === "savings_goals") {
    allowedFields = SAVINGS_GOAL_FIELDS;
  } else if (entity === "savings_allocation_preferences") {
    allowedFields = SAVINGS_ALLOCATION_PREFERENCE_FIELDS;
  } else if (entity === "debt_payments") {
    allowedFields = DEBT_PAYMENT_FIELDS;
  } else if (entity === "debt_strategy_preferences") {
    allowedFields = DEBT_STRATEGY_FIELDS;
  } else if (entity === "user_debt_priorities") {
    allowedFields = DEBT_PRIORITY_FIELDS;
  } else if (entity === "credit_card_settlements") {
    allowedFields = CREDIT_CARD_SETTLEMENT_FIELDS;
  } else if (entity === "credit_card_statement_strategies") {
    allowedFields = CREDIT_CARD_STATEMENT_STRATEGY_FIELDS;
  } else if (entity === "recurring_transaction_templates") {
    if (Object.prototype.hasOwnProperty.call(payload, "transaction_type")) {
      throw new Error("transaction_type is immutable for recurring transaction templates");
    }
    allowedFields = RECURRING_TEMPLATE_UPDATE_FIELDS;
  } else if (entity === "recurring_transaction_occurrences") {
    allowedFields = RECURRING_OCCURRENCE_FIELDS;
  } else if (entity === "financial_plans") {
    throw new Error("accepted Financial Plans are immutable");
  } else if (entity === "alert_notification_preferences" || entity === "anomaly_whitelist_rules" || entity === "alert_suppression_rules") {
    const fields = entity === "alert_notification_preferences" ? ALERT_PREFERENCE_UPDATE_FIELDS : entity === "anomaly_whitelist_rules" ? ANOMALY_WHITELIST_UPDATE_FIELDS : ALERT_SUPPRESSION_UPDATE_FIELDS;
    assertOnlyAllowed(payload, fields);
    return sanitizePayload(payload, fields);
  } else if (entity === "anomaly_evaluations") {
    // Scores stay immutable; only the user's answer may be recorded. Older apps send only
    // confirmed_recurring_at, which means frequent; confirmed_recurring_at only accompanies frequent.
    assertOnlyAllowed(payload, ANOMALY_EVALUATION_UPDATE_FIELDS);
    const sanitized = sanitizePayload(payload, ANOMALY_EVALUATION_UPDATE_FIELDS);
    if (sanitized.recurrence === undefined) {
      if (sanitized.recurrence_months !== undefined) throw new Error("recurrence_months must be distinct months from 1 to 12 on a yearly answer");
      requireIsoTimestamp(sanitized, "confirmed_recurring_at");
      return sanitized;
    }
    if (typeof sanitized.recurrence !== "string" || !ANOMALY_RECURRENCES.has(sanitized.recurrence)) {
      throw new Error("recurrence must be one_time, frequent, or yearly");
    }
    if (sanitized.recurrence === "frequent") requireIsoTimestamp(sanitized, "confirmed_recurring_at");
    else if (sanitized.confirmed_recurring_at !== undefined) throw new Error("confirmed_recurring_at is only recorded for frequent spending");
    if (sanitized.recurrence_months != null) {
      const months = normalizeRecurrenceMonths(sanitized.recurrence_months);
      if (sanitized.recurrence !== "yearly" || !months) throw new Error("recurrence_months must be distinct months from 1 to 12 on a yearly answer");
      sanitized.recurrence_months = months;
    }
    return sanitized;
  } else {
    throw new Error(`entity '${entity}' is not in the sync allowlist`);
  }

  assertOnlyAllowed(payload, allowedFields);
  const sanitized = sanitizePayload(payload, allowedFields);

  if (entity === "categories" || entity === "subcategories") {
    validateTaxonomyVisuals(sanitized);
  }

  if (entity === "debt_strategy_preferences") {
    if (sanitized.strategy !== "snowball" && sanitized.strategy !== "avalanche") throw new Error("strategy must be snowball or avalanche");
    return sanitized;
  }
  if (entity === "user_debt_priorities") {
    if (!Array.isArray(sanitized.priorities) || !sanitized.priorities.every((value) => typeof value === "string")) throw new Error("priorities must be debt IDs");
    return sanitized;
  }
  if (entity === "credit_card_settlements" || entity === "credit_card_statement_strategies") {
    return validateCreatePayload(supabase, userId, entity, sanitized);
  }

  if (entity === "credit_card_repayment_preferences") {
    if (sanitized.account_id !== undefined) {
      if (typeof sanitized.account_id !== "string") throw new Error("account_id must be a string");
      await verifyAccountOwnership(supabase, userId, sanitized.account_id);
    }
    if (sanitized.strategy !== undefined && !["pay_in_full", "pay_minimum", "percentage_of_statement", "custom_payment"].includes(sanitized.strategy as string)) throw new Error("repayment strategy is invalid");
    if (sanitized.custom_amount_centavos !== undefined && sanitized.custom_amount_centavos !== null) requirePositiveInteger(sanitized, "custom_amount_centavos");
    if (sanitized.percentage_bps !== undefined && sanitized.percentage_bps !== null && (!Number.isSafeInteger(sanitized.percentage_bps) || (sanitized.percentage_bps as number) < 1 || (sanitized.percentage_bps as number) > 10_000)) throw new Error("percentage_bps must be between 1 and 10000");
    return sanitized;
  }

  if (entity === "credit_card_cycles") {
    if (sanitized.account_id !== undefined) {
      if (typeof sanitized.account_id !== "string") throw new Error("account_id must be a string");
      await verifyAccountOwnership(supabase, userId, sanitized.account_id);
    }
    for (const field of ["cycle_start_date", "cutoff_date", "statement_date"]) {
      if (sanitized[field] !== undefined) requireDateString(sanitized, field);
    }
    if (sanitized.statement_date !== undefined) {
      const { data: statement, error } = await supabase
        .from("credit_card_statements")
        .select("id")
        .eq("cycle_id", recordId)
        .eq("user_id", userId)
        .eq("statement_date", sanitized.statement_date)
        .eq("deleted", false)
        .maybeSingle();
      if (error) throw new Error(`credit-card statement lookup failed: ${error.message}`);
      if (!statement) throw new Error("statement_date must match a recorded statement on this billing cycle");
    }
  } else if (entity === "credit_card_details" && sanitized.account_id !== undefined) {
    if (typeof sanitized.account_id !== "string") throw new Error("account_id must be a string");
    await verifyAccountOwnership(supabase, userId, sanitized.account_id);
  } else if (entity === "transactions") {
    validateSavingsExpenseWithdrawalPayload(sanitized.savings_goal_withdrawals);
    validateSavingsGoalContributionPayload(sanitized.savings_goal_contribution);
    for (const field of ["source_account_id", "destination_account_id"]) {
      const accountId = sanitized[field];
      if (accountId !== undefined && accountId !== null) {
        if (typeof accountId !== "string") throw new Error(`${field} must be a string or null`);
        await verifyAccountOwnership(supabase, userId, accountId);
      }
    }
  }

  if (entity === "credit_card_details" && sanitized.available_credit_centavos !== undefined && (!Number.isSafeInteger(sanitized.available_credit_centavos) || (sanitized.available_credit_centavos as number) < 0)) {
    throw new Error("available_credit_centavos must be non-negative");
  }
  if (entity === "credit_card_details") {
    if (sanitized.allows_extra_payments !== undefined && typeof sanitized.allows_extra_payments !== "boolean") throw new Error("allows_extra_payments must be a boolean");
    const anchorFields = ["available_credit_centavos", "reconciled_available_credit_centavos", "pre_reconciliation_available_credit_centavos", "available_credit_reconciled_at"];
    if (anchorFields.some((field) => sanitized[field] !== undefined)) {
      if (Object.keys(sanitized).length !== anchorFields.length || !anchorFields.every((field) => sanitized[field] !== undefined)) throw new Error("reconciliation anchors can only be updated together");
      for (const field of anchorFields.slice(0, 3)) if (!Number.isSafeInteger(sanitized[field]) || (sanitized[field] as number) < 0) throw new Error(`${field} must be a non-negative whole number`);
      requireIsoTimestamp(sanitized, "available_credit_reconciled_at");
    }
  }

  if (entity === "debt_accounts") {
    if (sanitized.linked_account_id != null) { if (typeof sanitized.linked_account_id !== "string") throw new Error("linked_account_id must be a string or null"); await verifyAccountOwnership(supabase, userId, sanitized.linked_account_id); }
    if (sanitized.name !== undefined && (typeof sanitized.name !== "string" || !sanitized.name.trim())) throw new Error("name must be a non-empty string");
    if (sanitized.preset_key !== undefined && !DEBT_ACCOUNT_TYPES.includes(sanitized.preset_key as string)) throw new Error("preset_key is not a supported non-credit-card debt type");
    if (sanitized.status !== undefined && !["active", "archived", "paid_off"].includes(sanitized.status as string)) throw new Error("status is invalid");
    if (sanitized.allows_extra_payments !== undefined && typeof sanitized.allows_extra_payments !== "boolean") throw new Error("allows_extra_payments must be a boolean");
    if (sanitized.preset_data !== undefined && (!sanitized.preset_data || typeof sanitized.preset_data !== "object" || Array.isArray(sanitized.preset_data))) throw new Error("preset_data must be an object");
    if (sanitized.preset_data !== undefined) await validateDebtPreset(supabase, userId, sanitized.preset_key as string | undefined, sanitized.preset_data as Record<string, unknown>);
    for (const [key, value] of Object.entries(sanitized)) {
      if (["original_balance_centavos", "current_balance_centavos", "annual_interest_rate_bps", "minimum_payment_centavos"].includes(key) && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) throw new Error(`${key} must be a non-negative whole number`);
      if (["lender_name", "maturity_date", "target_payoff_date", "interest_period", "interest_method", "notes", "next_due_date", "payment_frequency"].includes(key) && value !== null && typeof value !== "string") throw new Error(`${key} must be a string or null`);
    }
    return sanitized;
  }

  if (entity === "savings_goals") {
    return validateSavingsGoalPayload(sanitized, false, supabase, userId);
  }

  if (entity === "savings_allocation_preferences") {
    if (sanitized.strategy !== "snowball" && sanitized.strategy !== "avalanche") {
      throw new Error("strategy must be snowball or avalanche");
    }
    return sanitized;
  }

  if (entity === "credit_card_payments") {
    for (const [key, value] of Object.entries(sanitized)) {
      if (key === "amount_centavos") requirePositiveInteger(sanitized, key);
      else if (key === "payment_date") requireDateString(sanitized, key);
      else if (key === "forecast_recorded_at") requireIsoTimestamp(sanitized, key);
      else if (key === "source_account_id") {
        if (typeof value !== "string" || !value) throw new Error("source_account_id must be a non-empty string");
        await verifyAccountOwnership(supabase, userId, value);
      } else if (key === "notes" && value !== null && typeof value !== "string") {
        throw new Error("notes must be a string or null");
      }
    }
    return sanitized;
  }

  if (entity === "debt_payments") {
    for (const field of ["debt_account_id", "transaction_id", "source", "linked_transaction_type", "linked_source_account_id", "linked_subcategory_id"]) {
      if (sanitized[field] !== undefined) requireString(sanitized, field);
    }
    if (sanitized.payment_date !== undefined) requireDateString(sanitized, "payment_date");
    if (sanitized.amount_centavos !== undefined) requirePositiveInteger(sanitized, "amount_centavos");
    if (sanitized.principal_centavos !== undefined) requireBigInt(sanitized, "principal_centavos");
    if (sanitized.interest_centavos !== undefined) requireBigInt(sanitized, "interest_centavos");
    if (sanitized.notes !== undefined && sanitized.notes !== null && typeof sanitized.notes !== "string") throw new Error("notes must be a string or null");
    if (sanitized.source !== undefined && sanitized.source !== "transaction") throw new Error("debt payment must link an expense transaction");
    if (sanitized.linked_transaction_type !== undefined && sanitized.linked_transaction_type !== "expense") throw new Error("debt payment must link an expense transaction");
    return sanitized;
  }

  for (const [key, value] of Object.entries(sanitized)) {
    if (entity === "credit_card_cycles") {
       if (key === "statement_date" && value === null) continue;
       if (typeof value !== "string" || !value) throw new Error(`${key} must be a non-empty string`);
      continue;
    }
    if (entity === "credit_card_statements") {
      if (key === "statement_date" || key === "due_date") {
        if (typeof value !== "string" || !value) throw new Error(`${key} must be a non-empty string`);
        continue;
      }
      if (key === "statement_balance_centavos" || key === "minimum_due_centavos" || key === "finance_charge_centavos") {
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
          throw new Error(`${key} must be a non-negative whole number`);
        }
        continue;
      }
    }
    if (entity === "credit_card_details") {
      if (key === "account_id") {
        if (typeof value !== "string" || !value) throw new Error("account_id must be a non-empty string");
       } else if (["issuer", "notes"].includes(key)) {
         if (value !== null && typeof value !== "string") throw new Error(`${key} must be a string or null`);
       } else if (key === "available_credit_reconciled_at") {
         requireIsoTimestamp(sanitized, key);
       } else if (key === "cutoff_day" || key === "statement_day") {
         if (key === "statement_day" && value === null) continue;
        requireNumberInRange(sanitized, key, 1, 31);
      } else {
        optionalFiniteInteger(sanitized, key);
      }
      continue;
    }
    if (entity === "recurring_transaction_templates") {
      if (key === "subcategory_id" || key === "source_account_id" || key === "destination_account_id") {
        if (value !== null && typeof value !== "string") throw new Error(`${key} must be a string or null`);
        continue;
      }

      if (key === "interval_count") {
        requirePositiveInteger(sanitized, key);
        continue;
      }

      if (key === "amount_centavos") {
        requirePositiveInteger(sanitized, key);
        continue;
      }

      if (key === "day_of_month" || key === "second_day_of_month") {
        if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 31)) {
          throw new Error(`${key} must be between 1 and 31 or null`);
        }
        continue;
      }

      if (key === "day_of_week") {
        if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6)) {
          throw new Error("day_of_week must be between 0 and 6 or null");
        }
        continue;
      }
    }

    if (entity === "financial_accounts") {
      if (key === "name" || key === "institution_name" || key === "opened_on" || key === "archived_at") {
        if (value !== null && typeof value !== "string") throw new Error(`${key} must be a string or null`);
        continue;
      }
      if (key === "status") {
        if (typeof value !== "string") throw new Error("status must be a string");
        if (value === "deleted") throw new Error("status 'deleted' must use the delete operation");
        if (!["active", "archived"].includes(value)) throw new Error("status must be active or archived");
        continue;
      }
      if (key === "opening_balance_centavos" || key === "current_balance_centavos") {
        if (value != null) {
          if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
            throw new Error(`${key} must be a finite integer or null`);
          }
        }
        continue;
      }
      if (key === "sort_order") {
        if (typeof value !== "number") throw new Error("sort_order must be a number");
        continue;
      }
      if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
      continue;
    }

    if (entity === "transactions") {
      if (key === "amount_centavos") {
        if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
          throw new Error("amount_centavos must be a positive integer");
        }
        continue;
      }
      if (key === "subcategory_id" || key === "source_account_id" || key === "destination_account_id") {
        if (value !== null && typeof value !== "string") throw new Error(`${key} must be a string or null`);
        continue;
      }
      if (key === "transaction_date" || key === "merchant_name" || key === "counterparty_name" || key === "notes") {
        if (value !== null && typeof value !== "string") throw new Error(`${key} must be a string or null`);
        continue;
      }
      continue;
    }

    if (key === "label" || key === "description" || key === "name") {
      if (typeof value !== "string") throw new Error(`${key} must be a string`);
      continue;
    }

    if (key === "icon_key" || key === "color_hex") continue;

    if (key === "notes") {
      if (value !== null && typeof value !== "string") {
        throw new Error("notes must be a string or null");
      }
      continue;
    }

    if (key === "short_label" || key === "institution_name") {
      if (value !== null && typeof value !== "string") {
        throw new Error(`${key} must be a string or null`);
      }
      continue;
    }

    if (key === "slug" || key === "subcategory_id" || key === "source_account_id" || key === "destination_account_id") {
      if (typeof value !== "string") throw new Error(`${key} must be a string`);
      continue;
    }

    if (key === "recurring_template_id") {
      if (value !== null && typeof value !== "string") throw new Error("recurring_template_id must be a string or null");
      continue;
    }

    if (key === "payday_day_of_month" || key === "payday_second_day_of_month" || key === "payday_day_of_week") {
      if (value !== null && typeof value !== "number") throw new Error(`${key} must be a number or null`);
      continue;
    }

    if (key === "sort_order") {
      if (typeof value !== "number") throw new Error(`${key} must be a number`);
      continue;
    }

    if (key === "due_day_of_month" || key === "due_second_day_of_month" || key === "due_day_of_week" || key === "due_second_day_of_week" || key === "due_month") {
      if (value !== null && typeof value !== "number") throw new Error(`${key} must be a number or null`);
      continue;
    }

    if (key === "opening_balance_centavos" || key === "current_balance_centavos" || key === "amount_centavos") {
      if (typeof value !== "number") throw new Error(`${key} must be a number`);
      continue;
    }

    if (key === "expected_amount_centavos" || key === "minimum_amount_centavos" || key === "fixed_amount_centavos") {
      if (value !== null && value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
        throw new Error(`${key} must be a non-negative integer or null`);
      }
      continue;
    }

    if (key === "kind") {
      if (typeof value !== "string") throw new Error("kind must be a string");
      continue;
    }

    if (key === "status") {
      if (typeof value !== "string") throw new Error("status must be a string");
      if (value === "deleted") throw new Error("status 'deleted' must use the delete operation");
      continue;
    }

    if (key === "frequency") {
      if (typeof value !== "string") throw new Error("frequency must be a string");
      if (entity === "income_sources") {
        if (!INCOME_FREQUENCIES.includes(value as string)) {
          throw new Error("frequency must be a valid income frequency");
        }
      } else if (entity === "recurring_transaction_templates") {
        if (!["daily", "weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "yearly", "custom"].includes(value as string)) {
          throw new Error("frequency must be a valid recurring frequency");
        }
      }
      continue;
    }

    if (key === "opened_on" || key === "archived_at" || key === "starts_on" || key === "ends_on" || key === "next_expected_date") {
      if (value !== null && typeof value !== "string") {
        throw new Error(`${key} must be a string or null`);
      }
      continue;
    }

    if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
  }

  if (entity === "credit_card_statements") {
    const balance = sanitized.statement_balance_centavos as number | undefined;
    const minimum = sanitized.minimum_due_centavos as number | undefined;
    if (balance !== undefined && minimum !== undefined && minimum > balance) {
      throw new Error("minimum_due_centavos must be <= statement_balance_centavos");
    }
    const { data: statement, error } = await supabase
      .from("credit_card_statements")
      .select("cycle_id")
      .eq("id", recordId)
      .eq("user_id", userId)
      .eq("deleted", false)
      .maybeSingle();
    if (error) throw new Error(`credit-card statement lookup failed: ${error.message}`);
    if (!statement) throw new Error("credit-card statement not found or inaccessible");
    const statementDate = sanitized.statement_date as string | undefined;
    if (statementDate !== undefined) {
      const { data: cycle, error: cycleError } = await supabase
        .from("credit_card_cycles")
        .select("cycle_start_date")
        .eq("id", statement.cycle_id)
        .eq("user_id", userId)
        .eq("deleted", false)
        .maybeSingle();
      if (cycleError) throw new Error(`credit-card cycle lookup failed: ${cycleError.message}`);
      if (!cycle) throw new Error("credit-card statement cycle is invalid");
      const today = new Date().toISOString().slice(0, 10);
      if (statementDate <= cycle.cycle_start_date || statementDate > today) {
        throw new Error("statement_date must be after the billing cycle start and no later than today");
      }
    }
  }

  if (entity === "transactions") {
    const { data: current, error } = await supabase
      .from("transactions")
      .select("id, transaction_type")
      .eq("id", recordId)
      .eq("user_id", userId)
      .eq("deleted", false)
      .maybeSingle();
    if (error) throw new Error(`transaction lookup failed: ${error.message}`);
    if (!current) throw new Error("transaction not found or inaccessible");

    const txType = current.transaction_type as string;
    if (sanitized.savings_goal_contribution !== undefined && txType !== "transfer") throw new Error("savings contribution requires a transfer");
    if (sanitized.savings_goal_withdrawals !== undefined && txType !== "expense") throw new Error("savings goal funding requires an expense");
    const src = sanitized.source_account_id ?? undefined;
    const dst = sanitized.destination_account_id ?? undefined;
    const sub = sanitized.subcategory_id ?? undefined;

    if (txType === "income" || txType === "expense") {
      if (sub && typeof sub === "string") {
        await verifySubcategoryOwnership(supabase, userId, sub, txType);
      }
    }
    if (src && typeof src === "string") {
      await verifyAccountOwnership(supabase, userId, src);
    }
    if (dst && typeof dst === "string") {
      await verifyAccountOwnership(supabase, userId, dst);
    }
  }

  if (entity === "recurring_transaction_templates") {
    const { data: current, error } = await supabase
      .from("recurring_transaction_templates")
      .select("id, transaction_type, subcategory_id, source_account_id, destination_account_id, starts_on, ends_on")
      .eq("id", recordId)
      .eq("user_id", userId)
      .eq("deleted", false)
      .maybeSingle();
    if (error) throw new Error(`recurring template lookup failed: ${error.message}`);
    if (!current) throw new Error("recurring template not found or inaccessible");

    validateDateOrdering({ ...current, ...sanitized }, "starts_on", "ends_on");
    const transactionType = current.transaction_type as string;
    validateRecurringTemplateShape({ ...current, ...sanitized }, transactionType);
    const subcategoryId = sanitized.subcategory_id;
    if (subcategoryId !== undefined && subcategoryId !== null) {
      if (transactionType === "transfer") throw new Error("transfer templates cannot have a subcategory_id");
      await verifySubcategoryOwnership(supabase, userId, subcategoryId as string, transactionType);
    }
    for (const accountField of ["source_account_id", "destination_account_id"] as const) {
      const accountId = sanitized[accountField];
      if (accountId !== undefined && accountId !== null) {
        await verifyAccountOwnership(supabase, userId, accountId as string);
      }
    }
  }

  if (entity === "income_sources") {
    if (sanitized.expected_amount_centavos !== undefined) requirePositiveInteger(sanitized, "expected_amount_centavos");
    const dayFields = ["payday_day_of_month", "payday_second_day_of_month"] as const;
    for (const f of dayFields) {
      if (typeof sanitized[f] === "number" && ((sanitized[f] as number) < 1 || (sanitized[f] as number) > 31)) {
        throw new Error(`${f} must be between 1 and 31`);
      }
    }
    if (typeof sanitized.payday_day_of_week === "number" && ((sanitized.payday_day_of_week as number) < 0 || (sanitized.payday_day_of_week as number) > 6)) {
      throw new Error("payday_day_of_week must be between 0 and 6");
    }
    if (sanitized.destination_account_id && typeof sanitized.destination_account_id === "string") {
      await verifyAccountOwnership(supabase, userId, sanitized.destination_account_id);
    }
    if (sanitized.subcategory_id && typeof sanitized.subcategory_id === "string") {
      await verifySubcategoryOwnership(supabase, userId, sanitized.subcategory_id, "income");
    }
    if (sanitized.recurring_template_id && typeof sanitized.recurring_template_id === "string") {
      const { data: template, error: templateErr } = await supabase
        .from("recurring_transaction_templates")
        .select("id")
        .eq("id", sanitized.recurring_template_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (templateErr) throw new Error(`recurring_template_id validation failed: ${templateErr.message}`);
      if (!template) throw new Error("recurring_template_id does not reference an accessible recurring template");
    }
  }

  if (entity === "recurring_transaction_templates") {
    const src = sanitized.source_account_id;
    const dst = sanitized.destination_account_id;
    const sub = sanitized.subcategory_id;
    if (src && typeof src === "string") await verifyAccountOwnership(supabase, userId, src);
    if (dst && typeof dst === "string") await verifyAccountOwnership(supabase, userId, dst);
    if (sub && typeof sub === "string") await verifySubcategoryOwnership(supabase, userId, sub);
  }

  if (entity === "recurring_transaction_occurrences") {
    const tid = sanitized.generated_transaction_id;
    if (tid && typeof tid === "string") {
      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .select("id")
        .eq("id", tid)
        .eq("user_id", userId)
        .eq("deleted", false)
        .maybeSingle();
      if (txErr) throw new Error(`transaction lookup failed: ${txErr.message}`);
      if (!tx) throw new Error("generated_transaction_id not found or inaccessible");
    }
  }

  return sanitized;
}

function opFields(payload: Record<string, unknown>, fields: Set<string>): string[] {
  return Object.keys(payload).filter((field) => fields.has(field));
}

function assertOnlyAllowed(payload: Record<string, unknown>, allowedFields: Set<string>): void {
  for (const key of Object.keys(payload)) {
    if (!SERVER_COLUMNS.has(key) && !allowedFields.has(key)) {
      throw new Error(`${key} is not syncable`);
    }
  }
}

async function validateFinancialPlanPayload(
  supabase: SupabaseClient,
  userId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertOnlyAllowed(payload, FINANCIAL_PLAN_CREATE_FIELDS);
  const sanitized = sanitizePayload(payload, FINANCIAL_PLAN_CREATE_FIELDS);
  for (const field of ["period_start", "period_end"]) requireDateString(sanitized, field);
  const start = sanitized.period_start as string;
  const end = sanitized.period_end as string;
  // A plan accepted offline near month end may sync after the month rolls over, so the month that just ended is also accepted.
  const currentPeriod = currentFinancialPlanPeriod();
  const previousPeriod = currentFinancialPlanPeriod(new Date(Date.parse(`${currentPeriod.start}T00:00:00Z`) - 86_400_000));
  if (![currentPeriod, previousPeriod].some((period) => start === period.start && end === period.end)) throw new Error("Financial Plans can only cover the current calendar month or the one that just ended");
  if (sanitized.status !== "accepted") throw new Error("only accepted Financial Plans can sync");
  const inputSnapshot = sanitized.input_snapshot;
  if (!inputSnapshot || typeof inputSnapshot !== "object" || Array.isArray(inputSnapshot)) throw new Error("input_snapshot must be an object");
  for (const field of ["forecast", "restrictions", "obligations", "debtRequirements", "savingsRequirements", "classification"]) {
    const value = (inputSnapshot as Record<string, unknown>)[field];
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value as Record<string, unknown>).length === 0) throw new Error(`input_snapshot.${field} must contain plan input data`);
  }
  const recommendation = sanitized.recommendation;
  if (!recommendation || typeof recommendation !== "object" || Array.isArray(recommendation)) throw new Error("recommendation must be an object");
  const recommendationDocument = recommendation as Record<string, unknown>;
  let advisoryDebtId: string | null = null;
  let advisorySavingsGoalId: string | null = null;
  if (recommendationDocument.surplusRecommendation !== undefined) {
    const surplusRecommendation = recommendationDocument.surplusRecommendation;
    if (!surplusRecommendation || typeof surplusRecommendation !== "object" || Array.isArray(surplusRecommendation)) throw new Error("surplusRecommendation must be an object");
    const document = surplusRecommendation as Record<string, unknown>;
    assertPlanAmount(document, "unallocatedSurplusCentavos");
    if (!["NEGATIVE_FINANCIAL_MARGIN", "EMERGENCY_FUND_INADEQUATE", "DEBT_SIGNAL", "CREDIT_CARD_SIGNAL", "REWARD_YOURSELF", "USER_DIRECTED", "ASSESSMENT_UNAVAILABLE", "ASSESSMENT_STALE", "ASSESSMENT_INSUFFICIENT_DATA"].includes(document.reasonCode as string)) throw new Error("surplusRecommendation reason code is invalid");
    if (!["applied", "unavailable", "stale", "insufficient_data"].includes(document.assessmentStatus as string)) throw new Error("surplusRecommendation assessment status is invalid");
    const destination = document.advisoryDestination;
    if (destination !== null) {
      if (!destination || typeof destination !== "object" || Array.isArray(destination)) throw new Error("surplusRecommendation destination is invalid");
      const target = destination as Record<string, unknown>;
      if (target.type === "debt") {
        requireString(target, "debtAccountId");
        advisoryDebtId = target.debtAccountId as string;
      } else if (target.type === "emergency_fund") {
        requireString(target, "savingsGoalId");
        advisorySavingsGoalId = target.savingsGoalId as string;
      } else if (target.type === "credit_card") {
        requireString(target, "accountId");
        await verifyAccountOwnership(supabase, userId, target.accountId as string);
      } else throw new Error("surplusRecommendation destination is invalid");
    }
  }
  for (const field of ["debtSurplusCentavos", "savingsSurplusCentavos"]) {
    if (recommendationDocument[field] !== undefined) assertPlanAmount(recommendationDocument, field);
  }
  for (const field of ["allocations", "debtReservations", "savingsReservations"]) {
    if (!Array.isArray(recommendationDocument[field]) || (recommendationDocument[field] as unknown[]).length > 200) throw new Error(`recommendation.${field} must be a bounded array`);
  }
  for (const allocation of recommendationDocument.allocations as Record<string, unknown>[]) {
    const categoryId = allocation.categoryId; const subcategoryId = allocation.subcategoryId;
    if (Boolean(categoryId) === Boolean(subcategoryId)) throw new Error("each Financial Plan allocation must reference one category or subcategory");
    if (!["FIXED", "MINIMUM", "FLEXIBLE"].includes(allocation.allocationRule as string)) throw new Error("Financial Plan allocation rule is invalid");
    assertPlanAmount(allocation, "allocatedAmountCentavos"); assertPlanAmount(allocation, "floorAmountCentavos");
    if ((allocation.allocatedAmountCentavos as number) < (allocation.floorAmountCentavos as number)) throw new Error("Financial Plan allocation does not meet its floor");
    if (allocation.ceilingAmountCentavos != null) { assertPlanAmount(allocation, "ceilingAmountCentavos"); if ((allocation.ceilingAmountCentavos as number) < (allocation.allocatedAmountCentavos as number)) throw new Error("Financial Plan allocation exceeds its ceiling"); }
    if (allocation.subcategoryWeightBps != null && (!Number.isSafeInteger(allocation.subcategoryWeightBps) || (allocation.subcategoryWeightBps as number) < 0 || (allocation.subcategoryWeightBps as number) > 10_000)) throw new Error("Financial Plan subcategory weight must be between 0 and 10000 basis points");
  }
  assertPlanAmount(recommendationDocument, "availableFundsCentavos");
  const totalAllocatedFunds = (recommendationDocument.allocations as Record<string, unknown>[]).reduce((total, allocation) => total + (allocation.allocatedAmountCentavos as number), 0) + (recommendationDocument.debtSurplusCentavos as number | undefined ?? 0) + (recommendationDocument.savingsSurplusCentavos as number | undefined ?? 0);
  if (totalAllocatedFunds > (recommendationDocument.availableFundsCentavos as number)) {
    throw new Error("Financial Plan allocations and surplus exceed available funds");
  }
  for (const reservation of recommendationDocument.debtReservations as Record<string, unknown>[]) {
    if (Boolean(reservation.debtAccountId) === Boolean(reservation.creditCardStatementId)) throw new Error("each debt reservation must reference one debt or statement"); assertPlanAmount(reservation, "amountCentavos");
  }
  for (const reservation of recommendationDocument.savingsReservations as Record<string, unknown>[]) {
    requireString(reservation, "savingsGoalId"); assertPlanAmount(reservation, "amountCentavos");
  }
  const plannedAmount = (inputSnapshot as Record<string, unknown>).plannedAmountCentavos;
  // Older immutable plans did not snapshot the planning amount.
  if (plannedAmount !== undefined) {
    if (!Number.isSafeInteger(plannedAmount) || (plannedAmount as number) <= 0) throw new Error("Financial Plan planning amount is invalid");
    const obligations = ((inputSnapshot as Record<string, unknown>).obligations as Record<string, unknown>).reservations;
    const scheduledTotal = Array.isArray(obligations) ? obligations.reduce((total: number, row: Record<string, unknown>) => {
      assertPlanAmount(row, "amountCentavos");
      return total + (row.amountCentavos as number);
    }, 0) : 0;
    const committed = [...recommendationDocument.debtReservations as Record<string, unknown>[], ...recommendationDocument.savingsReservations as Record<string, unknown>[]].reduce((total, row) => total + (row.amountCentavos as number), scheduledTotal);
    if ((recommendationDocument.availableFundsCentavos as number) + committed > (plannedAmount as number) + 0.001) throw new Error("Financial Plan commitments exceed the planning amount");
  }
  const allocations = recommendationDocument.allocations as Record<string, unknown>[];
  const categoryIds = allocations.flatMap((allocation) => typeof allocation.categoryId === "string" ? [allocation.categoryId] : []);
  const subcategoryIds = allocations.flatMap((allocation) => typeof allocation.subcategoryId === "string" ? [allocation.subcategoryId] : []);
  const allocationTargets = allocations.map((allocation) => typeof allocation.categoryId === "string" ? `category:${allocation.categoryId}` : `subcategory:${allocation.subcategoryId}`);
  if (new Set(allocationTargets).size !== allocationTargets.length) throw new Error("Financial Plan allocations cannot target the same category or subcategory twice");
  await verifyFinancialPlanAllocationReferences(supabase, userId, categoryIds, subcategoryIds);
  const debtReservations = recommendationDocument.debtReservations as Record<string, unknown>[];
  const debtIds = [...debtReservations.flatMap((reservation) => typeof reservation.debtAccountId === "string" ? [reservation.debtAccountId] : []), ...(advisoryDebtId ? [advisoryDebtId] : [])];
  const statementIds = debtReservations.flatMap((reservation) => typeof reservation.creditCardStatementId === "string" ? [reservation.creditCardStatementId] : []);
  const savingsGoalIds = [...(recommendationDocument.savingsReservations as Record<string, unknown>[]).map((reservation) => reservation.savingsGoalId as string), ...(advisorySavingsGoalId ? [advisorySavingsGoalId] : [])];
  const [debts, statements, goals] = await Promise.all([
    debtIds.length ? supabase.from("debt_accounts").select("id").in("id", [...new Set(debtIds)]).eq("user_id", userId).eq("deleted", false) : Promise.resolve({ data: [], error: null }),
    statementIds.length ? supabase.from("credit_card_statements").select("id").in("id", [...new Set(statementIds)]).eq("user_id", userId).eq("deleted", false) : Promise.resolve({ data: [], error: null }),
    savingsGoalIds.length ? supabase.from("savings_goals").select("id").in("id", [...new Set(savingsGoalIds)]).eq("user_id", userId).eq("deleted", false) : Promise.resolve({ data: [], error: null }),
  ]);
  if (debts.error || statements.error || goals.error) throw new Error("Financial Plan reservation validation failed");
  if ((debts.data?.length ?? 0) !== new Set(debtIds).size || (statements.data?.length ?? 0) !== new Set(statementIds).size || (goals.data?.length ?? 0) !== new Set(savingsGoalIds).size) throw new Error("Financial Plan reservation is not accessible");
  return sanitized;
}

function assertPlanAmount(payload: Record<string, unknown>, field: string): void {
  if (typeof payload[field] !== "number" || !Number.isFinite(payload[field]) || (payload[field] as number) < 0 || (payload[field] as number) > Number.MAX_SAFE_INTEGER) throw new Error(`${field} must be a finite non-negative amount`);
}

function currentFinancialPlanPeriod(now = new Date()): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function requireString(payload: Record<string, unknown>, field: string): void {
  if (!payload[field] || typeof payload[field] !== "string") throw new Error(`${field} is required`);
}

function validateTaxonomyVisuals(payload: Record<string, unknown>): void {
  if (payload.icon_key !== undefined && (typeof payload.icon_key !== "string" || !TAXONOMY_ICON_KEYS.has(payload.icon_key))) {
    throw new Error("icon_key is invalid");
  }
  if (payload.color_hex !== undefined && (typeof payload.color_hex !== "string" || !COLOR_HEX_PATTERN.test(payload.color_hex))) {
    throw new Error("color_hex must be a six-digit hex color");
  }
}

async function validateDebtPreset(supabase: SupabaseClient, userId: string, presetKey: string | undefined, preset: Record<string, unknown>): Promise<void> {
  const salary = preset.salaryLoan as Record<string, unknown> | undefined;
  if (presetKey === "salary_loan" || salary !== undefined) {
    if (!salary || !["sss", "gsis", "pag_ibig", "other"].includes(salary.provider as string)) throw new Error("salary loan provider is invalid");
    if (!["payroll_deduction", "automatic_debit", "manual_payment", "other"].includes(salary.repaymentMethod as string)) throw new Error("salary loan repayment method is invalid");
    if (salary.repaymentMethod === "payroll_deduction") {
      if (!Number.isSafeInteger(salary.deductionAmountCentavos) || (salary.deductionAmountCentavos as number) <= 0) throw new Error("salary loan deduction amount must be positive");
      if (!["weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "custom"].includes(salary.deductionSchedule as string)) throw new Error("salary loan deduction schedule is invalid");
    }
  }
  await verifyDebtPresetReferences(supabase, userId, { preset_data: preset });
}

async function verifyDebtPresetReferences(supabase: SupabaseClient, userId: string, payload: Record<string, unknown>): Promise<void> {
  const preset = payload.preset_data as Record<string, unknown>;
  if (!preset) return;
  const salary = preset.salaryLoan as Record<string, unknown> | undefined;
  const business = preset.businessLoan as Record<string, unknown> | undefined;
  const sourceId = salary?.linkedIncomeSourceId ?? business?.linkedBusinessOrIncomeSourceId;
  if (!sourceId) return;
  if (typeof sourceId !== "string") throw new Error("linked income source must be a string");
  const { data, error } = await supabase.from("income_sources").select("id").eq("id", sourceId).eq("user_id", userId).eq("deleted", false).maybeSingle();
  if (error) throw new Error(`income source validation failed: ${error.message}`);
  if (!data) throw new Error("linked income source is not accessible");
}

function requireDateString(payload: Record<string, unknown>, field: string): void {
  if (typeof payload[field] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload[field] as string)) {
    throw new Error(`${field} must be a valid YYYY-MM-DD date`);
  }
  if (Number.isNaN(parseDateString(payload[field] as string).getTime())) {
    throw new Error(`${field} must be a valid calendar date`);
  }
}

function requireIsoTimestamp(payload: Record<string, unknown>, field: string): void {
  const value = payload[field];
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    throw new Error(`${field} must be an ISO-8601 timestamp`);
  }
}

function parseDateString(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== value) return new Date(NaN);
  return date;
}

function optionalString(payload: Record<string, unknown>, field: string): void {
  if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] !== "string") {
    throw new Error(`${field} must be a string or null`);
  }
}

function optionalBoolean(payload: Record<string, unknown>, field: string): void {
  if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] !== "boolean") {
    throw new Error(`${field} must be a boolean or null`);
  }
}

function optionalNumber(payload: Record<string, unknown>, field: string): void {
  if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] !== "number") {
    throw new Error(`${field} must be a number or null`);
  }
}

function requireBigInt(payload: Record<string, unknown>, field: string): void {
  if (payload[field] === undefined || payload[field] === null || typeof payload[field] !== "number") {
    throw new Error(`${field} is required and must be a number`);
  }
}

function optionalBigInt(payload: Record<string, unknown>, field: string): void {
  if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] !== "number") {
    throw new Error(`${field} must be a number or null`);
  }
}

function validateNonNegative(payload: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    const val = payload[field];
    if (val !== undefined && val !== null && typeof val === "number" && val < 0) {
      throw new Error(`${field} must be >= 0`);
    }
  }
}

function validateMinMaxOrdering(payload: Record<string, unknown>, minField: string, maxField: string): void {
  const minVal = payload[minField] as number | undefined;
  const maxVal = payload[maxField] as number | undefined;
  if (minVal !== undefined && minVal !== null && maxVal !== undefined && maxVal !== null && minVal > maxVal) {
    throw new Error(`${minField} must be <= ${maxField}`);
  }
}

function validateDayRange(payload: Record<string, unknown>, field: string, lo: number, hi: number): void {
  const val = payload[field];
  if (val !== undefined && val !== null && typeof val === "number") {
    if (val < lo || val > hi) throw new Error(`${field} must be between ${lo} and ${hi}`);
  }
}

function validateDateOrdering(payload: Record<string, unknown>, startField: string, endField: string): void {
  const starts = payload[startField] as string | undefined;
  const ends = payload[endField] as string | undefined;
  if (starts !== undefined && starts !== null && ends !== undefined && ends !== null && starts > ends) {
    throw new Error(`${startField} must be <= ${endField}`);
  }
}

function filterPayloadFields(
  payload: Record<string, unknown>,
  changedFields: string[],
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const field of changedFields) {
    if (field in payload) {
      filtered[field] = payload[field];
    }
  }
  return filtered;
}

function requirePositiveInteger(payload: Record<string, unknown>, field: string): void {
  const v = payload[field];
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

// Only a biller or remittance payment may be an uncategorized expense. Its client_mutation_id names the
// scheduled payment it pays (scheduledPaymentMutationId on the device), which must belong to the user.
const BILLER_PAYMENT_MUTATION = /^scheduled-payment:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):/i;

async function verifyUncategorizedBillerPayment(supabase: SupabaseClient, userId: string, clientMutationId: unknown): Promise<void> {
  const scheduledPaymentId = typeof clientMutationId === "string" ? BILLER_PAYMENT_MUTATION.exec(clientMutationId)?.[1] : undefined;
  if (!scheduledPaymentId) throw new Error("expense requires a category unless it pays a biller or remittance");
  const { data, error } = await supabase
    .from("scheduled_payments")
    .select("id")
    .eq("id", scheduledPaymentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`biller validation failed: ${error.message}`);
  if (!data) throw new Error("biller or remittance not found or inaccessible");
}

// Ownership of the subcategory, account, scheduled payment and transaction is checked by the sync RPC.
function validateScheduledPaymentPayload(payload: Record<string, unknown>, creating: boolean): Record<string, unknown> {
  assertOnlyAllowed(payload, SCHEDULED_PAYMENT_FIELDS);
  const sanitized = sanitizePayload(payload, SCHEDULED_PAYMENT_FIELDS);
  if (creating) {
    for (const field of ["name", "source_account_id", "frequency", "starts_on"]) requireString(sanitized, field);
    requirePositiveInteger(sanitized, "amount_centavos");
    if (sanitized.status !== undefined) throw new Error("new scheduled payments are always active");
  }
  for (const field of ["name", "source_account_id", "frequency"]) if (sanitized[field] !== undefined) requireString(sanitized, field);
  // The category is optional; null clears it.
  if (sanitized.subcategory_id != null) requireString(sanitized, "subcategory_id");
  if (sanitized.amount_centavos !== undefined) requirePositiveInteger(sanitized, "amount_centavos");
  if (sanitized.frequency !== undefined && !SCHEDULED_PAYMENT_FREQUENCIES.includes(sanitized.frequency as string)) throw new Error("frequency is not a supported schedule");
  if (sanitized.status !== undefined && sanitized.status !== "active" && sanitized.status !== "archived") throw new Error("status must be active or archived");
  for (const field of ["due_day_of_month", "due_second_day_of_month", "due_day_of_week", "due_month"]) optionalNumber(sanitized, field);
  validateDayRange(sanitized, "due_day_of_month", 1, 31);
  validateDayRange(sanitized, "due_second_day_of_month", 1, 31);
  validateDayRange(sanitized, "due_day_of_week", 0, 6);
  validateDayRange(sanitized, "due_month", 1, 12);
  if (sanitized.starts_on !== undefined) requireDateString(sanitized, "starts_on");
  for (const field of ["ends_on", "auto_post_from"]) if (sanitized[field] != null) requireDateString(sanitized, field);
  validateDateOrdering(sanitized, "starts_on", "ends_on");
  for (const field of ["auto_post", "is_family_support", "is_dependent_support", "protected_by_default"]) optionalBoolean(sanitized, field);
  optionalString(sanitized, "notes");
  return sanitized;
}

function validateScheduledPaymentRecordPayload(payload: Record<string, unknown>): Record<string, unknown> {
  assertOnlyAllowed(payload, SCHEDULED_PAYMENT_RECORD_FIELDS);
  const sanitized = sanitizePayload(payload, SCHEDULED_PAYMENT_RECORD_FIELDS);
  for (const field of ["scheduled_payment_id", "transaction_id"]) requireString(sanitized, field);
  for (const field of ["occurrence_date", "payment_date"]) requireDateString(sanitized, field);
  requirePositiveInteger(sanitized, "amount_centavos");
  if (sanitized.source !== undefined && sanitized.source !== "manual" && sanitized.source !== "auto") throw new Error("source must be manual or auto");
  optionalString(sanitized, "notes");
  return sanitized;
}

// Settling the occurrence in full is the only change a payment record accepts; anything else is delete and record again.
function validateScheduledPaymentRecordSettlement(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizePayload(payload, SCHEDULED_PAYMENT_RECORD_SETTLEMENT_FIELDS);
  if (Object.keys(payload).some((key) => !SERVER_COLUMNS.has(key) && !SCHEDULED_PAYMENT_RECORD_SETTLEMENT_FIELDS.has(key)) ||typeof sanitized.settles_occurrence !== "boolean") {
    throw new Error("payment records only update settles_occurrence; delete and record again");
  }
  return sanitized;
}

async function validateSavingsGoalPayload(payload: Record<string, unknown>, creating: boolean, supabase: SupabaseClient, userId: string): Promise<Record<string, unknown>> {
  assertOnlyAllowed(payload, SAVINGS_GOAL_FIELDS);
  const sanitized = sanitizePayload(payload, SAVINGS_GOAL_FIELDS);
  if (creating) {
    for (const field of ["linked_account_id", "name", "goal_type", "target_amount_centavos", "starting_amount_centavos", "target_date", "priority", "planned_contribution_amount_centavos", "contribution_frequency", "next_contribution_date"]) {
      if (!(field in sanitized)) throw new Error(`${field} is required`);
    }
  }
  if (sanitized.name !== undefined && (typeof sanitized.name !== "string" || !sanitized.name.trim())) throw new Error("name must be a non-empty string");
  if (sanitized.is_emergency_fund !== undefined && typeof sanitized.is_emergency_fund !== "boolean") throw new Error("is_emergency_fund must be boolean");
  if (typeof sanitized.name === "string") sanitized.name = sanitized.name.trim();
  if (sanitized.goal_type !== undefined && !SAVINGS_GOAL_TYPES.includes(sanitized.goal_type as string)) throw new Error("goal_type is invalid");
  if (sanitized.priority !== undefined && !SAVINGS_GOAL_PRIORITIES.includes(sanitized.priority as string)) throw new Error("priority is invalid");
  if (sanitized.status !== undefined && !["active", "archived"].includes(sanitized.status as string)) throw new Error("status is invalid");
  if (sanitized.archived_at !== undefined && sanitized.archived_at !== null) requireIsoTimestamp(sanitized, "archived_at");
  if (sanitized.target_amount_centavos !== undefined) requirePositiveInteger(sanitized, "target_amount_centavos");
  for (const field of ["starting_amount_centavos", "emergency_fund_baseline_centavos", "auto_save_amount_centavos", "planned_contribution_amount_centavos", "interest_rate_bps", "contribution_interval_count", "contribution_day_of_month", "contribution_second_day_of_month", "contribution_day_of_week", "custom_interval_days"]) {
    const value = sanitized[field];
    if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || (value as number) < 0)) throw new Error(`${field} must be a non-negative whole number`);
  }
  if (sanitized.target_date !== undefined && sanitized.target_date !== null) requireDateString(sanitized, "target_date");
  if (sanitized.next_contribution_date !== undefined && sanitized.next_contribution_date !== null) requireDateString(sanitized, "next_contribution_date");
  if (sanitized.contribution_frequency !== undefined && sanitized.contribution_frequency !== null && !SAVINGS_GOAL_CONTRIBUTION_FREQUENCIES.includes(sanitized.contribution_frequency as string)) throw new Error("contribution_frequency is invalid");
  if (sanitized.contribution_interval_count !== undefined && sanitized.contribution_interval_count !== null) requirePositiveInteger(sanitized, "contribution_interval_count");
  for (const field of ["contribution_day_of_month", "contribution_second_day_of_month"]) {
    if (sanitized[field] !== undefined && sanitized[field] !== null) requireNumberInRange(sanitized, field, 1, 31);
  }
  if (sanitized.contribution_day_of_week !== undefined && sanitized.contribution_day_of_week !== null) requireNumberInRange(sanitized, "contribution_day_of_week", 0, 6);
  if (sanitized.custom_interval_days !== undefined && sanitized.custom_interval_days !== null) requirePositiveInteger(sanitized, "custom_interval_days");
  if (creating && sanitized.contribution_frequency != null && sanitized.next_contribution_date == null) throw new Error("next_contribution_date is required for scheduled contributions");
  if (sanitized.contribution_frequency === null && (sanitized.next_contribution_date != null || (sanitized.planned_contribution_amount_centavos != null && sanitized.planned_contribution_amount_centavos !== 0))) throw new Error("unscheduled goals must have no next contribution date and zero planned contribution");
  if (creating && (sanitized.next_contribution_date as string) > (sanitized.target_date as string)) throw new Error("next_contribution_date must be on or before target_date");
  if (sanitized.notes !== undefined && sanitized.notes !== null && (typeof sanitized.notes !== "string" || sanitized.notes.length > 1_000)) throw new Error("notes must be 1000 characters or fewer");
  if (sanitized.emergency_fund_target_method !== undefined && !["fixed_amount", "essential_expense_coverage"].includes(sanitized.emergency_fund_target_method as string)) throw new Error("emergency_fund_target_method is invalid");
  if (sanitized.essential_expense_coverage_months !== undefined && sanitized.essential_expense_coverage_months !== null) requireNumberInRange(sanitized, "essential_expense_coverage_months", 3, 6);
  if (creating || sanitized.linked_account_id !== undefined) {
    requireString(sanitized, "linked_account_id");
    const { data: account, error } = await supabase.from("financial_accounts").select("id")
      .eq("id", sanitized.linked_account_id as string).eq("user_id", userId).eq("deleted", false).eq("status", "active").maybeSingle();
    if (error || !account) throw new Error("linked account must be an active financial account owned by the user");
  }
  return sanitized;
}

async function validateSavingsAccountDetailsPayload(
  supabase: SupabaseClient,
  userId: string,
  payload: Record<string, unknown>,
  creating: boolean,
  accountId: string | undefined,
): Promise<Record<string, unknown>> {
  assertOnlyAllowed(payload, SAVINGS_ACCOUNT_DETAIL_FIELDS);
  const sanitized = sanitizePayload(payload, SAVINGS_ACCOUNT_DETAIL_FIELDS);
  if (sanitized.interest_reference !== undefined) sanitized.interest_reference = normalizeSavingsInterestReference(sanitized.interest_reference);
  if (creating && sanitized.account_type === undefined) throw new Error("account_type is required");
  if (sanitized.account_type !== undefined && !["personal_savings", "high_yield_savings", "time_deposit"].includes(sanitized.account_type as string)) throw new Error("savings account type is invalid");
  for (const field of ["interest_rate_bps", "minimum_balance_centavos", "base_interest_rate_bps", "effective_interest_rate_bps", "boosted_interest_rate_bps", "maximum_eligible_balance_centavos", "required_deposit_centavos", "direct_deposit_threshold_centavos", "promotional_interest_rate_bps", "planned_contribution_amount_centavos"]) {
    if (sanitized[field] !== undefined && sanitized[field] !== null && (!Number.isSafeInteger(sanitized[field]) || (sanitized[field] as number) < 0)) throw new Error(`${field} must be a non-negative whole number`);
  }
  if (sanitized.principal_centavos !== undefined && sanitized.principal_centavos !== null) requirePositiveInteger(sanitized, "principal_centavos");
  if (sanitized.maturity_date !== undefined && sanitized.maturity_date !== null) requireDateString(sanitized, "maturity_date");
  if (sanitized.term_months !== undefined && sanitized.term_months !== null) requirePositiveInteger(sanitized, "term_months");
  for (const field of ["interest_conditions", "early_withdrawal_rule"]) {
    if (sanitized[field] !== undefined && sanitized[field] !== null && (typeof sanitized[field] !== "string" || (sanitized[field] as string).trim().length === 0 || (sanitized[field] as string).length > 1_000)) throw new Error(`${field} must be a non-empty string of 1000 characters or fewer`);
  }
  if (sanitized.higher_rate_eligible !== undefined && sanitized.higher_rate_eligible !== null && typeof sanitized.higher_rate_eligible !== "boolean") throw new Error("higher_rate_eligible must be a boolean or null");
  if (sanitized.interest_calculation_basis !== undefined && sanitized.interest_calculation_basis !== null && !["daily_ending_balance", "average_daily_balance", "monthly_average_balance"].includes(sanitized.interest_calculation_basis as string)) throw new Error("interest_calculation_basis is invalid");
  if (sanitized.interest_credit_frequency !== undefined && sanitized.interest_credit_frequency !== null && !["monthly", "quarterly", "at_maturity"].includes(sanitized.interest_credit_frequency as string)) throw new Error("interest_credit_frequency is invalid");
  for (const field of ["required_deposit_frequency", "required_transaction_period", "qualification_period"]) if (sanitized[field] !== undefined && sanitized[field] !== null && !["monthly", "quarterly", "custom"].includes(sanitized[field] as string)) throw new Error(`${field} is invalid`);
  if (sanitized.required_transaction_count !== undefined && sanitized.required_transaction_count !== null) requirePositiveInteger(sanitized, "required_transaction_count");
  for (const field of ["promotion_start_date", "promotion_end_date"]) if (sanitized[field] !== undefined && sanitized[field] !== null) requireDateString(sanitized, field);
  if (sanitized.promotion_start_date != null && sanitized.promotion_end_date != null && (sanitized.promotion_end_date as string) < (sanitized.promotion_start_date as string)) throw new Error("promotion_end_date must be on or after promotion_start_date");
  if (sanitized.balance_tiers !== undefined && sanitized.balance_tiers !== null && (!Array.isArray(sanitized.balance_tiers) || sanitized.balance_tiers.some((tier) => !tier || typeof tier !== "object"))) throw new Error("balance_tiers is invalid");
  if (sanitized.contribution_frequency !== undefined && sanitized.contribution_frequency !== null && !SAVINGS_GOAL_CONTRIBUTION_FREQUENCIES.includes(sanitized.contribution_frequency as string)) throw new Error("contribution_frequency is invalid");
  if (sanitized.contribution_interval_count !== undefined && sanitized.contribution_interval_count !== null) requirePositiveInteger(sanitized, "contribution_interval_count");
  for (const field of ["contribution_day_of_month", "contribution_second_day_of_month"]) if (sanitized[field] !== undefined && sanitized[field] !== null) requireNumberInRange(sanitized, field, 1, 31);
  if (sanitized.contribution_day_of_week !== undefined && sanitized.contribution_day_of_week !== null) requireNumberInRange(sanitized, "contribution_day_of_week", 0, 6);
  if (sanitized.custom_interval_days !== undefined && sanitized.custom_interval_days !== null) requirePositiveInteger(sanitized, "custom_interval_days");
  if (sanitized.next_contribution_date !== undefined && sanitized.next_contribution_date !== null) requireDateString(sanitized, "next_contribution_date");
  if (creating) {
    if (sanitized.account_type === "high_yield_savings" && (sanitized.interest_calculation_basis == null || sanitized.interest_credit_frequency == null)) throw new Error("HYSA requires calculation basis and credit frequency");
    if (sanitized.account_type === "time_deposit" && (sanitized.principal_centavos == null || sanitized.maturity_date == null || sanitized.term_months == null || sanitized.early_withdrawal_rule == null)) throw new Error("Time Deposit requires principal, maturity date, term, and an early-withdrawal rule");
    const scheduleFields = ["planned_contribution_amount_centavos", "contribution_frequency", "next_contribution_date"];
    const hasContributionSchedule = scheduleFields.some((field) => sanitized[field] != null);
    if (sanitized.account_type !== "time_deposit" && hasContributionSchedule && scheduleFields.some((field) => sanitized[field] == null)) throw new Error("Savings contribution schedule is incomplete");
  }
  if (accountId) {
    const { data: account, error } = await supabase.from("financial_accounts").select("id, opened_on").eq("id", accountId).eq("user_id", userId).eq("kind", "savings").eq("deleted", false).maybeSingle();
    if (error) throw new Error(`savings account validation failed: ${error.message}`);
    if (!account) throw new Error("savings account details require an owned savings account");
    if (creating && sanitized.account_type === "time_deposit" && account.opened_on && (sanitized.maturity_date as string) <= account.opened_on) throw new Error("Time Deposit maturity date must be after its start date");
  }
  return sanitized;
}

function requireNumberInRange(payload: Record<string, unknown>, field: string, min: number, max: number): void {
  const value = payload[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
}

function validateOptionalRange(payload: Record<string, unknown>, field: string, min: number, max: number): void {
  if (payload[field] !== undefined && payload[field] !== null) requireNumberInRange(payload, field, min, max);
}

function validateRecurringTemplateShape(payload: Record<string, unknown>, transactionType: string): void {
  const source = payload.source_account_id;
  const destination = payload.destination_account_id;
  const subcategory = payload.subcategory_id;

  if (transactionType === "income") {
    requireString(payload, "destination_account_id");
    requireString(payload, "subcategory_id");
    if (source !== undefined && source !== null) throw new Error("income templates cannot have a source_account_id");
    return;
  }

  if (transactionType === "expense") {
    requireString(payload, "source_account_id");
    requireString(payload, "subcategory_id");
    if (destination !== undefined && destination !== null) throw new Error("expense templates cannot have a destination_account_id");
    return;
  }

  requireString(payload, "source_account_id");
  requireString(payload, "destination_account_id");
  if (source === destination) throw new Error("transfer templates require distinct source and destination accounts");
  if (subcategory !== undefined && subcategory !== null) throw new Error("transfer templates cannot have a subcategory_id");
}

function optionalFiniteInteger(payload: Record<string, unknown>, field: string): void {
  const v = payload[field];
  if (v !== undefined && v !== null) {
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
      throw new Error(`${field} must be a finite integer or null`);
    }
  }
}

async function verifyOwnedAccount(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`account validation failed: ${error.message}`);
  if (!data) throw new Error("account not found or inaccessible");
}

async function verifyAccountOwnership(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("deleted", false)
    .maybeSingle();
  if (error) throw new Error(`account validation failed: ${error.message}`);
  if (!data) throw new Error("account not found or inaccessible");
}

async function verifyStatementCycle(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
  statementDate: string,
): Promise<void> {
  const { data: cycle, error } = await supabase
    .from("credit_card_cycles")
    .select("id, cycle_start_date, statement_date, account_id")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .eq("deleted", false)
    .maybeSingle();
  if (error) throw new Error(`credit-card cycle validation failed: ${error.message}`);
  const today = new Date().toISOString().slice(0, 10);
  if (!cycle || cycle.statement_date !== null || statementDate <= cycle.cycle_start_date || statementDate > today) {
    throw new Error("credit-card statement cycle is invalid");
  }
  const { data: account, error: accountError } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("id", cycle.account_id)
    .eq("user_id", userId)
    .eq("kind", "credit_card")
    .eq("deleted", false)
    .maybeSingle();
  if (accountError) throw new Error(`credit-card account validation failed: ${accountError.message}`);
  if (!account) throw new Error("credit-card statement cycle is invalid");
}

async function verifyCreditCardPaymentReferences(
  supabase: SupabaseClient,
  userId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: statement, error: statementError } = await supabase
    .from("credit_card_statements")
    .select("id, authoritative, statement_balance_centavos")
    .eq("id", payload.statement_id as string)
    .eq("cycle_id", payload.cycle_id as string)
    .eq("user_id", userId)
    .eq("deleted", false)
    .maybeSingle();
  if (statementError) throw new Error(`credit-card statement validation failed: ${statementError.message}`);
  if (!statement || statement.authoritative !== true) throw new Error("payment must reference an authoritative statement in its billing cycle");
  if ((payload.amount_centavos as number) > statement.statement_balance_centavos) throw new Error("payment amount cannot exceed the statement balance");

  const { data: source, error: sourceError } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("id", payload.source_account_id as string)
    .eq("user_id", userId)
    .neq("kind", "credit_card")
    .eq("status", "active")
    .eq("deleted", false)
    .maybeSingle();
  if (sourceError) throw new Error(`payment source-account validation failed: ${sourceError.message}`);
  if (!source) throw new Error("payment source account must be an active non-credit-card account");

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .select("id")
    .eq("id", payload.transaction_id as string)
    .eq("user_id", userId)
    .eq("transaction_type", "expense")
    .eq("source_account_id", payload.source_account_id as string)
    .eq("amount_centavos", payload.amount_centavos as number)
    .eq("deleted", false)
    .maybeSingle();
  if (transactionError) throw new Error(`payment transaction validation failed: ${transactionError.message}`);
  if (!transaction) throw new Error("payment transaction must match its amount and source account");
}

async function verifyCategoryOwnership(
  supabase: SupabaseClient,
  userId: string,
  categoryId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("deleted", false)
    .eq("is_active", true)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`category validation failed: ${error.message}`);
  if (!data) throw new Error("category not found or inaccessible");
}

async function verifyFinancialPlanAllocationReferences(
  supabase: SupabaseClient,
  userId: string,
  categoryIds: string[],
  subcategoryIds: string[],
): Promise<void> {
  const [categories, subcategories] = await Promise.all([
    categoryIds.length ? supabase.from("categories").select("id").in("id", [...new Set(categoryIds)]).eq("deleted", false).eq("is_active", true).eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
    subcategoryIds.length ? supabase.from("subcategories").select("id, category_id").in("id", [...new Set(subcategoryIds)]).eq("deleted", false).eq("is_active", true).eq("kind", "expense").eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
  ]);
  if (categories.error) throw new Error(`category validation failed: ${categories.error.message}`);
  if (subcategories.error) throw new Error(`subcategory validation failed: ${subcategories.error.message}`);
  if ((categories.data?.length ?? 0) !== new Set(categoryIds).size || (subcategories.data?.length ?? 0) !== new Set(subcategoryIds).size) throw new Error("Financial Plan allocation reference is not accessible");
  const selectedCategoryIds = new Set(categoryIds);
  if ((subcategories.data ?? []).some((subcategory) => selectedCategoryIds.has(subcategory.category_id))) throw new Error("Financial Plan cannot allocate both a category and one of its subcategories");
}

async function verifySubcategoryOwnership(
  supabase: SupabaseClient,
  userId: string,
  subcategoryId: string,
  kind?: string,
): Promise<void> {
  let query = supabase
    .from("subcategories")
    .select("id")
    .eq("id", subcategoryId)
    .eq("deleted", false)
    .eq("is_active", true)
    .eq("user_id", userId);

  if (kind) {
    query = query.eq("kind", kind);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`subcategory validation failed: ${error.message}`);
  if (!data) throw new Error("subcategory not found or inaccessible");
}
