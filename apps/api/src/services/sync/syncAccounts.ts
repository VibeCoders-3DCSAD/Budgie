import { normalizeSavingsInterestReference } from "@odin/savings-interest";
import { SYNC_RPCS } from "./constants/entities.js";
import {
  FINANCIAL_ACCOUNT_CREATE_FIELDS,
  FINANCIAL_ACCOUNT_UPDATE_FIELDS,
  SAVINGS_ACCOUNT_DETAIL_FIELDS,
  VALID_ACCOUNT_KINDS,
} from "./constants/accounts.js";
import { SAVINGS_GOAL_CONTRIBUTION_FREQUENCIES } from "./constants/savings.js";
import {
  allowedPayload,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireDateString,
  requireNumberInRange,
  requirePositiveInteger,
  requireString,
  type EntitySyncTable,
  type Payload,
  type SyncContext,
} from "./syncValidation.js";
import { requireOwnedRow } from "./syncOwnership.js";

function validateFinancialAccountCreate(payload: Payload): Payload {
  const sanitized = allowedPayload(payload, FINANCIAL_ACCOUNT_CREATE_FIELDS);
  requireString(sanitized, "name");
  requireString(sanitized, "kind");
  if (!VALID_ACCOUNT_KINDS.includes(sanitized.kind as string)) {
    throw new Error(`kind must be one of: ${VALID_ACCOUNT_KINDS.join(", ")}`);
  }
  optionalNumber(sanitized, "opening_balance_centavos");
  optionalBoolean(sanitized, "include_in_dashboard_balance");
  optionalString(sanitized, "institution_name");
  optionalString(sanitized, "opened_on");
  optionalNumber(sanitized, "sort_order");
  return sanitized;
}

function validateFinancialAccountUpdate(payload: Payload): Payload {
  const sanitized = allowedPayload(payload, FINANCIAL_ACCOUNT_UPDATE_FIELDS);
  for (const [key, value] of Object.entries(sanitized)) {
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
  }
  return sanitized;
}

async function validateSavingsAccountDetails(
  { supabase, userId, recordId: accountId }: SyncContext,
  payload: Payload,
  creating: boolean,
): Promise<Payload> {
  const sanitized = allowedPayload(payload, SAVINGS_ACCOUNT_DETAIL_FIELDS);
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
    const account = await requireOwnedRow<{ opened_on: string | null }>(supabase, userId, { table: "financial_accounts", match: { id: accountId, kind: "savings" }, select: "id, opened_on", errorPrefix: "savings account validation", notFound: "savings account details require an owned savings account" });
    if (creating && sanitized.account_type === "time_deposit" && account.opened_on && (sanitized.maturity_date as string) <= account.opened_on) throw new Error("Time Deposit maturity date must be after its start date");
  }
  return sanitized;
}

export const syncAccounts: EntitySyncTable = {
  financial_accounts: {
    rpc: SYNC_RPCS.default,
    create: (_ctx, payload) => validateFinancialAccountCreate(payload),
    update: (_ctx, payload) => validateFinancialAccountUpdate(payload),
  },
  savings_account_details: {
    rpc: SYNC_RPCS.default,
    create: (ctx, payload) => validateSavingsAccountDetails(ctx, payload, true),
    update: (ctx, payload) => validateSavingsAccountDetails(ctx, payload, false),
  },
};
