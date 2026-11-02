import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CREDIT_CARD_CYCLE_CREATE_FIELDS,
  CREDIT_CARD_CYCLE_FIELDS,
  CREDIT_CARD_DETAILS_CREATE_FIELDS,
  CREDIT_CARD_DETAILS_UPDATE_FIELDS,
  CREDIT_CARD_INSTALLMENT_CREATE_FIELDS,
  CREDIT_CARD_PAYMENT_CREATE_FIELDS,
  CREDIT_CARD_PAYMENT_UPDATE_FIELDS,
  CREDIT_CARD_REPAYMENT_PREFERENCE_FIELDS,
  CREDIT_CARD_SETTLEMENT_FIELDS,
  CREDIT_CARD_STATEMENT_CREATE_FIELDS,
  CREDIT_CARD_STATEMENT_STRATEGY_FIELDS,
  CREDIT_CARD_STATEMENT_UPDATE_FIELDS,
  CREDIT_CARD_TRANSACTION_FIELDS,
} from "./constants/creditCards.js";
import { verifyAccountOwnership } from "./syncOwnership.js";
import {
  allowedPayload,
  optionalFiniteInteger,
  optionalString,
  requireBigInt,
  requireDateString,
  requireIsoTimestamp,
  requireNumberInRange,
  requirePositiveInteger,
  requireString,
  validateDateOrdering,
  validateOptionalRange,
  validateUpdateFieldType,
  type EntitySyncTable,
  type Payload,
  type SyncContext,
} from "./syncValidation.js";

const REPAYMENT_STRATEGIES = ["pay_in_full", "pay_minimum", "percentage_of_statement", "custom_payment"];

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
  payload: Payload,
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

async function verifyOptionalAccountId({ supabase, userId }: SyncContext, sanitized: Payload): Promise<void> {
  if (sanitized.account_id === undefined) return;
  if (typeof sanitized.account_id !== "string") throw new Error("account_id must be a string");
  await verifyAccountOwnership(supabase, userId, sanitized.account_id);
}

async function validateCycleCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_CYCLE_CREATE_FIELDS);
  requireString(sanitized, "account_id");
  requireString(sanitized, "cycle_start_date");
  requireString(sanitized, "cutoff_date");
  requireDateString(sanitized, "cycle_start_date");
  requireDateString(sanitized, "cutoff_date");
  validateDateOrdering(sanitized, "cycle_start_date", "cutoff_date");
  await verifyAccountOwnership(supabase, userId, sanitized.account_id as string);
  return sanitized;
}

async function validateCycleUpdate(ctx: SyncContext, payload: Payload): Promise<Payload> {
  const { supabase, userId, recordId } = ctx;
  const sanitized = allowedPayload(payload, CREDIT_CARD_CYCLE_FIELDS);
  await verifyOptionalAccountId(ctx, sanitized);
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
  for (const [key, value] of Object.entries(sanitized)) {
    if (key === "statement_date" && value === null) continue;
    if (typeof value !== "string" || !value) throw new Error(`${key} must be a non-empty string`);
  }
  return sanitized;
}

async function validateStatementCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_STATEMENT_CREATE_FIELDS);
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

