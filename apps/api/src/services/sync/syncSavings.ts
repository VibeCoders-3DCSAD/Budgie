import { SYNC_RPCS } from "./constants/entities.js";
import {
  SAVINGS_ALLOCATION_PREFERENCE_FIELDS,
  SAVINGS_GOAL_ACTIVITY_FIELDS,
  SAVINGS_GOAL_CONTRIBUTION_FREQUENCIES,
  SAVINGS_GOAL_FIELDS,
  SAVINGS_GOAL_PRIORITIES,
  SAVINGS_GOAL_TYPES,
} from "./constants/savings.js";
import {
  allowedPayload,
  optionalString,
  requireDateString,
  requireIsoTimestamp,
  requireNumberInRange,
  requirePositiveInteger,
  requireString,
  type EntitySyncTable,
  type Payload,
  type SyncContext,
} from "./syncValidation.js";

async function validateSavingsGoal({ supabase, userId }: SyncContext, payload: Payload, creating: boolean): Promise<Payload> {
  const sanitized = allowedPayload(payload, SAVINGS_GOAL_FIELDS);
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

async function validateSavingsGoalActivityCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, SAVINGS_GOAL_ACTIVITY_FIELDS);
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

function validateSavingsAllocationPreference(payload: Payload): Payload {
  const sanitized = allowedPayload(payload, SAVINGS_ALLOCATION_PREFERENCE_FIELDS);
  if (sanitized.strategy !== "snowball" && sanitized.strategy !== "avalanche") throw new Error("strategy must be snowball or avalanche");
  return sanitized;
}

export const syncSavings: EntitySyncTable = {
  savings_goals: {
    rpc: SYNC_RPCS.default,
    create: (ctx, payload) => validateSavingsGoal(ctx, payload, true),
    update: (ctx, payload) => validateSavingsGoal(ctx, payload, false),
  },
  savings_goal_activities: { rpc: SYNC_RPCS.default, create: validateSavingsGoalActivityCreate },
  savings_allocation_preferences: {
    rpc: SYNC_RPCS.default,
    create: (_ctx, payload) => validateSavingsAllocationPreference(payload),
    update: (_ctx, payload) => validateSavingsAllocationPreference(payload),
  },
};
