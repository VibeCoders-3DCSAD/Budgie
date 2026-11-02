import type { SupabaseClient } from "@supabase/supabase-js";
import { PULL_PAGE_SIZE } from "@odin/sync-config";
import { prepareOperation } from "./syncApplyOperation.js";

type PushOperation = {
  operation_id: string;
  entity: string;
  record_id: string;
  operation_type: "create" | "update" | "delete";
  base_version: number | null;
  changed_fields: string[];
  payload: Record<string, unknown>;
};

type PushResult = {
  operation_id: string;
  status: "applied" | "rejected" | "conflict" | "duplicate";
  reason?: string;
  current_version?: number;
  conflicted_fields?: string[];
};

type RpcApplyResult = {
  status: PushResult["status"] | "conflict";
  reason: string | null;
  current_version: number | null;
  conflicted_fields: string[] | null;
};

type PullChanges = Record<string, Record<string, unknown>[]>;

type TableCursor = { ts: string; id: string };

type PullCursors = Record<string, TableCursor>;

const CLIENT_SYNC_FAILURE_REASON = "Sync operation rejected";
const EDIT_HISTORY_FAILURE_REASON = "sync_operation_rejected";

export const SYNCED_TABLES = [
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
] as const;

const PULL_IDENTITY_COLUMNS: Record<string, string> = {
  credit_card_details: "account_id",
  credit_card_repayment_preferences: "account_id",
  credit_card_transactions: "transaction_id",
  debt_strategy_preferences: "user_id",
  credit_card_statement_strategies: "statement_id",
  savings_account_details: "account_id",
  savings_allocation_preferences: "user_id",
};

export async function pushOperations(
  supabase: SupabaseClient,
  userId: string,
  deviceId: string,
  operations: PushOperation[],
): Promise<PushResult[]> {
  assertDeviceId(deviceId);
  const results: PushResult[] = [];

  for (const op of operations) {
    let auditPayload: Record<string, unknown> = { redacted: true, fields: Object.keys(op.payload) };
    try {
      const prepared = await prepareOperation(supabase, userId, op);
      auditPayload = { redacted: true, fields: Object.keys(prepared.payload) };
      const rpcName = ["alert_notification_preferences", "anomaly_whitelist_rules", "alert_suppression_rules"].includes(prepared.entity)
        ? "apply_alert_feedback_sync_operation"
        : prepared.entity === "financial_plans"
          ? "apply_financial_plan_sync_operation"
        : prepared.entity === "scheduled_payments" || prepared.entity === "scheduled_payment_records"
          ? "apply_scheduled_payment_sync_operation"
        : prepared.entity === "debt_accounts" || prepared.entity === "debt_payments" || prepared.entity === "user_debt_priorities" || prepared.entity === "debt_strategy_preferences"
          ? "apply_debt_sync_operation"
        : prepared.entity === "credit_card_cycles" || prepared.entity === "credit_card_details" || prepared.entity === "credit_card_repayment_preferences" || prepared.entity === "credit_card_installments" || prepared.entity === "credit_card_transactions" || prepared.entity === "credit_card_statements" || prepared.entity === "credit_card_payments" || prepared.entity === "credit_card_settlements" || prepared.entity === "credit_card_statement_strategies"
          ? "apply_credit_card_sync_operation"
          : "apply_sync_operation";
      const { data, error } = await supabase.rpc(rpcName, {
        p_operation_id: prepared.operation_id,
        p_device_id: deviceId,
        p_entity: prepared.entity,
        p_record_id: prepared.record_id,
        p_operation_type: prepared.operation_type,
        p_base_version: prepared.base_version,
        p_changed_fields: prepared.changed_fields,
        p_payload: prepared.payload,
      });

      if (error) {
        throw new Error(`sync apply failed: ${error.message}`);
      }

      const result = Array.isArray(data) ? data[0] as RpcApplyResult | undefined : undefined;

      if (!result) throw new Error("sync apply returned no result");

        const isConflict = result.status === "conflict" || (result.status === "rejected" && result.reason?.includes("version changed"));
        const status = isConflict ? "conflict" : result.status;

       if (status === "rejected" || status === "conflict") {
        console.error("[sync/push] rejected", {
          userId,
          deviceId,
          operation_id: op.operation_id,
          entity: op.entity,
          record_id: op.record_id,
          operation_type: op.operation_type,
          reason: result.reason ?? "unknown",
        });
      }

      results.push({
        operation_id: op.operation_id,
         status,
          reason: status === "rejected" || status === "conflict" ? result.reason ?? CLIENT_SYNC_FAILURE_REASON : undefined,
          current_version: typeof result.current_version === "number" ? result.current_version : undefined,
        conflicted_fields: result.conflicted_fields ?? undefined,
      });
    } catch (error) {
      console.error("[sync/push] rejected", {
        userId,
        deviceId,
        operation_id: op.operation_id,
        entity: op.entity,
        record_id: op.record_id,
        operation_type: op.operation_type,
          error,
      });

      await supabase.from("edit_history").insert({
        user_id: userId,
        operation_id: op.operation_id,
        entity: op.entity,
        record_id: op.record_id,
         reason: EDIT_HISTORY_FAILURE_REASON,
        payload: auditPayload,
      });

      results.push({
        operation_id: op.operation_id,
        status: "rejected",
          reason: CLIENT_SYNC_FAILURE_REASON,
      });
    }
  }

  return results;
}

