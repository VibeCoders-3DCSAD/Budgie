import * as SQLite from "expo-sqlite";
import { DEVICE_NOT_REGISTERED, SYNC_REJECTION_REASONS } from "@odin/sync-config";
import { authorizeLocalRequest } from "../../lib/localAccess";
import { initDatabase } from "../client";
import { enqueueOperation } from "../helpers";
import {
  normalizePullRow,
  applyPullRow,
  SYNCED_TABLES,
} from "./pullConvergence";
import {
  MAX_SYNC_ATTEMPTS,
  syncQueueEligibleStatusesClause,
  syncQueueOrderByClause,
  syncQueueUnsyncedStatusesClause,
} from "./queueOrder";
import { markSyncConflict, markSyncRejection, rebaseLegacyDebtPriorityConflict } from "./syncConflict";
import { repairCreditCardPaymentCreateRows } from "./repairCreditCardPaymentCreates";
import { repairCreditCardDetailCreateRows } from "./repairCreditCardDetailCreates";
import { retryAnomalyEvaluationPulls } from "./retryAnomalyEvaluationPulls";
import { ensureDeviceRegistered, registerDevice } from "./deviceRegistration";
import { API_BASE, fetchWithTimeout, responseErrorCode } from "./syncRequest";

const MAX_PULL_PAGES_PER_SYNC = 3;
const PULL_PAGE_DELAY_MS = 100;
const PROGRESS_REPORT_ROWS = 25;

const syncPromises = new Map<string, { promise: Promise<SyncResult>; pull: boolean }>();

type TableCursor = { ts: string; id: string };

type PushResultItem = {
  operation_id: string;
  status: "applied" | "rejected" | "conflict" | "duplicate";
  reason?: string;
  current_version?: number;
  conflicted_fields?: string[];
};

export type PullProgress = { received: number; total: number };

type SyncOptions = {
  pull?: boolean;
  // Keep paging past MAX_PULL_PAGES_PER_SYNC until the server has nothing left, e.g. behind the initial sync screen.
  untilComplete?: boolean;
  onProgress?: (progress: PullProgress) => void;
};

type SyncResult = {
  pushed: number;
  pulled: number;
  errors: number;
  // Changes queued before the run that are still not on the server.
  pendingPushes: number;
  // The part of pendingPushes that has used up its attempts and waits for the user in Sync Issues.
  awaitingUser: number;
  successful: boolean;
  hasMore: boolean;
};

