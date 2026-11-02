import { SYNC_REJECTION_REASONS } from "@odin/sync-config";

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
    `UPDATE sync_queue SET status = 'failed', attempts = attempts + 1,
      last_error = ? WHERE operation_id = ?`,
    metadata,
    conflict.operation_id,
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