// Every synced table is user-scoped; categories and subcategories are provisioned per user from defaults.
function scopePullQuery<Q extends { eq(column: string, value: string): unknown; or(filters: string): unknown }>(
  query: Q,
  table: string,
  userId: string,
  cursor: TableCursor | undefined,
): Q {
  query.eq("user_id", userId);
  if (cursor && cursor.id) {
    const cursorColumn = PULL_IDENTITY_COLUMNS[table] ?? "id";
    query.or(`updated_at.gt.${cursor.ts},and(updated_at.eq.${cursor.ts},${cursorColumn}.gt.${cursor.id})`);
  }
  return query;
}

// Rows each table still has to send from these cursors, so a first sync can show real progress.
export async function countRemainingChanges(
  supabase: SupabaseClient,
  userId: string,
  cursors: PullCursors,
): Promise<Record<string, number>> {
  const counts = await Promise.all(SYNCED_TABLES.map(async (table) => {
    const query = supabase.from(table).select("*", { count: "exact", head: true });
    const { count, error } = await scopePullQuery(query, table, userId, cursors[table]);
    if (error) console.error("[sync/pull] count failed", { userId, table, error });
    return [table, count ?? 0] as const;
  }));
  return Object.fromEntries(counts);
}

export async function pullChanges(
  supabase: SupabaseClient,
  userId: string,
  cursors: PullCursors,
): Promise<{ cursors: PullCursors; changes: PullChanges; has_more: Record<string, boolean>; successful: boolean }> {
  const changes: PullChanges = {};
  const newCursors: PullCursors = {};
  const hasMore: Record<string, boolean> = {};
  let successful = true;

  // Tables are independent, so fetch them together instead of paying one round trip per table.
  const responses = await Promise.all(SYNCED_TABLES.map(async (table) => {
    const query = supabase
      .from(table)
      .select("*")
      .order("updated_at", { ascending: true })
      .order(PULL_IDENTITY_COLUMNS[table] ?? "id", { ascending: true })
      .limit(PULL_PAGE_SIZE);
    return { table, response: await scopePullQuery(query, table, userId, cursors[table]) };
  }));

  for (const { table, response } of responses) {
    const cursorColumn = PULL_IDENTITY_COLUMNS[table] ?? "id";
    const tableCursor = cursors[table];
    const { data, error } = response;

    if (error) {
      successful = false;
      console.error("[sync/pull] table failed", {
        userId,
        table,
        cursor: tableCursor ?? null,
        error,
      });
      newCursors[table] = tableCursor ?? { ts: new Date(0).toISOString(), id: "" };
      hasMore[table] = false;
      continue;
    }

    if (data && data.length > 0) {
      changes[table] = data;
      hasMore[table] = data.length === PULL_PAGE_SIZE;

      const lastRow = data[data.length - 1] as Record<string, unknown>;
      newCursors[table] = {
        ts: (lastRow.updated_at as string) ?? tableCursor?.ts ?? new Date(0).toISOString(),
        id: lastRow[cursorColumn] as string,
      };
    } else {
      newCursors[table] = tableCursor ?? { ts: new Date(0).toISOString(), id: "" };
      hasMore[table] = false;
    }
  }

  return { cursors: newCursors, changes, has_more: hasMore, successful };
}

export async function registerDevice(
  supabase: SupabaseClient,
  userId: string,
  deviceId: string,
): Promise<void> {
  assertDeviceId(deviceId);
  const { data: existing } = await supabase
    .from("user_devices")
    .select("id")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("user_devices")
      .update({ last_seen_at: new Date().toISOString(), is_active: true })
      .eq("user_id", userId)
      .eq("device_id", deviceId);
  } else {
    await supabase.from("user_devices").insert({
      user_id: userId,
      device_id: deviceId,
    });
  }
}

function assertDeviceId(deviceId: string): void {
  if (!deviceId || deviceId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(deviceId)) throw new Error("invalid device id");
}

export async function isDeviceActive(
  supabase: SupabaseClient,
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_devices")
    .select("is_active")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();

  return data?.is_active === true;
}