type QueueRow = {
  operation_id: string;
  user_id: string;
  device_id: string;
  entity: string;
  record_id: string;
  operation_type: string;
  base_version: number | null;
  changed_fields: string;
  payload: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

type IncomeSourceSyncFields = {
  recurring_template_id: string | null;
  destination_account_id: string | null;
  subcategory_id: string | null;
};


// `pull: false` only pushes queued local changes, for callers that need the server to see them but
// do not need the server's changes back (the server-side Financial Plan reads its own database).
export async function runSync(
  userId: string,
  deviceId: string,
  accessToken: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const pull = options.pull ?? true;
  accessToken = await authorizeLocalRequest(userId, accessToken);
  const syncKey = `${userId}:${deviceId}`;
  const existing = syncPromises.get(syncKey);
  // A push-only caller needs its own latest changes on the server, and an in-flight run only pushes
  // what was queued when it started, so it waits and runs again. A pull request can share a full run.
  if (existing && existing.pull && pull) return existing.promise;
  if (existing) {
    await existing.promise.catch(() => {});
    return runSync(userId, deviceId, accessToken, options);
  }

  const syncPromise = runSyncInternal(userId, deviceId, accessToken, { ...options, pull });
  syncPromises.set(syncKey, { promise: syncPromise, pull });
  try {
    return await syncPromise;
  } finally {
    if (syncPromises.get(syncKey)?.promise === syncPromise) syncPromises.delete(syncKey);
  }
}

async function runSyncInternal(
  userId: string,
  deviceId: string,
  accessToken: string,
  { pull, untilComplete = false, onProgress }: SyncOptions & { pull: boolean },
): Promise<SyncResult> {
  if (!userId || !accessToken || !deviceId) {
    return { pushed: 0, pulled: 0, errors: 0, pendingPushes: 0, awaitingUser: 0, successful: false, hasMore: false };
  }

  const db = await initDatabase();

  const syncState = await loadSyncState(db, userId);
  const cursors = syncState.cursors;
  await resetTaxonomyCursorsIfEmpty(db, userId, cursors);

  try {
    await ensureDeviceRegistered(db, userId, deviceId, accessToken);
  } catch {
    return { pushed: 0, pulled: 0, errors: 0, pendingPushes: 0, awaitingUser: 0, successful: false, hasMore: syncState.pullPending };
  }

  const { pushed, errors, pendingPushes, awaitingUser } = await drainPushQueue(db, userId, deviceId, accessToken);
  // A push-only caller needs every change on the server, so changes waiting in Sync Issues still block it.
  if (!pull) {
    const successful = errors === 0 && pendingPushes === 0;
    return { pushed, pulled: 0, errors, pendingPushes, awaitingUser, successful, hasMore: syncState.pullPending };
  }
  // A full sync is not retrying changes that wait in Sync Issues, so they do not make it fail.
  const pushSuccessful = errors === 0 && pendingPushes === awaitingUser;

  let pulled = await retryAnomalyEvaluationPulls(db, userId);
  let pullSuccessful = true;
  let hasMore = syncState.pullPending;
  const maxPages = untilComplete ? Number.POSITIVE_INFINITY : MAX_PULL_PAGES_PER_SYNC;
  const progress: PullProgress = { received: 0, total: 0 };
  // Reports while a page is still being applied, so the screen moves as soon as the server answers.
  const reportPage = (pageReceived: number, remaining?: number) => {
    if (remaining !== undefined) progress.total = remaining;
    const received = progress.received + pageReceived;
    onProgress?.({ received, total: Math.max(progress.total, received) });
  };

  for (let page = 0; page < maxPages; page++) {
    const previousHasMore = hasMore;
    let result: Awaited<ReturnType<typeof pullAndApply>>;

    try {
      result = await pullAndApply(db, userId, accessToken, cursors, Boolean(onProgress) && page === 0, onProgress ? reportPage : undefined);
    } catch {
      pullSuccessful = false;
      hasMore = true;
      break;
    }

    pulled += result.pulled;
    if (onProgress) {
      if (result.remaining !== undefined) progress.total = result.remaining;
      progress.received += result.received;
      // Rows can change while paging, so never report more than the total.
      progress.total = Math.max(progress.total, progress.received);
      onProgress({ ...progress });
    }
    pullSuccessful = pullSuccessful && result.successful;
    Object.assign(cursors, result.cursors);
    hasMore = result.successful ? result.hasMore : previousHasMore || result.hasMore;

    if (!result.successful || !result.hasMore) break;
    if (page < maxPages - 1) {
      await new Promise((resolve) => setTimeout(resolve, PULL_PAGE_DELAY_MS));
    }
  }

  await saveCursors(db, userId, deviceId, cursors, hasMore);

  return { pushed, pulled, errors, pendingPushes, awaitingUser, successful: pullSuccessful && pushSuccessful, hasMore };
}

async function resetTaxonomyCursorsIfEmpty(
  db: SQLite.SQLiteDatabase,
  userId: string,
  cursors: Record<string, TableCursor>,
): Promise<void> {
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM categories WHERE user_id = ? AND deleted = 0",
    userId,
  );
  if ((row?.count ?? 0) > 0) return;

  delete cursors.categories;
  delete cursors.subcategories;
}

const PUSH_BATCH_SIZE = 50;
// Each batch excludes the operations already tried with one bound parameter per ID, and SQLite
// allows at most 32,766, so one call tries at most this many. The rest stay pending for the next sync.
const MAX_PUSH_OPERATIONS_PER_SYNC = 5_000;

type PushOutcome = { pushed: number; errors: number; pendingPushes: number; awaitingUser: number };

