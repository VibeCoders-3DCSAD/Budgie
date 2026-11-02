import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVER_COLUMNS } from "./constants/entities.js";

export type Payload = Record<string, unknown>;

export type SyncContext = {
  supabase: SupabaseClient;
  userId: string;
  recordId: string;
};

export type EntitySync = {
  create: (ctx: SyncContext, payload: Payload) => Payload | Promise<Payload>;
  // Entities without an update handler reject updates.
  update?: (ctx: SyncContext, payload: Payload) => Payload | Promise<Payload>;
};

export type EntitySyncTable = Record<string, EntitySync>;

export function sanitizePayload(payload: Payload, allowedFields: Set<string>): Payload {
  const sanitized: Payload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!SERVER_COLUMNS.has(key) && allowedFields.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function assertOnlyAllowed(payload: Payload, allowedFields: Set<string>): void {
  for (const key of Object.keys(payload)) {
    if (!SERVER_COLUMNS.has(key) && !allowedFields.has(key)) {
      throw new Error(`${key} is not syncable`);
    }
  }
}

// Rejects fields outside the allowlist, then keeps only the allowed client fields.
export function allowedPayload(payload: Payload, allowedFields: Set<string>): Payload {
  assertOnlyAllowed(payload, allowedFields);
  return sanitizePayload(payload, allowedFields);
}

export function requireString(payload: Payload, field: string): void {
  if (!payload[field] || typeof payload[field] !== "string") throw new Error(`${field} is required`);
}

export function requireDateString(payload: Payload, field: string): void {
  if (typeof payload[field] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload[field] as string)) {
    throw new Error(`${field} must be a valid YYYY-MM-DD date`);
  }
  if (Number.isNaN(parseDateString(payload[field] as string).getTime())) {
    throw new Error(`${field} must be a valid calendar date`);
  }
}

export function requireIsoTimestamp(payload: Payload, field: string): void {
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

export function optionalString(payload: Payload, field: string): void {
  if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] !== "string") {
    throw new Error(`${field} must be a string or null`);
  }
}

export function optionalBoolean(payload: Payload, field: string): void {
  if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] !== "boolean") {
    throw new Error(`${field} must be a boolean or null`);
  }
}

export function optionalNumber(payload: Payload, field: string): void {
  if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] !== "number") {
    throw new Error(`${field} must be a number or null`);
  }
}

export function requireBigInt(payload: Payload, field: string): void {
  if (payload[field] === undefined || payload[field] === null || typeof payload[field] !== "number") {
    throw new Error(`${field} is required and must be a number`);
  }
}

export function requirePositiveInteger(payload: Payload, field: string): void {
  const v = payload[field];
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

export function optionalFiniteInteger(payload: Payload, field: string): void {
  const v = payload[field];
  if (v !== undefined && v !== null) {
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
      throw new Error(`${field} must be a finite integer or null`);
    }
  }
}

export function requireNumberInRange(payload: Payload, field: string, min: number, max: number): void {
  const value = payload[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
}

export function validateOptionalRange(payload: Payload, field: string, min: number, max: number): void {
  if (payload[field] !== undefined && payload[field] !== null) requireNumberInRange(payload, field, min, max);
}

export function validateDayRange(payload: Payload, field: string, lo: number, hi: number): void {
  const val = payload[field];
  if (val !== undefined && val !== null && typeof val === "number") {
    if (val < lo || val > hi) throw new Error(`${field} must be between ${lo} and ${hi}`);
  }
}

export function validateDateOrdering(payload: Payload, startField: string, endField: string): void {
  const starts = payload[startField] as string | undefined;
  const ends = payload[endField] as string | undefined;
  if (starts !== undefined && starts !== null && ends !== undefined && ends !== null && starts > ends) {
    throw new Error(`${startField} must be <= ${endField}`);
  }
}

export type FrequencyRule = { values: string[]; message: string };

// Type rules for update fields that have no entity-specific rule. Unknown keys must be booleans.
export function validateUpdateFieldType(key: string, value: unknown, frequency?: FrequencyRule): void {
  if (key === "label" || key === "description" || key === "name") {
    if (typeof value !== "string") throw new Error(`${key} must be a string`);
    return;
  }
  if (key === "icon_key" || key === "color_hex") return;
  if (key === "notes") {
    if (value !== null && typeof value !== "string") throw new Error("notes must be a string or null");
    return;
  }
  if (key === "short_label" || key === "institution_name") {
    if (value !== null && typeof value !== "string") throw new Error(`${key} must be a string or null`);
    return;
  }
  if (key === "slug" || key === "subcategory_id" || key === "source_account_id" || key === "destination_account_id") {
    if (typeof value !== "string") throw new Error(`${key} must be a string`);
    return;
  }
  if (key === "recurring_template_id") {
    if (value !== null && typeof value !== "string") throw new Error("recurring_template_id must be a string or null");
    return;
  }
  if (key === "payday_day_of_month" || key === "payday_second_day_of_month" || key === "payday_day_of_week") {
    if (value !== null && typeof value !== "number") throw new Error(`${key} must be a number or null`);
    return;
  }
  if (key === "sort_order") {
    if (typeof value !== "number") throw new Error(`${key} must be a number`);
    return;
  }
  if (key === "due_day_of_month" || key === "due_second_day_of_month" || key === "due_day_of_week" || key === "due_second_day_of_week" || key === "due_month") {
    if (value !== null && typeof value !== "number") throw new Error(`${key} must be a number or null`);
    return;
  }
  if (key === "opening_balance_centavos" || key === "current_balance_centavos" || key === "amount_centavos") {
    if (typeof value !== "number") throw new Error(`${key} must be a number`);
    return;
  }
  if (key === "expected_amount_centavos" || key === "minimum_amount_centavos" || key === "fixed_amount_centavos") {
    if (value !== null && value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
      throw new Error(`${key} must be a non-negative integer or null`);
    }
    return;
  }
  if (key === "kind") {
    if (typeof value !== "string") throw new Error("kind must be a string");
    return;
  }
  if (key === "status") {
    if (typeof value !== "string") throw new Error("status must be a string");
    if (value === "deleted") throw new Error("status 'deleted' must use the delete operation");
    return;
  }
  if (key === "frequency") {
    if (typeof value !== "string") throw new Error("frequency must be a string");
    if (frequency && !frequency.values.includes(value)) throw new Error(frequency.message);
    return;
  }
  if (key === "opened_on" || key === "archived_at" || key === "starts_on" || key === "ends_on" || key === "next_expected_date") {
    if (value !== null && typeof value !== "string") throw new Error(`${key} must be a string or null`);
    return;
  }
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
}

export function validateUpdateFieldTypes(payload: Payload, frequency?: FrequencyRule): void {
  for (const [key, value] of Object.entries(payload)) validateUpdateFieldType(key, value, frequency);
}
