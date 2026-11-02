import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INCOME_FREQUENCIES,
  INCOME_SOURCE_CREATE_FIELDS,
  INCOME_SOURCE_UPDATE_FIELDS,
} from "./constants/incomeSources.js";
import { verifyAccountOwnership, verifySubcategoryOwnership } from "./syncOwnership.js";
import {
  allowedPayload,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requirePositiveInteger,
  requireString,
  validateDayRange,
  validateUpdateFieldTypes,
  type EntitySyncTable,
  type Payload,
  type SyncContext,
} from "./syncValidation.js";

async function verifyRecurringTemplate(supabase: SupabaseClient, userId: string, templateId: string): Promise<void> {
  const { data: template, error: templateErr } = await supabase
    .from("recurring_transaction_templates")
    .select("id")
    .eq("id", templateId)
    .eq("user_id", userId)
    .maybeSingle();
  if (templateErr) throw new Error(`recurring_template_id validation failed: ${templateErr.message}`);
  if (!template) throw new Error("recurring_template_id does not reference an accessible recurring template");
}

async function validateIncomeSourceCreate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, INCOME_SOURCE_CREATE_FIELDS);
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
    await verifyRecurringTemplate(supabase, userId, sanitized.recurring_template_id as string);
  }
  return sanitized;
}

async function validateIncomeSourceUpdate({ supabase, userId }: SyncContext, payload: Payload): Promise<Payload> {
  const sanitized = allowedPayload(payload, INCOME_SOURCE_UPDATE_FIELDS);
  validateUpdateFieldTypes(sanitized, { values: INCOME_FREQUENCIES, message: "frequency must be a valid income frequency" });
  if (sanitized.expected_amount_centavos !== undefined) requirePositiveInteger(sanitized, "expected_amount_centavos");
  for (const f of ["payday_day_of_month", "payday_second_day_of_month"] as const) {
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
    await verifyRecurringTemplate(supabase, userId, sanitized.recurring_template_id);
  }
  return sanitized;
}

export const syncIncomeSources: EntitySyncTable = {
  income_sources: { create: validateIncomeSourceCreate, update: validateIncomeSourceUpdate },
};