// Pushes every change queued before this call, one batch at a time, up to MAX_PUSH_OPERATIONS_PER_SYNC.
// Each operation is tried at most once per call, so failing rows cannot take every batch, and changes
// queued while it runs wait for the next call. pendingPushes counts the earlier changes still not on
// the server, and awaitingUser those of them that wait in Sync Issues.
// A batch over the API's body limit (413) is sent again in halves for the rest of the call.
async function drainPushQueue(
  db: SQLite.SQLiteDatabase,
  userId: string,
  deviceId: string,
  accessToken: string,
): Promise<PushOutcome> {
  const boundary = await db.getFirstAsync<{ last_rowid: number | null }>(
    `SELECT MAX(rowid) AS last_rowid FROM sync_queue
     WHERE user_id = ? AND device_id = ? AND ${syncQueueUnsyncedStatusesClause}`,
    userId,
    deviceId,
  );
  const lastRowid = boundary?.last_rowid ?? null;
  if (lastRowid === null) return { pushed: 0, errors: 0, pendingPushes: 0, awaitingUser: 0 };

  const attempted = new Set<string>();
  let pushed = 0;
  let errors = 0;
  let reregistered = false;
  let batchSize = PUSH_BATCH_SIZE;

  while (attempted.size < MAX_PUSH_OPERATIONS_PER_SYNC) {
    const limit = Math.min(batchSize, MAX_PUSH_OPERATIONS_PER_SYNC - attempted.size);
    const batch = await pushQueue(db, userId, deviceId, accessToken, lastRowid, attempted, limit);
    // The server has no active registration for this device, though this device skipped
    // registering because it registered before. Register again once and resend the same batch.
    if (batch.deviceNotRegistered && !reregistered) {
      reregistered = true;
      try {
        await registerDevice(deviceId, accessToken);
      } catch {
        errors += batch.errors;
        break;
      }
      for (const operationId of batch.operationIds) attempted.delete(operationId);
      continue;
    }
    if (batch.tooLarge) {
      batchSize = Math.max(1, Math.floor(batch.selected / 2));
      continue;
    }
    pushed += batch.pushed;
    errors += batch.errors;
    if (batch.selected === 0 || batch.requestFailed) break;
  }

  const remaining = await db.getFirstAsync<{ count: number; exhausted: number | null }>(
    `SELECT COUNT(*) AS count, SUM(CASE WHEN attempts >= ? THEN 1 ELSE 0 END) AS exhausted FROM sync_queue
     WHERE user_id = ? AND device_id = ? AND rowid <= ? AND ${syncQueueUnsyncedStatusesClause}`,
    MAX_SYNC_ATTEMPTS,
    userId,
    deviceId,
    lastRowid,
  );
  return { pushed, errors, pendingPushes: remaining?.count ?? 0, awaitingUser: remaining?.exhausted ?? 0 };
}

type PushBatchOutcome = {
  pushed: number;
  errors: number;
  selected: number;
  requestFailed: boolean;
  deviceNotRegistered?: boolean;
  tooLarge?: boolean;
  operationIds: string[];
};

