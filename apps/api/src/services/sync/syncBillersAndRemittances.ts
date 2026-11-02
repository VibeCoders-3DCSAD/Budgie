import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVER_COLUMNS } from "./constants/entities.js";
import {
  BILLER_PAYMENT_MUTATION,
  SCHEDULED_PAYMENT_FIELDS,
  SCHEDULED_PAYMENT_FREQUENCIES,
  SCHEDULED_PAYMENT_RECORD_FIELDS,
  SCHEDULED_PAYMENT_RECORD_SETTLEMENT_FIELDS,
} from "./constants/scheduledPayments.js";
import {
  allowedPayload,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireDateString,
  requirePositiveInteger,
  requireString,
  sanitizePayload,
  validateDateOrdering,
  validateDayRange,
  type EntitySyncTable,
  type Payload,
} from "./syncValidation.js";

export async function verifyUncategorizedBillerPayment(supabase: SupabaseClient, userId: string, clientMutationId: unknown): Promise<void> {
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
function validateScheduledPayment(payload: Payload, creating: boolean): Payload {
  const sanitized = allowedPayload(payload, SCHEDULED_PAYMENT_FIELDS);
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

function validateScheduledPaymentRecord(payload: Payload): Payload {
  const sanitized = allowedPayload(payload, SCHEDULED_PAYMENT_RECORD_FIELDS);
  for (const field of ["scheduled_payment_id", "transaction_id"]) requireString(sanitized, field);
  for (const field of ["occurrence_date", "payment_date"]) requireDateString(sanitized, field);
  requirePositiveInteger(sanitized, "amount_centavos");
  if (sanitized.source !== undefined && sanitized.source !== "manual" && sanitized.source !== "auto") throw new Error("source must be manual or auto");
  optionalString(sanitized, "notes");
  return sanitized;
}

// Settling the occurrence in full is the only change a payment record accepts; anything else is delete and record again.
function validateScheduledPaymentRecordSettlement(payload: Payload): Payload {
  const sanitized = sanitizePayload(payload, SCHEDULED_PAYMENT_RECORD_SETTLEMENT_FIELDS);
  if (Object.keys(payload).some((key) => !SERVER_COLUMNS.has(key) && !SCHEDULED_PAYMENT_RECORD_SETTLEMENT_FIELDS.has(key)) || typeof sanitized.settles_occurrence !== "boolean") {
    throw new Error("payment records only update settles_occurrence; delete and record again");
  }
  return sanitized;
}

export const syncBillersAndRemittances: EntitySyncTable = {
  scheduled_payments: {
    create: (_ctx, payload) => validateScheduledPayment(payload, true),
    update: (_ctx, payload) => validateScheduledPayment(payload, false),
  },
  scheduled_payment_records: {
    create: (_ctx, payload) => validateScheduledPaymentRecord(payload),
    update: (_ctx, payload) => validateScheduledPaymentRecordSettlement(payload),
  },
};
