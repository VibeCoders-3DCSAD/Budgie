import * as SQLite from "expo-sqlite";
import { authorizeLocalRequest } from "../../lib/localAccess";
import { initDatabase } from "../client";
import {
  normalizePullRow,
  applyPullRow,
  SYNCED_TABLES,
} from "./pullConvergence";
import { retryAnomalyEvaluationPulls } from "./retryAnomalyEvaluationPulls";
import { ensureDeviceRegistered } from "./deviceRegistration";
import { drainPushQueue } from "./pushQueue";
import { API_BASE, fetchWithTimeout } from "./syncRequest";

const MAX_PULL_PAGES_PER_SYNC = 3;
const PULL_PAGE_DELAY_MS = 100;
const PROGRESS_REPORT_ROWS = 25;

const syncPromises = new Map<string, { promise: Promise<SyncResult>; pull: boolean }>();

type TableCursor = { ts: string; id: string };

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