async function pushQueue(
  db: SQLite.SQLiteDatabase,
  userId: string,
  deviceId: string,
  accessToken: string,
  lastRowid: number,
  attempted: Set<string>,
  batchSize: number,
): Promise<PushBatchOutcome> {
  const excluded = [...attempted];
  const exclusionClause = excluded.length > 0
    ? `AND operation_id NOT IN (${excluded.map(() => "?").join(", ")})`
    : "";
  const rows = await db.getAllAsync<QueueRow>(
    `SELECT * FROM sync_queue
     WHERE user_id = ? AND device_id = ? AND rowid <= ?
        AND ${syncQueueEligibleStatusesClause} ${exclusionClause}
           ORDER BY ${syncQueueOrderByClause} LIMIT ${batchSize}`,
    userId,
    deviceId,
    lastRowid,
    ...excluded,
  );
  const operationIds = rows.map((row) => row.operation_id);
  const idle = { pushed: 0, errors: 0, selected: rows.length, requestFailed: false, operationIds };

  if (rows.length === 0) return idle;
  for (const row of rows) attempted.add(row.operation_id);

  const activeRows = await discardOrphanedCreates(db, rows);
  if (activeRows.length === 0) return idle;

  const repairedRows = await repairLegacyDerivedUpdates(db, activeRows);
  if (repairedRows.length === 0) return idle;

  await repairIncomeSourceSyncRows(db, repairedRows);
  await repairCreditCardDetailSyncRows(db, userId, deviceId, repairedRows);
  await repairCreditCardDetailCreateRows(db, repairedRows);
  await repairCreditCardTransactionSyncRows(db, repairedRows);
  await repairCreditCardPaymentCreateRows(db, userId, repairedRows);

  const operations = repairedRows.map((r) => ({
    operation_id: r.operation_id,
    entity: r.entity,
    record_id: r.record_id,
    operation_type: r.operation_type,
    base_version: r.base_version,
    changed_fields: JSON.parse(r.changed_fields),
    payload: JSON.parse(r.payload),
  }));

  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_BASE}/odin/api/sync/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ payload: { device_id: deviceId, operations } }),
    });
  } catch {
    await recordRequestFailure(db, userId, deviceId, repairedRows, "network error");
    return { pushed: 0, errors: repairedRows.length, selected: rows.length, requestFailed: true, operationIds };
  }

  if (response.status === 413 && repairedRows.length > 1) {
    // Too large to send together: release these rows so the caller resends them in smaller batches.
    for (const operationId of operationIds) attempted.delete(operationId);
    return { pushed: 0, errors: 0, selected: rows.length, requestFailed: false, tooLarge: true, operationIds };
  }

  if (response.status === 413) {
    // One operation alone is over the limit, so resending it can never succeed; it waits in Sync Issues.
    for (const row of repairedRows) await markSyncRejection(db, row.operation_id, SYNC_REJECTION_REASONS.invalidOperation);
    return { pushed: 0, errors: repairedRows.length, selected: rows.length, requestFailed: false, operationIds };
  }

  if (!response.ok) {
    await recordRequestFailure(db, userId, deviceId, repairedRows, `server error: ${response.status}`);
    const deviceNotRegistered = response.status === 400 && await responseErrorCode(response) === DEVICE_NOT_REGISTERED;
    return { pushed: 0, errors: repairedRows.length, selected: rows.length, requestFailed: true, deviceNotRegistered, operationIds };
  }

  const body = await response.json();
  const results = (body?.payload?.results ?? []) as PushResultItem[];

  let pushed = 0;
  let errors = 0;
  const rowsByOperationId = new Map(repairedRows.map((row) => [row.operation_id, row]));

  for (const result of results) {
    if (result.status === "applied" || result.status === "duplicate") {
      await db.runAsync(
        "UPDATE sync_queue SET status = 'synced' WHERE operation_id = ?",
        result.operation_id,
      );
      pushed++;
      continue;
    }
    if (result.status === "conflict") {
      // A rebased row has a base version now, so it is resent at most once in the next batch.
      if (await rebaseLegacyDebtPriorityConflict(db, rowsByOperationId.get(result.operation_id), result)) {
        attempted.delete(result.operation_id);
        continue;
      }
      await markSyncConflict(db, result);
      errors++;
      continue;
    }
    await markSyncRejection(db, result.operation_id, result.reason);
    errors++;
  }

  return { pushed, errors, selected: rows.length, requestFailed: false, operationIds };
}

async function repairCreditCardTransactionSyncRows(
  db: SQLite.SQLiteDatabase,
  rows: QueueRow[],
): Promise<void> {
  for (const row of rows) {
    if (row.entity !== "credit_card_transactions" || row.operation_type !== "create") continue;

    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const changedFields = JSON.parse(row.changed_fields) as string[];
    if (payload.transaction_id) continue;

    payload.transaction_id = row.record_id;
    if (!changedFields.includes("transaction_id")) changedFields.unshift("transaction_id");

    await db.runAsync(
      "UPDATE sync_queue SET payload = ?, changed_fields = ? WHERE operation_id = ?",
      JSON.stringify(payload),
      JSON.stringify(changedFields),
      row.operation_id,
    );
    row.payload = JSON.stringify(payload);
    row.changed_fields = JSON.stringify(changedFields);
  }
}

