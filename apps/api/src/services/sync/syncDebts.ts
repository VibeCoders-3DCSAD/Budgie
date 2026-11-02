import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEBT_ACCOUNT_FIELDS,
  DEBT_ACCOUNT_TYPES,
  DEBT_PAYMENT_FIELDS,
  DEBT_PRIORITY_FIELDS,
  DEBT_STRATEGY_FIELDS,
} from "./constants/debts.js";
import { verifyAccountOwnership } from "./syncOwnership.js";
import {
  allowedPayload,
  optionalString,
  requireBigInt,
  requireDateString,
  requirePositiveInteger,
  requireString,
  type EntitySyncTable,
  type Payload,
  type SyncContext,
} from "./syncValidation.js";

async function validateDebtPreset(supabase: SupabaseClient, userId: string, presetKey: string | undefined, preset: Payload): Promise<void> {
  const salary = preset.salaryLoan as Payload | undefined;
  if (presetKey === "salary_loan" || salary !== undefined) {
    if (!salary || !["sss", "gsis", "pag_ibig", "other"].includes(salary.provider as string)) throw new Error("salary loan provider is invalid");
    if (!["payroll_deduction", "automatic_debit", "manual_payment", "other"].includes(salary.repaymentMethod as string)) throw new Error("salary loan repayment method is invalid");
    if (salary.repaymentMethod === "payroll_deduction") {
      if (!Number.isSafeInteger(salary.deductionAmountCentavos) || (salary.deductionAmountCentavos as number) <= 0) throw new Error("salary loan deduction amount must be positive");
      if (!["weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "custom"].includes(salary.deductionSchedule as string)) throw new Error("salary loan deduction schedule is invalid");
    }
  }
  await verifyDebtPresetReferences(supabase, userId, preset);
}

async function verifyDebtPresetReferences(supabase: SupabaseClient, userId: string, preset: Payload): Promise<void> {
  if (!preset) return;
  const salary = preset.salaryLoan as Payload | undefined;
  const business = preset.businessLoan as Payload | undefined;
  const sourceId = salary?.linkedIncomeSourceId ?? business?.linkedBusinessOrIncomeSourceId;
  if (!sourceId) return;
  if (typeof sourceId !== "string") throw new Error("linked income source must be a string");
  const { data, error } = await supabase.from("income_sources").select("id").eq("id", sourceId).eq("user_id", userId).eq("deleted", false).maybeSingle();
  if (error) throw new Error(`income source validation failed: ${error.message}`);
  if (!data) throw new Error("linked income source is not accessible");
}

async function validateDebtAccountCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, DEBT_ACCOUNT_FIELDS);
  for (const field of ["name", "preset_key", "status", "payment_frequency", "next_due_date"]) requireString(sanitized, field);
  for (const field of ["original_balance_centavos", "current_balance_centavos", "annual_interest_rate_bps", "minimum_payment_centavos"]) requireBigInt(sanitized, field);
  if (!DEBT_ACCOUNT_TYPES.includes(sanitized.preset_key as string)) throw new Error("preset_key is not a supported non-credit-card debt type");
  if (sanitized.status !== "active") throw new Error("new debt accounts must be active");
  if ((sanitized.current_balance_centavos as number) > (sanitized.original_balance_centavos as number)) throw new Error("current_balance_centavos must not exceed original_balance_centavos");
  if (!sanitized.preset_data || typeof sanitized.preset_data !== "object" || Array.isArray(sanitized.preset_data)) throw new Error("preset_data must be an object");
  for (const field of ["lender_name", "maturity_date", "target_payoff_date", "interest_period", "interest_method", "notes"]) optionalString(sanitized, field);
  if (sanitized.allows_extra_payments !== undefined && typeof sanitized.allows_extra_payments !== "boolean") throw new Error("allows_extra_payments must be a boolean");
  if (sanitized.linked_account_id != null) { requireString(sanitized, "linked_account_id"); await verifyAccountOwnership(supabase, userId, sanitized.linked_account_id as string); }
  await validateDebtPreset(supabase, userId, sanitized.preset_key as string, sanitized.preset_data as Payload);
  return sanitized;
}

