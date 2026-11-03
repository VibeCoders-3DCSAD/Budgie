# Standards Compliance Audit — Odin

**Date:** 2026-11-02 (Asia/Manila)
**Scope:** Whole `odin` repository at commit `2f28c19`: Expo app, Express API, shared packages, Supabase migrations/tests, scripts, deployment, and project/QA guidance. The sibling `odin-ml` implementation is outside scope.

**Method and limits:** Inventory came from `git ls-files -co --exclude-standard` (1,401 candidate files), excluding secrets, binaries, dependencies, generated/build output, and ignored paths from the audit corpus. Existing Graphify relationships informed source navigation; findings were checked against current source. This is a bounded whole-repository review with broad pattern searches and focused call-chain inspection, not a claim that every line was exhaustively reviewed. The previous September migration-only report is superseded; repaired findings were not carried forward automatically. Exactly this report is the repository deliverable; no production fixes were made.

## Overall Score

Counts reflect each finding's primary category exactly once; severity is separate from category. ERROR means a demonstrated defect or violation; WARNING means a probable issue, scaling risk, or lower-severity maintainability concern. This table is not a percentage grade.

| Category | ERRORs | WARNINGs |
|---|---:|---:|
| Security | 2 | 1 |
| Data Integrity | 6 | 3 |
| Performance | 0 | 5 |
| Code Quality | 0 | 2 |
| Error Handling | 1 | 4 |
| Logic | 2 | 0 |
| Testing | 1 | 1 |
| DevOps | 0 | 1 |
| API Design | 1 | 0 |
| **Total** | **13** | **17** |

## Resolution Log

**2026-11-02:** Findings 1, 6, 8, 9, 22 and 26 resolved. Findings 2, 3, 4, 5, 7 and 10 resolved afterwards.

**2026-11-03:** Findings 11, 12, 13, 14 and 15 resolved. Findings 17, 18, 19 and 20 resolved afterwards; finding 16 resolved after a local run and a clean replay. Findings 23, 24 and 25 resolved afterwards; finding 21 resolved after its first CI runs. Findings 27, 29 and 30 resolved afterwards; finding 28 remains open, and the same coupling in `DebtManagerScreen` is recorded in `audit-followups.md` (item 5). The counts above are the original audit totals.

Verification for 27, 29 and 30 (Node 24.22.1): API 72 suites / 818 tests pass; both TypeScript checks pass; app 181 suites / 1,103 tests pass with no failures.

Verification for 21 and 23–25 (Node 24.22.1, clean worktree with no `.env` files): API 71 suites / 814 tests pass; both TypeScript checks pass; app 179 suites / 1,096 tests pass (`FinancialPlanScreen.test.tsx` failed once and passed on two reruns). All 19 `supabase/tests/*.sql` files pass against the local stack. That stack already has `20261116000027` applied, so the extended `transaction_balance_reconciliation.sql` from finding 16 passes too. That is not a clean replay; the CI `database` job does one.