async function discardOrphanedCreates(
  db: SQLite.SQLiteDatabase,
  rows: QueueRow[],
): Promise<QueueRow[]> {
  const activeRows: QueueRow[] = [];

  for (const row of rows) {
    if (row.operation_type !== "create" || row.entity !== "credit_card_cycles") {
      activeRows.push(row);
      continue;
    }

    const localCycle = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM credit_card_cycles WHERE id = ? AND user_id = ? AND deleted = 0",
      row.record_id,
      row.user_id,
    );
    if (localCycle) {
      activeRows.push(row);
      continue;
    }

    await db.runAsync(
      `UPDATE sync_queue SET status = 'discarded', discarded_at = CURRENT_TIMESTAMP,
       last_error = ? WHERE operation_id = ?`,
      "Discarded because the local credit-card cycle was deleted before sync.",
      row.operation_id,
    );
  }

  return activeRows;
}

async function repairLegacyDerivedUpdates(
  db: SQLite.SQLiteDatabase,
  rows: QueueRow[],
): Promise<QueueRow[]> {
  const activeRows: QueueRow[] = [];

  for (const row of rows) {
    if (row.entity === "credit_card_cycles" && row.operation_type === "update") {
      const changedFields = JSON.parse(row.changed_fields) as string[];
      if (changedFields.length === 1 && changedFields[0] === "statement_date") {
        await db.runAsync(
          "UPDATE sync_queue SET status = 'discarded', discarded_at = CURRENT_TIMESTAMP, last_error = ? WHERE operation_id = ?",
          "Discarded legacy cycle statement-date operation; the statement operation synchronizes this field.",
          row.operation_id,
        );
        continue;
      }
    }
    if (row.operation_type !== "update" ||
      (row.entity !== "financial_accounts" && row.entity !== "credit_card_details")) {
      activeRows.push(row);
      continue;
    }

    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const changedFields = JSON.parse(row.changed_fields) as string[];
    const blockedFields = row.entity === "financial_accounts" ? ["kind"] : [];
    const repairedFields = changedFields.filter((field) => !blockedFields.includes(field));
    for (const field of blockedFields) delete payload[field];

    if (repairedFields.length === 0) {
      await db.runAsync(
        "UPDATE sync_queue SET status = 'discarded', discarded_at = CURRENT_TIMESTAMP, last_error = ? WHERE operation_id = ?",
          "Discarded immutable fields from a legacy sync operation.",
        row.operation_id,
      );
      continue;
    }

    row.payload = JSON.stringify(payload);
    row.changed_fields = JSON.stringify(repairedFields);
    await db.runAsync(
      "UPDATE sync_queue SET payload = ?, changed_fields = ? WHERE operation_id = ?",
      row.payload,
      row.changed_fields,
      row.operation_id,
    );
    activeRows.push(row);
  }

  return activeRows;
}

async function repairIncomeSourceSyncRows(
  db: SQLite.SQLiteDatabase,
  rows: QueueRow[],
): Promise<void> {
  for (const row of rows) {
    if (row.entity !== "income_sources") continue;
    if (row.operation_type !== "create" && row.operation_type !== "update") continue;

    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const changedFields = JSON.parse(row.changed_fields) as string[];

    const needsRepair =
      payload.destination_account_id == null ||
      payload.subcategory_id == null ||
      payload.recurring_template_id == null;

    if (!needsRepair) continue;

    const localRow = await db.getFirstAsync<IncomeSourceSyncFields>(
      `SELECT recurring_template_id, destination_account_id, subcategory_id
       FROM income_sources WHERE id = ?`,
      row.record_id,
    );

    if (!localRow) continue;

    let touched = false;

    if (payload.destination_account_id == null && localRow.destination_account_id) {
      payload.destination_account_id = localRow.destination_account_id;
      if (!changedFields.includes("destination_account_id")) changedFields.push("destination_account_id");
      touched = true;
    }

    if (payload.subcategory_id == null && localRow.subcategory_id) {
      payload.subcategory_id = localRow.subcategory_id;
      if (!changedFields.includes("subcategory_id")) changedFields.push("subcategory_id");
      touched = true;
    }

    if (payload.recurring_template_id == null && localRow.recurring_template_id) {
      payload.recurring_template_id = localRow.recurring_template_id;
      if (!changedFields.includes("recurring_template_id")) changedFields.push("recurring_template_id");
      touched = true;
    }

    if (!touched) continue;

    row.payload = JSON.stringify(payload);
    row.changed_fields = JSON.stringify(changedFields);

    await db.runAsync(
      "UPDATE sync_queue SET payload = ?, changed_fields = ? WHERE operation_id = ?",
      row.payload,
      row.changed_fields,
      row.operation_id,
    );
  }
}

