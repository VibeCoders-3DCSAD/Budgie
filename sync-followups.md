# Sync Follow-ups

**Date:** 2026-11-02 (Asia/Manila)
**Context:** Found in the self-review of the fixes for audit findings 2 and 5 (`audit.md`). Neither is a regression; both are left for a later change.

## 1. Very large queues can exceed SQLite's bound-parameter limit

**Severity:** WARNING — Performance / Error Handling

**Files:** `apps/app/local-db/sync/runSync.ts` (`drainPushQueue`, `pushQueue`)

Each sync run keeps the IDs of the operations it has already tried and excludes them from the next batch with `operation_id NOT IN (?, ?, …)`. That list grows by up to 50 per batch for the whole run. SQLite rejects a statement with more than 32,766 bound parameters, so a queue of more than about 32,000 operations would make the sync throw ("too many SQL variables"). Long before that, every batch query also gets slower, because it rebinds the whole list.

This needs an unusually large offline queue, so it is unlikely in practice.

**Fix:** Cap how many operations one run attempts (for example 5,000), stop draining at the cap, and report the rest as `pendingPushes` so the next sync continues. Alternatively, track attempted IDs in a temporary table and exclude them with a join. Test a queue just above the cap.

## 2. Changes waiting in Sync Issues make every full sync report failure

**Severity:** WARNING — Logic

**Files:** `apps/app/local-db/sync/runSync.ts` (`runSyncInternal`, `drainPushQueue`); `apps/app/features/dashboard/hooks/useDashboardData.ts` (`refreshDashboardData`)

`pendingPushes` counts every unsynced row queued before the run, including exhausted rows (`attempts >= MAX_SYNC_ATTEMPTS`). Those rows now wait for the user in the Sync Issues sheet and are no longer retried automatically. Because they count as unsent, every full sync returns `successful: false` while any exhausted row exists. `refreshDashboardData` then throws `sync_failed` and skips the forecast snapshot refresh, even though nothing in that sync failed.

This is not a regression. Before the fix those rows were retried, and failed, on every sync, so `successful` was already false. Now that they are excluded from automatic retries, a full sync can tell them apart.

**Fix:** Return exhausted rows as a separate count (for example `awaitingUser`). For a full sync, report success when the only unsent rows are exhausted ones, and surface them through the existing Sync Issues badge. The Financial Plan's push-only sync must keep blocking on them, because the server plan would otherwise miss those changes. Test a full sync with one exhausted row (successful, dashboard refreshes) and a push-only sync with the same row (not successful).
