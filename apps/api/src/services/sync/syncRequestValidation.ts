import { SYNCED_TABLES } from "./syncService.js";

const SYNCED_CURSOR_TABLES = new Set<string>(SYNCED_TABLES);
export const MAX_PUSH_OPERATIONS = 100;
const MAX_ID_LENGTH = 128;
const MAX_CHANGED_FIELDS = 50;
const MAX_PAYLOAD_KEYS = 100;
const MAX_PAYLOAD_BYTES = 256_000;
const MAX_PRIORITIES = 100;
const MAX_DEVICE_ID_LENGTH = 128;
const OPERATION_TYPES = ["create", "update", "delete"];

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_ID_LENGTH;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isDeviceId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_DEVICE_ID_LENGTH && /^[a-zA-Z0-9._:-]+$/.test(value);
}

function isBoundedPayload(payload: Record<string, unknown>): boolean {
  if (Object.keys(payload).length > MAX_PAYLOAD_KEYS || JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) return false;
  const priorities = payload.priorities;
  if (priorities === undefined) return true;
  return Array.isArray(priorities) && priorities.length <= MAX_PRIORITIES && priorities.every(isBoundedString);
}

function isChangedFields(value: unknown): boolean {
  return Array.isArray(value) && value.length <= MAX_CHANGED_FIELDS && value.every(isBoundedString);
}

// Enough of an operation to report a result for it, even when the rest of it is invalid.
export function hasOperationId(value: unknown): value is { operation_id: string } {
  return isPlainObject(value) && isBoundedString(value.operation_id) && value.operation_id.length > 0;
}

export function isPushOperation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const operation = value as Record<string, unknown>;
  if (!isBoundedString(operation.operation_id) || !isBoundedString(operation.entity) || !isBoundedString(operation.record_id)) return false;
  if (!OPERATION_TYPES.includes(operation.operation_type as string)) return false;
  if (operation.base_version !== null && typeof operation.base_version !== "number") return false;
  if (!isChangedFields(operation.changed_fields)) return false;
  return isPlainObject(operation.payload) && isBoundedPayload(operation.payload);
}

export function isCursorMap(value: unknown): value is Record<string, { ts: string; id: string }> {
  if (!isPlainObject(value)) return false;
  return Object.entries(value).every(([table, cursor]) => {
    if (!SYNCED_CURSOR_TABLES.has(table) || !cursor || typeof cursor !== "object") return false;
    const item = cursor as Record<string, unknown>;
    return typeof item.ts === "string" && !Number.isNaN(Date.parse(item.ts))
      && typeof item.id === "string" && (item.id === "" || /^[0-9a-f-]{8,}$/i.test(item.id));
  });
}