async function repairCreditCardDetailSyncRows(
  db: SQLite.SQLiteDatabase,
  userId: string,
  deviceId: string,
  rows: QueueRow[],
): Promise<void> {
  for (const row of rows) {
    if (row.entity !== "financial_accounts" || (row.operation_type !== "create" && row.operation_type !== "update")) continue;
    const accountPayload = JSON.parse(row.payload) as Record<string, unknown>;
    if (accountPayload.kind !== "credit_card") continue;

    const details = await db.getFirstAsync<{
      account_id: string;
      issuer: string | null;
      credit_limit_centavos: number;
      available_credit_centavos: number | null;
      reconciled_available_credit_centavos: number | null;
      pre_reconciliation_available_credit_centavos: number | null;
      available_credit_reconciled_at: string | null;
      cutoff_day: number;
      statement_day: number | null;
      notes: string | null;
      billing_cycle_days: number | null;
      alert_threshold_percent: number | null;
      allows_extra_payments: number;
    }>("SELECT account_id, issuer, credit_limit_centavos, available_credit_centavos, reconciled_available_credit_centavos, pre_reconciliation_available_credit_centavos, available_credit_reconciled_at, cutoff_day, statement_day, notes, billing_cycle_days, alert_threshold_percent, allows_extra_payments FROM credit_card_details WHERE account_id = ? AND user_id = ? AND deleted = 0", row.record_id, userId);
    if (!details) continue;

    const queued = await db.getFirstAsync<{ operation_id: string }>(
      "SELECT operation_id FROM sync_queue WHERE user_id = ? AND device_id = ? AND record_id = ? AND entity = 'credit_card_details' AND status IN ('pending', 'failed') LIMIT 1",
      userId,
      deviceId,
      row.record_id,
    );
    if (queued) continue;

    const payload = {
      account_id: details.account_id,
      issuer: details.issuer,
      credit_limit_centavos: details.credit_limit_centavos,
      cutoff_day: details.cutoff_day,
      statement_day: details.statement_day,
      notes: details.notes,
      billing_cycle_days: details.billing_cycle_days,
      alert_threshold_percent: details.alert_threshold_percent,
      allows_extra_payments: details.allows_extra_payments === 1,
    };
    await enqueueOperation(db, {
      userId,
      deviceId,
      entity: "credit_card_details",
      recordId: row.record_id,
      operationType: "create",
      baseVersion: null,
      changedFields: Object.keys(payload),
      payload,
      failureMessage: "This credit-card information could not be synchronized.",
    });
  }
}

// A failed request says nothing about its rows: the server reports each bad operation in its results,
// and request errors (network, outage, rate limit, inactive device) are about the connection. So the
// rows keep their attempts and only remember the error.
async function recordRequestFailure(
  db: SQLite.SQLiteDatabase,
  userId: string,
  deviceId: string,
  rows: QueueRow[],
  error: string,
): Promise<void> {
  for (const row of rows) {
    await db.runAsync(
      "UPDATE sync_queue SET last_error = ? WHERE operation_id = ? AND user_id = ? AND device_id = ?",
      error,
      row.operation_id,
      userId,
      deviceId,
    );
  }
}

