import { SYNC_REJECTION_REASONS } from "@odin/sync-config";
import { MAX_SYNC_ATTEMPTS } from "./queueOrder";

type SyncQueueDatabase = {
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
};

type SyncConflict = {
  operation_id: string;
  reason?: string;
  current_version?: number;
  conflicted_fields?: string[];
};

type QueueOperation = {
  operation_id: string;
  entity: string;
  base_version: number | null;
};

// Resending the same operation cannot fix these, so retrying them only blocks later changes.
const PERMANENT_REJECTIONS: readonly string[] = [
  SYNC_REJECTION_REASONS.versionConflict,
  SYNC_REJECTION_REASONS.recordDeleted,
  SYNC_REJECTION_REASONS.invalidOperation,
];

// A conflict is exhausted at once and waits in the Sync Issues sheet for the user.
export async function markSyncConflict(
  db: SyncQueueDatabase,
  conflict: SyncConflict,
): Promise<void> {
  const metadata = JSON.stringify({
    reason: conflict.reason ?? "conflict",
    currentVersion: conflict.current_version ?? null,
    conflictedFields: conflict.conflicted_fields ?? [],
  });
  await db.runAsync(
    `UPDATE sync_queue SET status = 'failed', attempts = MAX(attempts + 1, ?),
      last_error = ? WHERE operation_id = ?`,
    MAX_SYNC_ATTEMPTS,
    metadata,
    conflict.operation_id,
  );
}

// A missing reference can resolve once its create syncs, so only permanent reasons skip the retries.
export async function markSyncRejection(
  db: SyncQueueDatabase,
  operationId: string,
  reason: string | undefined,
): Promise<void> {
  const minimumAttempts = reason && PERMANENT_REJECTIONS.includes(reason) ? MAX_SYNC_ATTEMPTS : 0;
  await db.runAsync(
    `UPDATE sync_queue SET status = 'failed', attempts = MAX(attempts + 1, ?),
      last_error = ? WHERE operation_id = ?`,
    minimumAttempts,
    reason ?? "unknown error",
    operationId,
  );
}

export async function rebaseLegacyDebtPriorityConflict(
  db: SyncQueueDatabase,
  operation: QueueOperation | undefined,
  conflict: SyncConflict,
): Promise<boolean> {
  if (
    operation?.entity !== "user_debt_priorities"
    || operation.base_version !== null
    || conflict.reason !== SYNC_REJECTION_REASONS.versionConflict
    || !Number.isSafeInteger(conflict.current_version)
  ) {
    return false;
  }

  await db.runAsync(
    "UPDATE sync_queue SET base_version = ?, status = 'pending', last_error = NULL WHERE operation_id = ?",
    conflict.current_version,
    operation.operation_id,
  );
  return true;
}
