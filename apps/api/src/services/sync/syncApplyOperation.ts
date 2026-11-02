import type { SupabaseClient } from "@supabase/supabase-js";
import { SYNCED_ENTITIES } from "./constants/entities.js";
import { syncAccounts } from "./syncAccounts.js";
import { syncAlerts } from "./syncAlerts.js";
import { syncBillersAndRemittances } from "./syncBillersAndRemittances.js";
import { syncCategories } from "./syncCategories.js";
import { syncCreditCards } from "./syncCreditCards.js";
import { syncDebts } from "./syncDebts.js";
import { syncFinancialPlan } from "./syncFinancialPlan.js";
import { syncIncomeSources } from "./syncIncomeSources.js";
import { syncSavings } from "./syncSavings.js";
import { syncTransactions } from "./syncTransactions.js";
import type { EntitySyncTable, Payload } from "./syncValidation.js";

export type Operation = {
  operation_id: string;
  entity: string;
  record_id: string;
  operation_type: "create" | "update" | "delete";
  base_version: number | null;
  changed_fields: string[];
  payload: Payload;
};

const ENTITY_SYNC: EntitySyncTable = {
  ...syncAlerts,
  ...syncCategories,
  ...syncAccounts,
  ...syncTransactions,
  ...syncCreditCards,
  ...syncDebts,
  ...syncSavings,
  ...syncIncomeSources,
  ...syncBillersAndRemittances,
  ...syncFinancialPlan,
};

export async function prepareOperation(
  supabase: SupabaseClient,
  userId: string,
  op: Operation,
): Promise<Operation> {
  const entitySync = SYNCED_ENTITIES.has(op.entity) ? ENTITY_SYNC[op.entity] : undefined;
  if (!entitySync) {
    throw new Error(`entity '${op.entity}' is not in the sync allowlist`);
  }
  const ctx = { supabase, userId, recordId: op.record_id };
  switch (op.operation_type) {
    case "create":
      return { ...op, payload: await entitySync.create(ctx, op.payload) };
    case "update": {
      if (!entitySync.update) throw new Error(`entity '${op.entity}' is not in the sync allowlist`);
      // Savings links ride along with a transaction update even when the field itself did not change.
      const fields = op.entity === "transactions"
        ? [...op.changed_fields, "savings_goal_contribution", "savings_goal_withdrawals"]
        : op.changed_fields;
      return { ...op, payload: await entitySync.update(ctx, filterPayloadFields(op.payload, fields)) };
    }
    case "delete":
      return op;
    default:
      throw new Error(`Unknown operation_type: ${op.operation_type}`);
  }
}

function filterPayloadFields(payload: Payload, changedFields: string[]): Payload {
  const filtered: Payload = {};
  for (const field of changedFields) {
    if (field in payload) {
      filtered[field] = payload[field];
    }
  }
  return filtered;
}