async function pullAndApply(
  db: SQLite.SQLiteDatabase,
  userId: string,
  accessToken: string,
  cursors: Record<string, TableCursor>,
  includeRemaining = false,
  onApplied?: (applied: number, remaining?: number) => void,
): Promise<{ pulled: number; received: number; remaining?: number; cursors: Record<string, TableCursor>; successful: boolean; hasMore: boolean }> {
  const remainingParam = includeRemaining ? "&include_remaining=1" : "";
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_BASE}/odin/api/sync/pull?cursors=${encodeURIComponent(JSON.stringify(cursors))}${remainingParam}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Cache-Control": "no-cache",
        },
      },
    );
  } catch {
    return { pulled: 0, received: 0, cursors, successful: false, hasMore: false };
  }

  if (!response.ok) return { pulled: 0, received: 0, cursors, successful: false, hasMore: false };

  const body = await response.json();
  const payload = body?.payload as {
    cursors: Record<string, TableCursor>;
    changes: Record<string, Record<string, unknown>[]>;
    has_more: Record<string, boolean>;
    remaining?: Record<string, number>;
    successful: boolean;
  } | null;

  // Without the server's has_more flags the client cannot tell a full page from the last one.
  if (!payload?.changes || !payload.has_more) {
    return { pulled: 0, received: 0, cursors: payload?.cursors ?? cursors, successful: false, hasMore: false };
  }

  const received = Object.values(payload.changes).reduce((sum, rows) => sum + (rows?.length ?? 0), 0);
  const remaining = payload.remaining
    ? Object.values(payload.remaining).reduce((sum, count) => sum + count, 0)
    : undefined;

  let pulled = 0;
  let applied = 0;
  onApplied?.(0, remaining);

  for (const table of SYNCED_TABLES) {
    const rows = payload.changes[table];
    if (!rows || rows.length === 0) continue;

    for (const row of rows) {
      if (++applied % PROGRESS_REPORT_ROWS === 0) onApplied?.(applied, remaining);
      const normalized = normalizePullRow(table, row as Record<string, unknown>, userId);
      try {
        await applyPullRow(db, table, normalized);
        pulled++;
      } catch (error) {
        const recordId = String(row.id ?? normalized.id ?? row.account_id ?? normalized.account_id ?? row.transaction_id ?? "unknown");
        const reason = error instanceof Error ? error.message : "unknown error";
        // Quarantine only the bad row so a malformed remote record cannot block later changes.
        await db.runAsync(
          `INSERT INTO sync_pull_failures (user_id, table_name, record_id, payload, last_error, attempts, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id, table_name, record_id) DO UPDATE SET
             payload=excluded.payload, last_error=excluded.last_error,
             attempts=sync_pull_failures.attempts + 1, updated_at=CURRENT_TIMESTAMP`,
          userId,
          table,
          recordId,
          JSON.stringify(row),
          reason,
        );
        console.error("[sync/pull] local apply failed", {
          table,
          recordId,
          reason,
        });
      }
    }
  }

  const hasMore = Object.values(payload.has_more).some(Boolean);

  return { pulled, received, remaining, cursors: payload.cursors, successful: payload.successful !== false, hasMore };
}

async function loadSyncState(
  db: SQLite.SQLiteDatabase,
  userId: string,
): Promise<{ cursors: Record<string, TableCursor>; pullPending: boolean }> {
  const row = await db.getFirstAsync<{ pull_cursor: string | null; pull_pending: number | null }>(
    "SELECT pull_cursor, pull_pending FROM sync_state WHERE user_id = ?",
    userId,
  );
  if (!row?.pull_cursor) return { cursors: {}, pullPending: row?.pull_pending === 1 };
  try {
    return { cursors: JSON.parse(row.pull_cursor), pullPending: row.pull_pending === 1 };
  } catch {
    return { cursors: {}, pullPending: row.pull_pending === 1 };
  }
}

async function saveCursors(
  db: SQLite.SQLiteDatabase,
  userId: string,
  deviceId: string,
  cursors: Record<string, TableCursor>,
  pullPending: boolean,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_state
     (user_id, device_id, pull_cursor, pull_pending, last_sync_at)
     VALUES (?, ?, ?, ?, ?)`,
    userId,
    deviceId,
    JSON.stringify(cursors),
    pullPending ? 1 : 0,
    new Date().toISOString(),
  );
}