async function validateDebtAccountUpdate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, DEBT_ACCOUNT_FIELDS);
  if (sanitized.linked_account_id != null) { if (typeof sanitized.linked_account_id !== "string") throw new Error("linked_account_id must be a string or null"); await verifyAccountOwnership(supabase, userId, sanitized.linked_account_id); }
  if (sanitized.name !== undefined && (typeof sanitized.name !== "string" || !sanitized.name.trim())) throw new Error("name must be a non-empty string");
  if (sanitized.preset_key !== undefined && !DEBT_ACCOUNT_TYPES.includes(sanitized.preset_key as string)) throw new Error("preset_key is not a supported non-credit-card debt type");
  if (sanitized.status !== undefined && !["active", "archived", "paid_off"].includes(sanitized.status as string)) throw new Error("status is invalid");
  if (sanitized.allows_extra_payments !== undefined && typeof sanitized.allows_extra_payments !== "boolean") throw new Error("allows_extra_payments must be a boolean");
  if (sanitized.preset_data !== undefined && (!sanitized.preset_data || typeof sanitized.preset_data !== "object" || Array.isArray(sanitized.preset_data))) throw new Error("preset_data must be an object");
  if (sanitized.preset_data !== undefined) await validateDebtPreset(supabase, userId, sanitized.preset_key as string | undefined, sanitized.preset_data as Payload);
  for (const [key, value] of Object.entries(sanitized)) {
    if (["original_balance_centavos", "current_balance_centavos", "annual_interest_rate_bps", "minimum_payment_centavos"].includes(key) && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) throw new Error(`${key} must be a non-negative whole number`);
    if (["lender_name", "maturity_date", "target_payoff_date", "interest_period", "interest_method", "notes", "next_due_date", "payment_frequency"].includes(key) && value !== null && typeof value !== "string") throw new Error(`${key} must be a string or null`);
  }
  return sanitized;
}

function validateDebtPaymentCreate(payload: Payload): Payload {
  const sanitized = allowedPayload(payload, DEBT_PAYMENT_FIELDS);
  for (const field of ["debt_account_id", "transaction_id", "source", "payment_date", "linked_transaction_type", "linked_source_account_id", "linked_subcategory_id"]) requireString(sanitized, field);
  requirePositiveInteger(sanitized, "amount_centavos");
  requireBigInt(sanitized, "principal_centavos");
  requireBigInt(sanitized, "interest_centavos");
  if (sanitized.source !== "transaction" || sanitized.linked_transaction_type !== "expense") throw new Error("debt payment must link an expense transaction");
  return sanitized;
}

function validateDebtPaymentUpdate(payload: Payload): Payload {
  const sanitized = allowedPayload(payload, DEBT_PAYMENT_FIELDS);
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

function validateDebtStrategy(payload: Payload): Payload {
  const sanitized = allowedPayload(payload, DEBT_STRATEGY_FIELDS);
  if (sanitized.strategy !== "snowball" && sanitized.strategy !== "avalanche") throw new Error("strategy must be snowball or avalanche");
  return sanitized;
}

function validateDebtPriorities(payload: Payload): Payload {
  const sanitized = allowedPayload(payload, DEBT_PRIORITY_FIELDS);
  if (!Array.isArray(sanitized.priorities) || !sanitized.priorities.every((value) => typeof value === "string")) throw new Error("priorities must be debt IDs");
  return sanitized;
}

export const syncDebts: EntitySyncTable = {
  debt_accounts: { create: validateDebtAccountCreate, update: validateDebtAccountUpdate },
  debt_payments: {
    create: (_ctx, payload) => validateDebtPaymentCreate(payload),
    update: (_ctx, payload) => validateDebtPaymentUpdate(payload),
  },
  debt_strategy_preferences: {
    create: (_ctx, payload) => validateDebtStrategy(payload),
    update: (_ctx, payload) => validateDebtStrategy(payload),
  },
  user_debt_priorities: {
    create: (_ctx, payload) => validateDebtPriorities(payload),
    update: (_ctx, payload) => validateDebtPriorities(payload),
  },
};
