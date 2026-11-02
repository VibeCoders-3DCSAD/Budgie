import {
  RECURRING_FREQUENCIES,
  RECURRING_OCCURRENCE_FIELDS,
  RECURRING_TEMPLATE_FIELDS,
  RECURRING_TEMPLATE_UPDATE_FIELDS,
  TRANSACTION_CREATE_FIELDS,
  TRANSACTION_UPDATE_FIELDS,
  VALID_TRANSACTION_TYPES,
} from "./constants/transactions.js";
import { validateSavingsExpenseWithdrawalPayload } from "./savingsExpenseWithdrawals.js";
import { validateSavingsGoalContributionPayload } from "./savingsGoalContribution.js";
import { verifyUncategorizedBillerPayment } from "./syncBillersAndRemittances.js";
import {
  verifyAccountOwnership,
  verifyCategoryOwnership,
  verifyOwnedAccount,
  verifySubcategoryOwnership,
} from "./syncOwnership.js";
import {
  allowedPayload,
  optionalNumber,
  optionalString,
  requirePositiveInteger,
  requireString,
  validateDateOrdering,
  validateDayRange,
  validateUpdateFieldType,
  validateUpdateFieldTypes,
  type EntitySyncTable,
  type Payload,
  type SyncContext,
} from "./syncValidation.js";

async function validateTransactionCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  // Older clients briefly queued this UI-only routing context with the
  // transaction. It is not a transaction column and must not reach the RPC.
  const { debt_account_id: _debtAccountId, ...transactionPayload } = payload;
  const sanitized = allowedPayload(transactionPayload, TRANSACTION_CREATE_FIELDS);
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

async function validateTransactionUpdate({ supabase, userId, recordId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, TRANSACTION_UPDATE_FIELDS);
  validateSavingsExpenseWithdrawalPayload(sanitized.savings_goal_withdrawals);
  validateSavingsGoalContributionPayload(sanitized.savings_goal_contribution);
  for (const field of ["source_account_id", "destination_account_id"]) {
    const accountId = sanitized[field];
    if (accountId !== undefined && accountId !== null) {
      if (typeof accountId !== "string") throw new Error(`${field} must be a string or null`);
      await verifyAccountOwnership(supabase, userId, accountId);
    }
  }

  for (const [key, value] of Object.entries(sanitized)) {
    if (key === "amount_centavos") {
      if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        throw new Error("amount_centavos must be a positive integer");
      }
      continue;
    }
    if (["subcategory_id", "source_account_id", "destination_account_id", "transaction_date", "merchant_name", "counterparty_name", "notes"].includes(key)) {
      if (value !== null && typeof value !== "string") throw new Error(`${key} must be a string or null`);
    }
  }

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
  return sanitized;
}

function validateRecurringTemplateShape(payload: Payload, transactionType: string): void {
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

async function validateRecurringTemplateCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, RECURRING_TEMPLATE_FIELDS);
  requireString(sanitized, "transaction_type");
  if (!VALID_TRANSACTION_TYPES.includes(sanitized.transaction_type as string)) {
    throw new Error(`transaction_type must be one of: ${VALID_TRANSACTION_TYPES.join(", ")}`);
  }
  requireString(sanitized, "name");
  requirePositiveInteger(sanitized, "amount_centavos");
  requireString(sanitized, "frequency");
  if (!RECURRING_FREQUENCIES.includes(sanitized.frequency as string)) {
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

async function validateRecurringTemplateUpdate({ supabase, userId, recordId }: SyncContext, payload: Payload): Promise<Payload> {
  if (Object.prototype.hasOwnProperty.call(payload, "transaction_type")) {
    throw new Error("transaction_type is immutable for recurring transaction templates");
  }
  const sanitized = allowedPayload(payload, RECURRING_TEMPLATE_UPDATE_FIELDS);

  for (const [key, value] of Object.entries(sanitized)) {
    if (key === "subcategory_id" || key === "source_account_id" || key === "destination_account_id") {
      if (value !== null && typeof value !== "string") throw new Error(`${key} must be a string or null`);
    } else if (key === "interval_count" || key === "amount_centavos") {
      requirePositiveInteger(sanitized, key);
    } else if (key === "day_of_month" || key === "second_day_of_month") {
      if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 31)) {
        throw new Error(`${key} must be between 1 and 31 or null`);
      }
    } else if (key === "day_of_week") {
      if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6)) {
        throw new Error("day_of_week must be between 0 and 6 or null");
      }
    } else {
      validateUpdateFieldType(key, value, { values: RECURRING_FREQUENCIES, message: "frequency must be a valid recurring frequency" });
    }
  }

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

  const src = sanitized.source_account_id;
  const dst = sanitized.destination_account_id;
  const sub = sanitized.subcategory_id;
  if (src && typeof src === "string") await verifyAccountOwnership(supabase, userId, src);
  if (dst && typeof dst === "string") await verifyAccountOwnership(supabase, userId, dst);
  if (sub && typeof sub === "string") await verifySubcategoryOwnership(supabase, userId, sub);
  return sanitized;
}

async function validateRecurringOccurrenceCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, RECURRING_OCCURRENCE_FIELDS);
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

async function validateRecurringOccurrenceUpdate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, RECURRING_OCCURRENCE_FIELDS);
  validateUpdateFieldTypes(sanitized);
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
  return sanitized;
}

export const syncTransactions: EntitySyncTable = {
  transactions: { create: validateTransactionCreate, update: validateTransactionUpdate },
  recurring_transaction_templates: { create: validateRecurringTemplateCreate, update: validateRecurringTemplateUpdate },
  recurring_transaction_occurrences: { create: validateRecurringOccurrenceCreate, update: validateRecurringOccurrenceUpdate },
};
