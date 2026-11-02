import { initDatabase } from "../../../local-db/client";
import { cleanupDiscardedSyncRows } from "../../../local-db/helpers";
import { MAX_SYNC_ATTEMPTS } from "../../../local-db/sync/queueOrder";

// Every query is scoped to the signed-in user and this device's queue.
export { MAX_SYNC_ATTEMPTS };
export const SYNC_ISSUES_PAGE_SIZE = 50;

export type SyncQueueIssue = {
  operation_id: string;
  entity: string;
  operation_type: string;
  record_id: string;
  failure_message: string;
  status: string;
  attempts: number;
  created_at: string;
  item_label: string | null;
};

export type SyncIssuesPage = { rows: SyncQueueIssue[]; total: number; failedTotal: number; pendingTotal: number };

async function count(sql: string, ...params: (string | number)[]) {
  const db = await initDatabase();
  const row = await db.getFirstAsync<{ cnt: number }>(sql, ...params);
  return row?.cnt ?? 0;
}

export async function countQueuedSyncRows(userId: string, deviceId: string) {
  const db = await initDatabase();
  await cleanupDiscardedSyncRows(db);
  return count("SELECT COUNT(*) as cnt FROM sync_queue WHERE user_id = ? AND device_id = ? AND status IN ('pending', 'failed')", userId, deviceId);
}

// Same filter as countQueuedSyncRows, without the discarded-row cleanup.
export function countUnsyncedRows(userId: string, deviceId: string) {
  return count("SELECT COUNT(*) as cnt FROM sync_queue WHERE user_id = ? AND device_id = ? AND status IN ('pending', 'failed')", userId, deviceId);
}

export function countRetryableSyncRows(userId: string, deviceId: string) {
  return count(
    `SELECT COUNT(*) as cnt FROM sync_queue
     WHERE user_id = ? AND device_id = ?
       AND status IN ('pending', 'failed') AND attempts < ?`,
    userId, deviceId, MAX_SYNC_ATTEMPTS,
  );
}

export function countExhaustedSyncRows(userId: string, deviceId: string) {
  return count(
    "SELECT COUNT(*) as cnt FROM sync_queue WHERE user_id = ? AND device_id = ? AND status = 'failed' AND attempts >= ?",
    userId, deviceId, MAX_SYNC_ATTEMPTS,
  );
}

export async function loadSyncIssuesPage(userId: string, deviceId: string, offset: number): Promise<SyncIssuesPage> {
  const db = await initDatabase();
  const total = await countExhaustedSyncRows(userId, deviceId);
  const pendingTotal = await countRetryableSyncRows(userId, deviceId);
  const rows = await db.getAllAsync<SyncQueueIssue>(
    `SELECT q.operation_id, q.entity, q.operation_type, q.record_id, q.failure_message, q.status, q.attempts, q.created_at,
             COALESCE(c.label, s.label) as item_label
     FROM sync_queue q
     LEFT JOIN categories c ON q.entity = 'categories' AND q.record_id = c.id AND q.user_id = c.user_id
     LEFT JOIN subcategories s ON q.entity = 'subcategories' AND q.record_id = s.id AND q.user_id = s.user_id
     WHERE q.user_id = ? AND q.device_id = ? AND q.status = 'failed' AND q.attempts >= ?
      ORDER BY q.created_at LIMIT ${SYNC_ISSUES_PAGE_SIZE} OFFSET ${Math.max(0, Math.trunc(offset))}`,
    userId, deviceId, MAX_SYNC_ATTEMPTS,
  );
  // The sheet lists only exhausted rows, so the failed total is the same count.
  return { rows, total, failedTotal: total, pendingTotal };
}

export async function discardSyncIssue(userId: string, operationId: string) {
  const db = await initDatabase();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'discarded', discarded_at = ? WHERE operation_id = ? AND user_id = ?",
    new Date().toISOString(), operationId, userId,
  );
}

export async function retrySyncIssue(userId: string, operationId: string) {
  const db = await initDatabase();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'pending', attempts = 0, last_error = NULL WHERE operation_id = ? AND user_id = ? AND status = 'failed'",
    operationId, userId,
  );
}

export async function discardExhaustedSyncRows(userId: string, deviceId: string) {
  const db = await initDatabase();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'discarded', discarded_at = ? WHERE user_id = ? AND device_id = ? AND status = 'failed' AND attempts >= ?",
    new Date().toISOString(), userId, deviceId, MAX_SYNC_ATTEMPTS,
  );
}