Verification for 16–20 (Node 24.22.1): API 70 suites / 810 tests pass; both TypeScript checks pass; app 179 suites / 1,089 tests pass with **no failures** (finding 20's five pre-existing failures are fixed). Migration `20261116000027` and the extended `transaction_balance_reconciliation.sql` have **not been applied or run**: Docker was not running.

Verification for 11–15 (Node 24.22.1): API 68 suites / 803 tests pass; both TypeScript checks pass; app 1,078 tests pass with the same 5 pre-existing failures as finding 20. Migration `20261116000026` is **not yet applied locally** and `governance_requests.sql` was not run: local Supabase was down (Docker not running).

Verification for 2, 3, 4, 5, 7 and 10 (Node 24.22.1): API 66 suites / 788 tests pass; both TypeScript checks pass; app 1,075 tests pass with the same 5 pre-existing failures as finding 20. Migrations `20261116000024` and `20261116000025` are applied locally; `governance_requests.sql`, `sync_rpc_contract.sql` and `financial_plan_documents.sql` pass. Clean-database replay is still pending.

Pattern sweep for finding 8 (other `public` SECURITY DEFINER functions that trust a caller-supplied `p_user_id`):

- `write_daily_financial_report` was revoked from `PUBLIC` and `authenticated` but not `anon`, so with Supabase's default grants it was probably callable with the anon key to write reports and alerts for any user. Deployed ACLs were not queried.
- `seed_hfce_taxonomy_for_user` and `seed_hfce_subcategories_for_user` had no revocation.
- Migration `20261116000023` revokes all three from `PUBLIC`, `anon` and `authenticated` and grants `service_role` only. Their callers (service-role seed scripts and the SECURITY DEFINER signup trigger) are unaffected. `sync_rpc_contract.sql` now checks this, and local catalog privileges were verified.

Verification on the pinned runtime (Node 24.22.1, pnpm 10.26.1): API 64 suites / 779 tests pass; both TypeScript checks pass; app 1,064 tests pass with the same 5 pre-existing failures as finding 20. Both migrations are applied locally, but a full clean-database replay (`supabase db reset`) has not been run.

## CRITICAL — No confirmed critical finding

No cross-user takeover or unauthenticated destructive path was established in the reviewed source. Database deployment state was not inspected.

## HIGH — Fix before relying on affected behavior

### 1. Logout returns success without revoking the session — ✅ Resolved

**Severity:** ERROR — Security

**Status:** Resolved 2026-11-02. `/logout` revokes the request's own session with `auth.admin.signOut(token, "local")` and treats 401/403/404 as already logged out; failures are logged with `user_id`. The app clears the Supabase SDK session and the in-memory access token on lock (`apps/app/lib/sdkSessionStorage.ts`), keeps the refresh token in the protected record, and re-verifies automatically when the device comes online. Tests: `auth.logout.test.ts`, `authLifecycle.test.ts`.

**Files:** `apps/api/src/routes/auth.ts:359–380`; `apps/api/src/lib/supabase.ts:36–51`; `apps/api/src/__tests__/routes/auth.logout.test.ts:6–21`

The request client has an Authorization header but no SDK auth session: the factory never calls `setSession`. `/logout` calls `auth.signOut()`, which reads the SDK session rather than the global header. A reproduction using the installed SDK, a dummy URL, an Authorization header, and a fetch spy returned `{error:null}` with **zero HTTP calls**. The endpoint therefore reports `logged_out:true` while the refresh token remains usable. The mobile logout flow trusts that response. Existing tests mock `signOut` and cannot detect this.

**Fix:** Revoke using the verified request JWT through the SDK's server logout API, with an explicitly chosen session scope. Test that a revocation request contains that JWT and that its refresh token cannot mint another session. Existing access JWTs remain valid until expiry; do not promise immediate JWT revocation.


### 2. Financial Plan generation proceeds with an incompletely pushed queue — ✅ Resolved

**Severity:** ERROR — Data Integrity

**Status:** Resolved 2026-11-02. Every sync now pushes, batch by batch, everything queued before it started (`drainPushQueue` in `runSync.ts`), trying each operation at most once per run. It reports `pendingPushes` for earlier changes still not on the server. A push-only sync succeeds only when there are no errors and nothing is left, so the Financial Plan no longer generates over unsent changes. A push-only request no longer reuses an in-flight run; it waits for it and runs again so its own changes are sent. Tests: `runSyncPushDrain.test.ts` (51 operations, a change queued during a run, a push-only request behind an in-flight one).

**Files:** `apps/app/local-db/sync/runSync.ts:125–126,190–202`; `apps/app/features/financial-plan/FinancialPlanScreen.tsx:121–134`

`pushQueue` selects at most 50 operations. A push-only run invokes it once, then returns `successful: errors === 0` without checking the remaining queue; `hasMore` describes pending pulls. Financial Plan generation uses that success as evidence that recent local spending and unusual-spending evaluations reached the server. With 51 eligible changes, a successful first batch leaves at least one change behind while generation continues. Reusing an in-flight sync also does not establish that changes queued after its selection were sent.

**Fix:** Add a queue-drain operation that pushes through a captured queue boundary, returns explicit remaining-push counts, and blocks dependent generation on failures or unfinished pushes. Cover 51+ operations and edits added during an in-flight run.


### 3. The consent withdrawal contract cannot be persisted — ✅ Resolved

**Severity:** ERROR — Data Integrity

**Status:** Resolved 2026-11-02. `POST /consents` sets a server-generated `withdrawn_at` on withdrawals and ignores any client value. Tests: `consents.test.ts`; `supabase/tests/governance_requests.sql` checks the real constraint and a grant followed by a withdrawal.

**Files:** `apps/api/src/routes/consents.ts:29–52`; `supabase/migrations/20260616064145_priority_modules_v3.sql:593–604`

The route explicitly accepts `status: "withdrawn"`, but inserts only user, kind, status, and version. The database requires `withdrawn_at IS NOT NULL` for that status. There is no later migration or consent trigger supplying the missing value. A valid withdrawal request therefore violates the check and becomes a generic HTTP 500 instead of recording withdrawal. This is established from the final migration text, not a live database execution.

**Fix:** Set a server-generated `withdrawn_at` for withdrawal events and persist the event atomically. Add a real constraint-backed test for grant followed by withdrawal.


### 4. An older grant overrides a newer consent withdrawal — ✅ Resolved

**Severity:** ERROR — Logic

**Status:** Resolved 2026-11-02. Migration `20261116000024` adds `user_current_consents`, a `security_invoker` view with the newest event per consent kind and version (`recorded_at DESC, id DESC`). `/me?include=consents` reads it, so unrelated history can no longer push the current terms past a limit. `hasCurrentTermsConsent` evaluates the newest current-terms event whatever the list order. Tests: `constants.test.ts` (grant then withdrawal, withdrawal then grant), `me.test.ts`, `governance_requests.sql` (including RLS on the view).

**Files:** `apps/app/features/governance/constants.ts:6–11`; `apps/api/src/routes/me.ts:69–75`; `apps/app/features/governance/__tests__/constants.test.ts:3–17`

`hasCurrentTermsConsent` uses `some` over history. Given a newer withdrawn event and an older granted event for the same current terms version, it returns true. The API orders events newest first, but the helper ignores that ordering. Once withdrawals are persisted, withdrawn terms can still be treated as accepted. Separately, the global 20-event limit can hide a still-current terms event behind unrelated consent history.

**Fix:** Resolve the latest event per consent kind/version on the server with deterministic ordering, then evaluate that event's status. Test grant → withdrawal, withdrawal → grant, and more than 20 unrelated events.


### 5. Permanent sync failures can starve all later queue entries — ✅ Resolved

**Severity:** ERROR — Data Integrity

**Status:** Resolved 2026-11-02. Rows with `attempts >= MAX_SYNC_ATTEMPTS` leave automatic selection and wait in the existing Sync Issues sheet for the user to retry or discard them. Conflicts and permanent rejections (`version_conflict`, `record_deleted`, and the new `invalid_operation`) are exhausted at once. Retryable rejections (`record_not_found`, `reference_unavailable`, `sync_rejected`) keep their three attempts. `/sync/push` now rejects a malformed operation by itself in the results instead of failing the whole batch with a 400. A request-level failure (network, any non-2xx response) no longer spends attempts, because it says nothing about individual rows, so neither being offline nor an inactive device can exhaust the queue. Logout retries its sync a fixed three times. Within one run every operation is tried at most once, so failing rows cannot take every batch. Dependency ordering is unchanged. Tests: `runSyncPushDrain.test.ts` (a full first batch of conflicts, a retried missing reference, a network failure, a rejected request, a malformed operation), `sync.push.test.ts`, `SyncProvider.test.tsx` (logout retries). Two remaining edge cases are recorded in `audit-followups.md` (items 1 and 2).

**Files:** `apps/app/local-db/sync/queueOrder.ts:3, apps/app/local-db/sync/queueOrder.ts:8, apps/app/local-db/sync/runSync.ts:190, apps/app/local-db/sync/syncConflict.ts:18`

Queue selection always includes both `pending` and `failed`, sorts by entity priority and creation order, and takes only 50 rows. Rejected operations and ordinary version conflicts are marked failed without changing their ordering or rebasing them. Each sync pushes one selected batch; `untilComplete` drains pulls only.

**Risk:** Fifty permanently rejected or conflicting high-priority entries occupy every batch forever. Valid later operations never reach the server. Even a smaller failed set permanently consumes batch capacity. Retrying transient failures is useful, but the current policy has no fairness or terminal-conflict distinction.

**Fix:** Separate retryable failures from conflicts and permanent validation failures. Preserve dependency ordering while using a fair retry schedule, backoff, and explicit conflict resolution. Test a queue with more than 50 entries and a permanently failing first batch; later independent operations must still progress.

**Evidence limit:** Retry scheduling was traced statically; no user queue was modified.


### 6. Reauthentication cancels deletion requests using the wrong client — ✅ Resolved

**Severity:** ERROR — Data Integrity

**Status:** Resolved 2026-11-02. Cancellation runs through the request-authenticated client and throws after its retries instead of reporting success. Password sign-in and sign-up use a per-request client (`createAnonAuthClient`), so the shared module client never holds a user session.

**Files:** `apps/api/src/services/auth/userBootstrapService.ts:39`

`bootstrapAuthenticatedUser` creates a request-authenticated client, but `cancelActiveDeletionRequests` writes through the module-global anon client instead. On `/auth/session` after a fresh server start, this singleton has no user session. It can also retain the session from an unrelated password login. The deletion-request policy requires `user_id = auth.uid()`.

**Risk:** Reauthentication can report success without cancelling the user's pending deletion. RLS may simply match zero rows, which the helper treats as success; explicit failures are retried three times and then swallowed. The user could continue using an account still scheduled for deletion. This does not prove an account-deletion worker is deployed.

**Fix:** Pass the request-authenticated client into the cancellation helper, verify the intended state change, and propagate unrecoverable cancellation failures. Test session restoration with distinct anon and authenticated client mocks, including a zero-row update and an RLS error.


### 7. Forecast history silently truncates below the intended limit — ✅ Resolved

**Severity:** WARNING — Data Integrity

**Status:** Resolved 2026-11-02. Both plan paths read history through `historyQueries.ts`: posted expenses from the history start only, ordered by `transaction_date, id` and paged until an empty page, so a lower hosted `max_rows` cannot end the read early. Scheduled-payment records are paged the same way. A failed page returns its error instead of partial history; more than 50,000 rows fails the plan explicitly. If the forecast payload exceeds the ML limit of 2,000, the existing logged fallback to past spending still applies. Tests: `historyQueries.test.ts` (2,500 rows, a server capping pages at 500, the 50,000-row ceiling).

**Files:** `supabase/config.toml:18, apps/api/src/services/financialPlan/period.ts:6, apps/api/src/services/financialPlan/planForecast.ts:20, apps/api/src/services/financialPlan/recommendationService.ts:167`

Both plan paths request up to 2,000 transactions and scheduled-payment records using a single `.limit(MAX_HISTORY)` call. Local PostgREST is configured with `max_rows = 1000`. There is no paging or truncation check. The transaction query also fetches all posted transaction types before the in-memory forecast filter removes irrelevant rows.

**Risk:** Likely incomplete history for busy accounts: older months disappear, and income/transfers can crowd out relevant expenses. Scheduled-payment exclusions can also be incomplete. Deployed row limits were not inspected, so the exact production threshold remains unverified.

**Fix:** Filter the required history window and transaction types in SQL, page with stable ordering, and detect any intentional sample cap explicitly. Add a test containing more than 1,000 mixed transactions and verify all required months and biller exclusions reach the forecast.


### 8. The financial-plan base RPC remains in the exposed schema — ✅ Resolved

**Severity:** WARNING — Security

**Status:** Resolved 2026-11-02. Migration `20261116000022` moves the base function to `private`, revokes it from `PUBLIC`, `anon` and `authenticated`, grants `service_role` only, and repoints the wrapper. Verified locally: `sync_rpc_contract.sql`, `financial_plan_allocation_precision.sql` and `financial_plan_documents.sql` pass, and catalog privileges match. Clean-database replay is still pending.

**Files:** `supabase/migrations/20261027000004_recreate_financial_plan_sync_rpc.sql:4–46,73–74`; `supabase/migrations/20261116000001_preserve_financial_plan_precision.sql:119–136`; `supabase/migrations/20261116000019_match_financial_plan_allocation_sum_precision.sql:4`; `supabase/config.toml:13`

The base financial-plan function is created in public, while explicit revocation only targets the canonical wrapper. No later explicit revocation of the base function was found. The broad alias revocation in migration 20261116000010 matches `apply_sync_operation%`, which does not cover `apply_financial_plan_sync_operation_base`. Under normal PostgreSQL function defaults this leaves a probable callable internal entrypoint. It inserts normalized rows without the outer wrapper's accepted JSON document and surplus preservation. Cross-user writes were not established, and effective deployed ACLs were not queried.

**Fix:** Revoke API-role execution on the base and move it into the private schema, leaving the authenticated canonical wrapper as the entrypoint. Verify effective catalog grants and negative direct-call tests after clean replay. Older generic dispatcher aliases were already revoked by the later broad migration and are not included in this finding.

## MEDIUM — Correct in the next hardening cycle

### 9. Classification logs disclose exact user financial amounts — ✅ Resolved

**Severity:** ERROR — Security

**Status:** Resolved 2026-11-02. The classification log now carries only `user_id` and presence flags. The same disclosure in `apps/api/src/services/savings/emergencyFundBalance.ts` (starting amount, contributions, withdrawals and balance) was removed too; it logs the goal ID, a presence flag and an activity count.

**Files:** `apps/api/src/services/classification/financialConditionAssessmentService.ts:76–80`

The classification service logs the user's identifier together with exact emergency savings and monthly essential spending. These are personal financial data, and this unconditional informational log has no demonstrated need for the actual values. Every reassessment copies them into infrastructure logs with a separate access and retention boundary.

**Fix:** Remove the amounts. Log a request identifier, assessment outcome, model version, and safe availability flags or counts. Inspect existing log retention and sweep other financial diagnostic logs for the same disclosure pattern.


### 10. Creating a new export can cancel the old one and then fail — ✅ Resolved

**Severity:** ERROR — Data Integrity

**Status:** Resolved 2026-11-02. Migration `20261116000025` adds `replace_data_export_request(jsonb)`, a `SECURITY INVOKER` function that takes a per-user advisory lock, cancels the active export and inserts the new one in one transaction. A partial unique index allows one active export per user; older duplicate active rows are cancelled first. The function is closed to `anon`. The route makes one RPC call. Tests: `data-export-requests.test.ts`, `governance_requests.sql` (replacement, cardinality, a second active insert rejected, anon privileges).

**Files:** `apps/api/src/routes/data-export-requests.ts:67–99`

Replacing an export performs one HTTP/database transaction to cancel every requested/processing export and another to insert its replacement. If insertion fails, the old work stays cancelled and the user gets no replacement. Concurrent requests can also interleave their cancellation and insertion steps and leave multiple active exports. The schema's user/status index is non-unique.

**Fix:** Move replacement into one database transaction/RPC, lock a stable per-user row, and enforce the intended active-request cardinality. Verify rollback on insert failure and concurrent retries.


### 11. Deletion request uniqueness relies on a race-prone read before insert — ✅ Resolved

**Severity:** WARNING — Data Integrity

**Status:** Resolved 2026-11-03. Migration `20261116000026` cancels older duplicate active requests and adds a partial unique index allowing one `requested` or `processing` deletion request per user. The route answers 500 when the active-request check fails, and 409 when the insert hits the index after losing a race. Tests: `account-deletion-requests.test.ts` (failed check, unique violation), `governance_requests.sql` (second requested or processing request rejected; a new one allowed after cancellation).

**Files:** `apps/api/src/routes/account-deletion-requests.ts:36–69`; `supabase/migrations/20260616064145_priority_modules_v3.sql:628–648`

The route checks for an active request, then inserts separately. Two concurrent submissions can both observe none and insert. No unique active-request constraint appears in the migration history. The initial query also discards its error and continues as though no request exists. Duplicate or overlapping deletion schedules are a probable outcome under concurrent retries; this audit did not execute a deletion worker.

**Fix:** Check the read error, and enforce one active deletion request per user with a partial unique index and an atomic create-or-return RPC. Translate uniqueness conflicts to the existing 409 response.


### 12. Device registration acknowledges database failures as success — ✅ Resolved

**Severity:** ERROR — Error Handling

**Status:** Resolved 2026-11-03. `registerDevice` is one upsert on `(user_id, device_id)` that throws unless an active row comes back. The failure was worse than recorded: a pull writes `sync_state.device_id` even when pushes fail, and the app skips registration once that row exists, so a lost registration refused every later push while changes stayed queued. A push from a device with no registration row now returns `code: device_not_registered` (`@odin/sync-config`), and the app registers again and resends that batch once per run. A deactivated device gets no code, so it cannot reactivate itself. Tests: `userDevices.test.ts`, `sync.push.test.ts`, `runSyncPushDrain.test.ts` (recovery, and only one re-registration per run).

**Files:** `apps/api/src/services/sync/syncService.ts:257–282`; `apps/api/src/routes/sync.ts:157–161`; `apps/app/local-db/sync/runSync.ts:674–678`

`registerDevice` ignores the lookup error and the insert/update result errors. A denied or failed write still reaches HTTP 200 with `status: registered`. A subsequent push can be rejected as inactive even though registration succeeded from the client's perspective. The client also has a local registration shortcut, so false success can obstruct recovery. Concurrent first registrations can hit this ignored-error path as well.

**Fix:** Check and propagate all errors. Replace select-then-write with an owner-scoped upsert under the existing uniqueness rule, and only acknowledge a verified write. Test lookup, insert, update, and concurrent registration failures.


### 13. Commitment calculations silently treat truncated lists as complete — ✅ Resolved

**Severity:** WARNING — Data Integrity

**Status:** Resolved 2026-11-03. Debts, savings goals, statements and scheduled payments are read in full, in `id` order, a page at a time through `readAllPages` (finding 7). A failed page fails the plan instead of reserving part of the commitments. Tests: `commitmentsLoader.test.ts` (1,500 payments and 150 goals with 500-row server pages, a failed page). Other plan inputs in `recommendationService.loadPlanInputs` (accounts at 100, categories and subcategories at 200) still use single capped reads and are outside this finding.

**Files:** `apps/api/src/services/financialPlan/commitmentsLoader.ts:13–18,26–37`

Commitment inputs are capped at 100 debts, 100 goals, 100 statements, and 200 scheduled payments. The service converts the returned subset into total commitments without fetching another page or reporting truncation; there is no stable order on most lists. For users exceeding a cap, the Financial Plan can likely under-reserve obligations and overstate available category funds. Bounding selector lists is appropriate, but silently truncating financial totals is not.

**Fix:** Page through all matching commitments using a stable key, or compute complete due totals/reservations in a database RPC. If product limits are intended, enforce them on creation and return an explicit error when existing data exceed them.


### 14. Sync validation repeats remote ownership lookups per operation — ✅ Resolved (duplicates removed)

**Severity:** WARNING — Performance

**Status:** Resolved 2026-11-03 for the proven duplication: a transaction update checks each supplied account once (two lookups, not four). Test: `transactionUpdateLookups.test.ts`. Batching lookups across a push was not done: a cached result would be wrong when an earlier operation in the same batch deletes the account. One lookup per reference per operation remains.

**Files:** `apps/api/src/services/sync/syncService.ts:92–108`; `apps/api/src/services/sync/syncTransactions.ts:86–90,106–124`; `apps/api/src/services/sync/syncOwnership.ts:19–25`

The push loop awaits preparation and an RPC per operation. Preparation invokes remote ownership queries for each referenced account/category. Transaction updates additionally verify each supplied source/destination twice: once at lines 86–90 and again at 120–124. An update carrying both accounts costs four account lookups plus a current-row lookup and a mutation RPC, before optional category checks. This is a proven repeated-query path, scaling with queued operations; the magnitude of real latency was not measured.

**Fix:** Remove duplicate checks, batch distinct referenced IDs within a push and build owner-scoped lookup maps, or validate and apply an ordered batch inside one RPC. Preserve operation dependencies and database-side ownership checks; blindly parallelizing dependent writes is unsafe.


### 15. Scheduled-payment catch-up re-aggregates all payment history per biller — ✅ Resolved

**Severity:** WARNING — Performance

**Status:** Resolved 2026-11-03. Catch-up reads `listPaidForScheduledPayment`, the same aggregate filtered to one scheduled payment and served by the existing `(user_id, scheduled_payment_id, occurrence_date)` index, inside each payment's transaction as before. Test: `scheduledPaymentRecords.test.ts` (matches the full map, including a settled occurrence, and excludes another biller).

**Files:** `apps/app/local-db/repositories/scheduled-payments/scheduledPayments.ts:315–324`; `apps/app/local-db/repositories/scheduled-payments/scheduledPaymentRecords.ts:35–43`

For every eligible scheduled payment, catch-up calls `listPaidByOccurrence(userId, db)`. That query aggregates all non-deleted payment records for the user, then the caller keeps only one payment's map. With N eligible billers, the normal path performs one base read plus N whole-history aggregate reads, before occurrence-specific reads and writes. This is a proven local N+1 read pattern.

**Fix:** Read the aggregate map once for the catch-up pass and update it after committed writes, or query only the current payment's due-date range. Preserve the per-payment transactional rollback behavior.


### 16. Deferred reconciliation repeats a full ledger sum for every changed row — ✅ Resolved

**Severity:** WARNING — Performance

**Status:** Resolved 2026-11-03. Verified against the local stack: the migration is applied there and the extended `transaction_balance_reconciliation.sql` passes with the other 18 SQL tests (see the verification for 21 and 23–25). A clean replay of every migration on an empty database then succeeded. Migration `20261116000027` adds an immediate row trigger, `transactions_balance_account_tracking`, that records the affected account IDs in the transaction-local setting `odin.unreconciled_account_ids`. The first deferred event reconciles every recorded account in one locked statement and clears the set. The remaining events return without summing. A write after an early `SET CONSTRAINTS ... IMMEDIATE` records its accounts again. The tracking trigger's name sorts before the constraint trigger, so it fires first in the same event. The ledger-sum design and the debt-payment overwrite are unchanged. Tests added to `transaction_balance_reconciliation.sql`: six writes record the account once and reconcile to the final balance, and a write after an early firing is reconciled too.

**Files:** `supabase/migrations/20261114000000_reconcile_account_balances_from_ledger.sql:41–59,91–111`; `supabase/migrations/20261116000013_settle_scheduled_payment_occurrence.sql:188–222`

The deferred balance trigger is `FOR EACH ROW`. Every invocation calls reconciliation, locks affected accounts, and calculates their complete posted-ledger sums. A catch-up job inserting N transactions against one account queues N recalculations over essentially the same final history. Deferral fixes write ordering, but does not coalesce repeated events. This is a proven repeated aggregate path; material latency depends on history size and indexes and remains unmeasured.

**Fix:** Coalesce affected account IDs and reconcile once per account per batch/transaction, or apply validated old/new deltas with stable account locking. Keep concurrency and balance-convergence tests while optimizing.


### 17. Shared fetch deadlines stop at headers rather than the response body — ✅ Resolved

**Severity:** WARNING — Error Handling

**Status:** Resolved 2026-11-03. The app's SDK fetch, the app's sync `fetchWithTimeout` and the API's Supabase fetch read the whole body inside the deadline and return a buffered `Response` (`bufferedResponse`). The API version buffers an `arrayBuffer`. The app version buffers text, because React Native's fetch cannot reliably produce an ArrayBuffer and these helpers carry only JSON. The sync helper keeps a request tracked for lock cancellation until its body arrives. The API fetch now honours a caller's abort signal instead of replacing it. `apiFetch`, `authApi` and `sessionService` already read the body inside their deadline. Tests: `fetchWithTimeout.test.ts` (app and API) and `syncRequest.test.ts` (a body that stalls after the headers, caller abort, 204). Each fails against the old code.

**Files:** `apps/app/lib/helpers/fetchWithTimeout.ts:4–12`; `apps/api/src/lib/supabase.ts:7`; `apps/api/src/lib/http/withTimeout.ts:3–9`

The frontend helper clears its abort timer and removes the caller abort listener as soon as `fetch` resolves. Fetch resolves on response headers; SDK JSON/body consumption occurs afterwards. The API Supabase adapter similarly wraps only `fetch`, not body consumption. A peer that sends headers and then stalls can therefore outlive the declared deadline; frontend cancellation after headers is detached too. ML callers that put `response.json()` inside `withTimeout` already avoid this gap.

**Fix:** Keep the deadline signal active through body consumption, or have the timeout helper own fetching and parsing as a single operation. Preserve caller cancellation and test a response whose body stalls after headers.


### 18. Handled database and bootstrap failures lose their diagnostics — ✅ Resolved

**Severity:** WARNING — Error Handling

**Status:** Resolved 2026-11-03. Every route branch that answered 500 without logging now logs once, with the user and operation. The fix covers the listed files plus `onboarding.ts` and the remaining `auth.ts` branches (register, password reset, password update). `loggableError` keeps only name, code, status and message. PostgREST `details` is dropped because it echoes the failing row; the existing onboarding submit log no longer prints it either. Register and password-reset logs carry no email address. The classification service logs the stage that failed (`input`, `classify` with the ML reason, or `save`); the route's log, which carried only the user ID, was removed. Tests: `errorLog.test.ts`, `consents.test.ts`, `auth.session.test.ts`, `financialConditionAssessmentService.test.ts`.

**Files:** `apps/api/src/routes/auth.ts:147–153,342–348`; `apps/api/src/routes/consents.ts:55–61`; `apps/api/src/routes/me.ts:55–60,77–82`; `apps/api/src/routes/data-export-requests.ts:73–93`; `apps/api/src/services/classification/financialConditionAssessmentService.ts:55–66`

Several expected failure branches return generic responses but never log the underlying error. Bootstrap catches discard the exception entirely, and assessment failures collapse into null before the route emits only a user ID. The global middleware cannot recover errors already consumed by these branches. Operators cannot distinguish constraint failures, database outages, upstream failure, or auth problems from the response alone.

**Fix:** Preserve the original exception/result at the boundary and log it once with request, operation, and opaque user/record IDs. Continue returning fixed public messages and redact secrets and financial payloads.


### 19. Account selectors load the complete account collection — ✅ Resolved

**Severity:** WARNING — Performance

**Status:** Resolved 2026-11-03. The biller, biller-payment and income-source pickers use `listAccountOptions`. It returns active accounts only (filtered in SQL) with id, name, kind and balance, and skips the detail joins. The debt manager screen and overview call `listFinancialAccounts(userId, { kind: "credit_card", status: "active" })`. The transaction form keeps the full read, because it needs credit-card details and archived accounts for older edits. No row limit was added: silently truncating an account list is the problem finding 13 fixed. Test: `financialAccountQueries.test.ts`. Two more callers that load every account to find credit cards (`dashboardReminders.ts` `listUpcomingDebt` and `requiredDebtTotalQueries.ts`) are recorded in `audit-followups.md` (item 3).

**Files:** `apps/app/local-db/repositories/foundations/financialAccounts.ts:25–53`; `apps/app/features/billers/BillerFormScreen.tsx:57`; `apps/app/features/ledger/hooks/useTransactionData.ts:28`

`listFinancialAccounts` retrieves every non-deleted account with credit-card details, repayment preferences, and savings details, without a limit or active-status filter. It is reused by form selectors as well as overview screens. Growth in account history increases query, mapping, and rendering work even when a form needs only a small set of active accounts. This is an unbounded-read risk; performance on a large device database was not measured.

**Fix:** Keep full-history reads separate from a bounded, searchable selector query that filters acceptable account kinds/statuses in SQL and projects only the fields the form needs.


### 20. Frontend fixtures and migration assertions have drifted from production — ✅ Resolved

**Severity:** ERROR — Testing

**Status:** Resolved 2026-11-03. The savings account-link suite runs the full migration chain (`createSqliteHarness().migrateAll()`) instead of a handpicked subset. The HFCE descriptions test checks the rows the migration updates, and that a custom category is left alone, instead of matching SQL text. The pulled Financial Plan fixture now includes the nullable columns, because the server pulls with `select("*")` and always sends them. The app suite has no failures.

**Files:** `apps/app/local-db/repositories/savings/__tests__/savingsGoalAccountLink.test.ts:26–41`; `apps/app/local-db/migrations/__tests__/070_hfce_category_descriptions.test.ts:6–13`; `apps/app/local-db/repositories/financial-plans/__tests__/financialPlanDocuments.test.ts:56`

The frontend test run failed account-link tests with `table savings_goals has no column named is_emergency_fund`. The test applies a handpicked migration subset ending at 084, while production writes now use the later emergency-fund column. The HFCE descriptions test also still expects `slug = 'hfce_categories'`, a condition absent from the production migration. The pinned-runtime run also failed a Financial Plan pull fixture with an undefined SQLite binding; its remote row omits nullable server fields. These are verified testing failures, not evidence that a fully migrated application lacks the column or real Supabase rows omit nullable fields. Full-run results are recorded below.

**Fix:** Build SQLite fixtures from the actual supported migration chain or a maintained schema harness, and assert data behavior rather than stale SQL substrings. Retain meaningful migration-upgrade coverage and keep the pinned-runtime suite green.


### 21. Deployment restarts the API without a test gate — ✅ Resolved

**Severity:** WARNING — DevOps

**Status:** Resolved 2026-11-03. On its first GitHub run (Deploy API, `326410c`), the gate worked: the clean migration replay and all SQL tests passed, the unit job failed on the flaky first test in `FinancialPlanScreen.test.tsx`, and the deploy was skipped. Commit `8b9a3cd` raised the app tests' `waitFor` limit to 4 s (`apps/app/jest.setup.ts`), and CI then passed both jobs. New workflow `.github/workflows/ci.yml` runs on pull requests, on pushes to main, and when called. Job `unit` type-checks both apps, runs the API unit tests (integration excluded) and the app tests. Job `database` starts a disposable Supabase stack with CLI 2.105.0, which applies every migration to an empty database (the clean replay earlier verifications lacked), then runs each `supabase/tests/*.sql` with `ON_ERROR_STOP`. `deploy-api.yml` calls CI as job `checks`, and `deploy` needs it. Verified locally: the unit job's commands pass in a clean worktree with no `.env` files (API 71 suites / 814 tests; app 179 suites / 1,096 tests), and all 19 SQL tests pass against the local stack, which already had every migration applied. One existing API suite (`recommendationService.test.ts`) builds the Supabase client on import and needs `SUPABASE_URL`, so the unit job sets placeholder values. API pushes run CI twice (once on its own, once through Deploy API). Branch protection was not configured.

**Files:** `.github/workflows/deploy-api.yml:20–24,45–65`

The only tracked GitHub workflow pulls main, installs dependencies, runs TypeScript compilation, and restarts the production service. It has no test job or dependency on a successful behavioral test check. Changes to shared packages also trigger it. The current failing frontend tests illustrate that compilation alone cannot serve as a behavioral gate. Whether external branch protections supply additional checks was not inspected.

**Fix:** Add required CI jobs for API unit tests, shared-package consumers, frontend tests, and clean database migration/contract tests in disposable infrastructure. Gate deployment on successful applicable checks.


### 22. The default API test command opts into writes against environment-selected Supabase — ✅ Resolved

**Severity:** WARNING — Testing

**Status:** Resolved 2026-11-02. `pnpm --filter api test` is unit-only (`.integration.test.ts` excluded); `test:unit` remains as an alias. `test:integration` sets `RUN_INTEGRATION_TESTS`, and `jest.setup.cjs` refuses to run unless `SUPABASE_URL` points at 127.0.0.1 or localhost. README updated.

**Files:** `apps/api/package.json:14–15`; `apps/api/jest.setup.cjs:4–5`; `apps/api/src/__tests__/services/sync/creditCardAvailableCreditReconciliation.integration.test.ts:3–6,15–28,65–79`

`pnpm --filter api test` sets `RUN_INTEGRATION_TESTS=true`. Jest then loads `.env` and `.env.local`, and the integration test creates an auth user and financial data through the configured service-role client before deleting its fixture. There is no disposable/local-host guard. A developer invoking the root test command can likely write to a shared or production project when those environment files point there. The unit-only command's `/integration/` exclusion does not match a filename ending `.integration.test.ts`; its environment gate is what skips it in this audit.

**Fix:** Make the default test command unit-only and require a separate explicit integration command that validates a disposable local/test target. Use a dedicated test environment and guaranteed fixture cleanup. Never treat a filename convention as a target-safety check.


### 23. Credit-card cycle assembly performs per-card and per-missing-cycle reads — ✅ Resolved

**Severity:** WARNING — Performance

**Status:** Resolved 2026-11-03. `ensureCurrentCreditCardCycles` reads every card's open cycle in one query and, only when some card has none, every card's last closed cutoff in one grouped query. It works out the missing months in memory, inserts them oldest first, then reads the open cycles once more, all in one transaction. A list that is already current costs two reads in total. A plain `INSERT` replaces `INSERT OR IGNORE`, which could not skip anything (the key is a random UUID) but would have queued a sync operation for a row it skipped. Recurring-income catch-up checks all of a source's paydays (at most 12) in two `IN` queries instead of up to two per payday. Tests: `creditCardCycleGeneration.test.ts`, now on the real SQLite harness (a successor after an edited cycle, four missed months, current, behind and new cards together, a fixed read count for five current cards), and `recurringIncome.test.ts` (a re-run over 12 posted paydays makes two payday reads).

**Files:** `apps/app/local-db/repositories/credit-cards/creditCardCycles.ts:289`

After one card-defaults query, a nested loop reads the current cycle separately for every card, reads the previous cycle when missing, and repeats after insertion. Even an already current list uses 1 base query plus N lookups; a long absence adds multiple queries/writes per missing month. Related income catch-up also performs per-payday existence and validation reads (`foundations/recurringIncome.ts:43`). These are local SQLite crossings, not remote HTTP calls.

**Fix:** Prefetch current/latest cycles and existing payday identities in user-scoped batches, calculate missing periods in memory, then write within transactions. Keep recurrence ID convergence and cycle uniqueness checks intact.


### 24. UTC date defaults disagree with Manila financial days — ✅ Resolved

**Severity:** ERROR — Logic

**Status:** Resolved 2026-11-03. All five listed defaults now use `localToday()` (`features/billers/schedule.ts`), the Manila day the biller schedule and about ten repositories already use. Two more uses of the same pattern were fixed too: the open-cycle check in `updateCreditCardCycle` (`creditCardCycles.ts`) and the minimum contribution in `SavingsGoalDetail.tsx`. No `new Date().toISOString().slice(0, 10)` remains in the app. Device-day dates were left alone where they bound a date the user picks or labels the screen: the statement date's "no later than today" check (`deviceToday`) and the credit-card screen's `isoToday` (follow-up 4 in `audit-followups.md`). Tests at 16:30 UTC, when Manila is already on the next day: cycle defaults, a statement for a cycle that closed in Manila, and debt overdue status (`creditCardCycles.test.ts`, `creditCardStatements.test.ts`, `debtAccounts.test.ts`). Each fails against the old code.

**Files:** `apps/app/local-db/repositories/debts/debtAccounts.ts:87, apps/app/local-db/repositories/credit-cards/creditCardCycles.ts:84, apps/app/local-db/repositories/credit-cards/creditCardCycles.ts:290, apps/app/local-db/repositories/credit-cards/creditCardStatements.ts:116, apps/app/local-db/repositories/credit-cards/creditCardCycleDates.ts:56`

These paths derive today from `new Date().toISOString().slice(0, 10)`, while the biller schedule and API use Manila dates. Between midnight and 07:59 Manila, the UTC default is yesterday. On the first day after a cutoff, the statement guard still treats the previous cycle as open; debt overdue state and current-cycle selection also lag.

**Fix:** Reuse a common Manila-calendar helper or require an explicit financial date from callers. Sweep business-day defaults while retaining UTC for instants and calendar arithmetic. Add boundary tests around 16:00 UTC and month-end cutoffs.


### 25. Forecast date validation accepts impossible calendar dates — ✅ Resolved

**Severity:** ERROR — Data Integrity

**Status:** Resolved 2026-11-03. New `isCalendarDate` (`apps/api/src/lib/date/calendarDate.ts`) requires the YYYY-MM-DD shape and checks that the parsed day comes back unchanged. `parseAsOf` and `parseTransaction` use it, and so does the Financial Plan's `confirmedExpenses` due-date check (`explanationRequest.ts`), which had its own copy of the round trip. Tests: `calendarDate.test.ts`; `forecastService.test.ts` rejects 2026-02-29, 2026-02-30 and 2026-04-31 for both fields and accepts the leap day 2024-02-29.

**Files:** `apps/api/src/services/forecast/forecastService.ts:101`

Both `parseAsOf` and `parseTransaction` check a date-shaped regex and successful JavaScript parsing, without a calendar round trip. For example, `2026-02-30` parses to March 2 rather than NaN. An invalid source string is accepted and forwarded, while `forecastClock` normalizes it to a different date.

**Risk:** The accepted input and forecast reference day can disagree, or upstream processing can reject input that this boundary declared valid.

**Fix:** Use a shared strict calendar-date validator that compares the parsed ISO day with the input; apply it to both fields. The sync validator already contains a round-trip pattern. Test February overflow and invalid month lengths.


### 26. Sync responses forward database rejection text to clients — ✅ Resolved

**Severity:** WARNING — Error Handling

**Status:** Resolved 2026-11-02. Clients receive stable codes from `@odin/sync-config` (`version_conflict`, `record_deleted`, `record_not_found`, `reference_unavailable`, `sync_rejected`) via `publicSyncReason`; database wording stays in server logs. The app's debt-priority rebase matches the code instead of the old phrase. Builds already installed on devices that look for the old phrase skip that one automatic retry until they update.

**Files:** `apps/api/src/services/sync/syncService.ts:135`

Thrown transport failures receive a generic client message, but structured RPC rejections/conflicts forward `result.reason` verbatim. This exposes database-generated text and couples clients to internal messages. Several clients also branch on exact phrases, making the boundary fragile.

**Risk:** Probable schema/detail leakage if a database handler includes internal exception text; no cross-user sensitive value was demonstrated here.

**Fix:** Map known domain failures to stable public codes/messages, use a generic fallback, and keep full diagnostics server-side with operation and user IDs. Replace phrase matching with codes.


### 27. Web Supabase requests have no explicit timeout — ✅ Resolved

**Severity:** WARNING — Error Handling

**Status:** Resolved 2026-11-03. The web/default client in `apps/app/lib/supabase.ts` now passes `global: { fetch: fetchWithTimeout }`, the same cancellation-preserving transport and deadline as the native client; its auth options are unchanged. The foreground recurring-engine trigger (`apps/app/services/recurringEngine.ts`) used a raw `fetch` with no deadline; it now posts through `apiFetch`, so it gets the shared timeout and the single 401 refresh, and stays fire-and-forget with errors swallowed. Tests: `lib/__tests__/supabaseWeb.test.ts` (the web client is created with the timeout transport), `services/__tests__/recurringEngine.test.ts` (path and method, a failed request is swallowed, no request without a session). The unresponsive-transport case is already covered by `fetchWithTimeout.test.ts`.

**Files:** `apps/app/lib/supabase.ts:6, apps/app/lib/supabase.native.ts:8`

The native client installs the shared fetch timeout. The web/default client calls `createClient` without that transport, leaving auth and database requests without an application deadline. This makes behavior inconsistent across supported entry points and can leave a form pending for the browser/network timeout.

**Fix:** Install the existing cancellation-preserving timeout transport on the web client too. Keep any intentionally different deadline explicit and test an unresponsive transport.

## LOW — Contract and maintenance cleanup

### 28. Financial Plan screen still combines orchestration with presentation

**Severity:** WARNING — Code Quality

**Files:** `apps/app/features/financial-plan/FinancialPlanScreen.tsx:38–74,75–113,121–177`

The 536-line screen owns dozens of state values plus local database reads, synchronization, recommendation requests, cancellation, asynchronous explanation replacement, saved-plan fallback, commitment editing, and acceptance UI. Components and helpers already exist, but these distinct behavioral responsibilities remain coupled to the screen, making sync and cancellation edge cases harder to test independently.

**Fix:** Extract a feature-local plan-loading/controller hook and a separate commitment-draft hook. Keep persistence and network orchestration behind those interfaces while the screen composes presentational components.


### 29. Project guidance and QA setup reference obsolete application details — ✅ Resolved

**Severity:** WARNING — Code Quality

**Status:** Resolved 2026-11-03. Every file under `qa/` that named the app (`.maestro/config.yaml`, the 33 Maestro flows, `README.md`, `CHECKPOINT.md`, `TEST-CASES.md`; the 4 subflows name no app) now targets `com.odin.finances`; no `com.anonymous.odin` is left in the repository outside this report. `qa/README.md` describes itself as the `qa/` folder of the monorepo and points to `apps/app`. `AGENTS.md` names `expo-router/entry` and the routes under `apps/app/app/` (root layout `_layout.tsx`) as the boot path, and its baseline lists React Native `0.83.6`, Expo SDK `55.0.26` and Tailwind CSS `3.4.17`, the versions `apps/app/package.json` declares. The `README.md` tree drops `App.tsx` and lists `app/`. `docs/requirements-engineering/module-gap-report.md`, a September 2026 snapshot that still named several removed files, was deleted as outdated. No dependency was changed. Documentation only, so there are no tests.

**Files:** `AGENTS.md:305–312,601–602`; `apps/app/package.json:4–5,38,49`; `qa/README.md:5–8,47`; `README.md:459`

Agent guidance names `App.tsx` and `index.ts` as the active frontend boot path, but the package entry is `expo-router/entry`. Its dependency baseline also lists React Native 0.83.0 and Tailwind 4.2.4 while the app declares 0.83.6 and ^3.4.17. QA setup still calls this a separate source-free repository and uses `com.anonymous.odin`; the current app ID is `com.odin.finances`. Agents and testers following these instructions can inspect inactive entrypoints or target the wrong installed app.

**Fix:** Update the shared standards source and resync its runtime/entrypoint guidance; correct the QA location and package ID. Do not upgrade dependencies solely to make old documentation true.


### 30. Oversized JSON requests are misreported as server failures — ✅ Resolved

**Severity:** ERROR — API Design

**Status:** Resolved 2026-11-03. The final handler in `apps/api/src/app.ts` answers `entity.too.large` with 413 and a fixed message. Other client errors that body-parser marks `expose: true` (for example an unsupported charset, 415) keep their 4xx status with a fixed message and the standard status text, never the exception text. Malformed JSON is still 400, and everything else is still a logged 500. The app's sync push (`runSync.ts`) treated a 413 like any rejected request, so a batch over the limit would have been selected again every sync. It now resends that batch in halves within the same run, down to one operation. An operation that is too large on its own is marked `invalid_operation`, which exhausts it at once so it waits in the Sync Issues sheet, and later operations are still pushed. Tests: `apps/api/src/__tests__/app.test.ts` (over 1 MB → 413, malformed JSON → 400, unsupported charset → 415 without its text, a thrown error → 500), `runSyncPushDrain.test.ts` (a 50-operation batch → 413, then two batches of 25 in the same run; a single oversized operation exhausted while the two after it sync).

**Files:** `apps/api/src/app.ts:21,60–81`

The JSON parser deliberately limits bodies to 1 MB. Its oversized-body error carries a client-error status, but the final handler only recognizes malformed JSON and otherwise emits HTTP 500. A request exceeding the documented parser limit therefore becomes an internal-server failure, confusing clients and operational error rates.

**Fix:** Explicitly map the parser's oversized-body condition to 413 with a fixed public message. Preserve safe parser status codes without echoing raw exception text, and add an oversized-body request test.

## Files With Zero Violations

No standalone finding was established in these specifically inspected files within this review's limits; this is not a certification of all call sites:

- `apps/api/src/services/sync/syncOwnership.ts` — ownership lookups explicitly accept user context and scope queries.
- `apps/api/src/lib/http/withTimeout.ts` — the callback-scoped timer itself cleans up in a finally block; callers must include body reads as noted in finding 17.
- `apps/app/local-db/databaseAccess.ts` — protected access rejects missing credentials and validates credential formats.
- `apps/app/features/auth/components/AccessProvider.tsx` — consumers require an installed provider and an unlocked session.
- `apps/app/modules/odin-pin-crypto/android/src/main/java/expo/modules/odinpincrypto/PinKeyDerivation.kt` — derivation validates fixed inputs/work factor and clears mutable temporary buffers.

## Things that we're done correctly

- `apps/api/src/middleware/auth.ts:47–69` verifies the JWT through Supabase before passing authenticated user context to handlers; sync ownership helpers also scope related-record reads by user.
- `apps/app/local-db/repositories/ledger/transactionQueries.ts:124–151` whitelists sort columns/directions, binds filters, and supports bounded keyset pagination instead of loading the transaction history into a form.
- `apps/api/src/services/sync/syncService.ts:211–219` fetches independent pull tables concurrently and bounds each page; sequential dependency-sensitive writes were distinguished from this appropriate concurrency.
- `apps/app/local-db/encryptedDatabase.ts:104–142` exports to staging, compares table row counts, verifies the encrypted database, and keeps an encrypted legacy archive before removing plaintext legacy files.
- `apps/app/local-db/repositories/ledger/transactionDeletes.ts:133–148` keeps local deletion and sync enqueueing inside a transaction; edits explicitly guard linked debt, statement, and biller payments.
- `supabase/migrations/20261114000000_reconcile_account_balances_from_ledger.sql:102–111` moves reconciliation to transaction triggers so create/edit/delete paths all participate. Finding 16 concerns the repeated work, not the existence of reconciliation.
- `supabase/migrations/20261002000007_move_sync_implementations_to_private_schema.sql` and later wrapper revocations address the older report's exposed-core problem. Newer code was inspected before deciding whether old findings still apply.

## Priority Fix Roadmap

| Priority | Work | Required result |
|---|---|---|
| P0 | Logout, consent, deletion cancellation, base RPC | Explicit server revocation; latest valid consent; request-authenticated cancellation; only supported public mutation entrypoints. |
| P1 | Sync completion/fairness and financial inputs | Complete required pushes without starvation; no silent commitment/history truncation. |
| P1 | Governance and registration writes | Atomic export replacement, one active deletion request, and checked device writes. |
| P1 | Tests and deployment | Repair SQLite fixtures, enforce disposable integration targets, and require behavioral checks before release. |
| P2 | Repeated reads and aggregates | Batch ownership/cycle reads, reuse paid-occurrence maps, and coalesce account reconciliation. |
| P2 | Dates, deadlines, diagnostics | Manila business dates, strict calendar validation, body-inclusive timeouts, stable public errors, and safe complete server logs. |
| P3 | Screen composition and guidance | Extract feature orchestration; align runtime, entrypoint, QA, and parser contracts. |

## Verification

- API unit verification under the pinned runtime: `pnpm --filter api exec jest --silent --runInBand --testPathIgnorePatterns='\.integration\.test\.ts$'` — **63 suites and 766 tests passed**. Database integration was explicitly excluded. An earlier `test:unit` run also passed with the integration test skipped.
- `pnpm --filter api exec tsc -p tsconfig.json --noEmit` and `pnpm --filter app exec tsc --noEmit` — both passed.
- Frontend command under the pinned runtime: `pnpm --filter app test --runInBand --silent` — **172 suites passed, 3 failed; 1,061 tests passed, 5 failed**. Failures: three savings account-link cases, one HFCE migration assertion, and one Financial Plan pull fixture. See finding 20.
- SDK logout reproduction: a client configured like the request factory returned `{error:null}` and made zero network calls. It used dummy values and a fetch stub; no real session was revoked.
- Final verification explicitly selected repository-pinned Node **24.22.1** and pnpm **10.26.1**. Both TypeScript checks were repeated successfully under that runtime. Initial exploratory tests used shell-default Node 26.10.0; the final counts above come from the pinned-runtime runs.
- No on-device testing, external ML calls, production mutations, database reset, or clean migration replay was performed. Automatic approval review rejected `pnpm exec supabase db push --local --dry-run`, stating that Supabase database pushes must be run manually by the user. Database findings reflect migration source, not verified deployed state.
- The requested `/home/charles/.claude/home-files/experiences.md` path was absent. Its available counterpart at `/home/charles/.codex/claude-equivalents/home-files/experiences.md` was located and consulted. The intake script failed on local awk syntax; inventory was rebuilt directly from Git's non-ignored candidate list.

## Repo Knowledge

Odin is a single-user-account finance application. The frontend boots through Expo Router and native auth/PIN access guards, stores protected account data in local SQLCipher SQLite, and queues changes for the API. Express authenticates requests and uses user-scoped Supabase clients; ordered sync operations route through entity validators into database RPCs, while cursor-based pulls converge server changes back into SQLite. Financial Plan, forecast, and classification services depend on persisted server inputs and external model adapters. Shared packages contain interest and spending rules and sync constants. Supabase migration files and SQL contract tests carry the persistence rules; Jest covers API and frontend behavior, with 37 tracked Maestro flow files (33 flows and 4 subflows, plus `config.yaml`) for device verification. The inventory included 167 API, 763 app, 17 shared-package, and 249 Supabase candidate files, plus project documentation, scripts, designs, and QA artifacts. Review depth was bounded as described above.

---

*Generated on 2026-11-02. Heuristic N+1 and repeated-round-trip analysis was included for remote ownership checks, local SQLite loops, serializers/helpers, sync paging, and database trigger paths. Probable impact is labeled where runtime measurement or database execution was unavailable.*