async function validateStatementUpdate({ supabase, userId, recordId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_STATEMENT_UPDATE_FIELDS);
  for (const [key, value] of Object.entries(sanitized)) {
    if (key === "statement_date" || key === "due_date") {
      if (typeof value !== "string" || !value) throw new Error(`${key} must be a non-empty string`);
    } else if (key === "statement_balance_centavos" || key === "minimum_due_centavos" || key === "finance_charge_centavos") {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${key} must be a non-negative whole number`);
      }
    } else {
      validateUpdateFieldType(key, value);
    }
  }

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
  return sanitized;
}

async function validatePaymentCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_PAYMENT_CREATE_FIELDS);
  for (const field of ["cycle_id", "statement_id", "transaction_id", "source_account_id", "client_mutation_id"]) requireString(sanitized, field);
  requireDateString(sanitized, "payment_date");
  requireIsoTimestamp(sanitized, "forecast_recorded_at");
  requirePositiveInteger(sanitized, "amount_centavos");
  optionalString(sanitized, "notes");
  await verifyCreditCardPaymentReferences(supabase, userId, sanitized);
  sanitized.issuer_recognized = false;
  return sanitized;
}

async function validatePaymentUpdate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_PAYMENT_UPDATE_FIELDS);
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

async function validateDetailsCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_DETAILS_CREATE_FIELDS);
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

async function validateDetailsUpdate(ctx: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_DETAILS_UPDATE_FIELDS);
  await verifyOptionalAccountId(ctx, sanitized);
  if (sanitized.available_credit_centavos !== undefined && (!Number.isSafeInteger(sanitized.available_credit_centavos) || (sanitized.available_credit_centavos as number) < 0)) {
    throw new Error("available_credit_centavos must be non-negative");
  }
  if (sanitized.allows_extra_payments !== undefined && typeof sanitized.allows_extra_payments !== "boolean") throw new Error("allows_extra_payments must be a boolean");
  const anchorFields = ["available_credit_centavos", "reconciled_available_credit_centavos", "pre_reconciliation_available_credit_centavos", "available_credit_reconciled_at"];
  if (anchorFields.some((field) => sanitized[field] !== undefined)) {
    if (Object.keys(sanitized).length !== anchorFields.length || !anchorFields.every((field) => sanitized[field] !== undefined)) throw new Error("reconciliation anchors can only be updated together");
    for (const field of anchorFields.slice(0, 3)) if (!Number.isSafeInteger(sanitized[field]) || (sanitized[field] as number) < 0) throw new Error(`${field} must be a non-negative whole number`);
    requireIsoTimestamp(sanitized, "available_credit_reconciled_at");
  }
  for (const [key, value] of Object.entries(sanitized)) {
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
  }
  return sanitized;
}

async function validateRepaymentPreferenceCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_REPAYMENT_PREFERENCE_FIELDS);
  requireString(sanitized, "account_id");
  requireString(sanitized, "strategy");
  if (!REPAYMENT_STRATEGIES.includes(sanitized.strategy as string)) throw new Error("repayment strategy is invalid");
  if (sanitized.strategy === "custom_payment") requirePositiveInteger(sanitized, "custom_amount_centavos");
  if (sanitized.strategy === "percentage_of_statement" && (!Number.isSafeInteger(sanitized.percentage_bps) || (sanitized.percentage_bps as number) < 1 || (sanitized.percentage_bps as number) > 10_000)) throw new Error("percentage_bps must be between 1 and 10000");
  await verifyAccountOwnership(supabase, userId, sanitized.account_id as string);
  return sanitized;
}

async function validateRepaymentPreferenceUpdate(ctx: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_REPAYMENT_PREFERENCE_FIELDS);
  await verifyOptionalAccountId(ctx, sanitized);
  if (sanitized.strategy !== undefined && !REPAYMENT_STRATEGIES.includes(sanitized.strategy as string)) throw new Error("repayment strategy is invalid");
  if (sanitized.custom_amount_centavos !== undefined && sanitized.custom_amount_centavos !== null) requirePositiveInteger(sanitized, "custom_amount_centavos");
  if (sanitized.percentage_bps !== undefined && sanitized.percentage_bps !== null && (!Number.isSafeInteger(sanitized.percentage_bps) || (sanitized.percentage_bps as number) < 1 || (sanitized.percentage_bps as number) > 10_000)) throw new Error("percentage_bps must be between 1 and 10000");
  return sanitized;
}

async function validateInstallmentCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_INSTALLMENT_CREATE_FIELDS);
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

async function validateSettlement({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_SETTLEMENT_FIELDS);
  for (const field of ["installment_id", "settlement_date", "status"]) requireString(sanitized, field);
  for (const field of ["remaining_principal_centavos", "settlement_amount_centavos"]) requireBigInt(sanitized, field);
  if (sanitized.pretermination_fee_centavos !== undefined) requireBigInt(sanitized, "pretermination_fee_centavos");
  if (!["requested", "recognized", "rejected"].includes(sanitized.status as string)) throw new Error("settlement status is invalid");
  const { data: installment, error } = await supabase.from("credit_card_installments").select("id").eq("id", sanitized.installment_id as string).eq("user_id", userId).eq("deleted", false).maybeSingle();
  if (error) throw new Error(`settlement installment validation failed: ${error.message}`);
  if (!installment) throw new Error("settlement installment is not accessible");
  return sanitized;
}

function statementRepaymentTarget(strategy: string, balance: number, minimum: number, sanitized: Payload): unknown {
  if (strategy === "pay_in_full") return balance;
  if (strategy === "pay_minimum") return minimum;
  if (strategy === "custom_payment") return sanitized.custom_amount_centavos;
  return Math.round(balance * Number(sanitized.percentage_bps) / 10_000);
}

async function validateStatementStrategy({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_STATEMENT_STRATEGY_FIELDS);
  for (const field of ["statement_id", "strategy"]) requireString(sanitized, field);
  if (!REPAYMENT_STRATEGIES.includes(sanitized.strategy as string)) throw new Error("statement repayment strategy is invalid");
  const { data: statement, error } = await supabase.from("credit_card_statements").select("statement_balance_centavos, minimum_due_centavos").eq("id", sanitized.statement_id as string).eq("user_id", userId).eq("authoritative", true).eq("deleted", false).maybeSingle();
  if (error) throw new Error(`statement repayment strategy validation failed: ${error.message}`);
  if (!statement) throw new Error("statement repayment strategy requires an authoritative owned statement");
  const balance = Number(statement.statement_balance_centavos);
  const minimum = Number(statement.minimum_due_centavos);
  const strategy = sanitized.strategy as string;
  if (strategy === "custom_payment") requirePositiveInteger(sanitized, "custom_amount_centavos");
  if (strategy === "percentage_of_statement" && (!Number.isSafeInteger(sanitized.percentage_bps) || (sanitized.percentage_bps as number) <= 0 || (sanitized.percentage_bps as number) > 10_000)) throw new Error("percentage_bps must be between 1 and 10000");
  const target = statementRepaymentTarget(strategy, balance, minimum, sanitized);
  if (!Number.isSafeInteger(target) || (target as number) < minimum || (target as number) > balance) throw new Error("statement repayment target must be between the minimum due and statement balance");
  return sanitized;
}

async function validateCreditCardTransactionCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, CREDIT_CARD_TRANSACTION_FIELDS);
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

export const syncCreditCards: EntitySyncTable = {
  credit_card_cycles: { create: validateCycleCreate, update: validateCycleUpdate },
  credit_card_statements: { create: validateStatementCreate, update: validateStatementUpdate },
  credit_card_payments: { create: validatePaymentCreate, update: validatePaymentUpdate },
  credit_card_details: { create: validateDetailsCreate, update: validateDetailsUpdate },
  credit_card_repayment_preferences: { create: validateRepaymentPreferenceCreate, update: validateRepaymentPreferenceUpdate },
  credit_card_installments: { create: validateInstallmentCreate },
  // Settlements and statement strategies validate every write as a full record.
  credit_card_settlements: { create: validateSettlement, update: validateSettlement },
  credit_card_statement_strategies: { create: validateStatementStrategy, update: validateStatementStrategy },
  credit_card_transactions: { create: validateCreditCardTransactionCreate },
};
