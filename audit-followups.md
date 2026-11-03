# Audit Follow-ups

Issues found in self-reviews of `audit.md` fixes. None is a regression; each is left for a later change.

| # | Found while fixing | Date | Area |
|---|---|---|---|
| 1, 2 | Findings 2 and 5 | 2026-11-02 | Sync |
| 3 | Findings 16–20 | 2026-11-03 | Account reads |
| 4 | Finding 24 | 2026-11-03 | Dates |
| 5 | Finding 28 | 2026-11-03 | Screen composition |

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

## 3. Debt reminders and the required-debt total load every account to find credit cards

**Severity:** WARNING — Performance

**Files:** `apps/app/local-db/repositories/dashboard/dashboardReminders.ts` (`listUpcomingDebt`); `apps/app/features/debt-manager/queries/requiredDebtTotalQueries.ts` (`getRequiredDebtTotalForPeriod`)

Both call `listFinancialAccounts(userId)` with no filter. That reads every account, archived ones included, with all three detail joins, and passes the result on as `creditCards`. This is the unbounded read from finding 19, left in place during that fix because these callers might depend on archived cards.

Tracing shows they do not. `getRequiredDebtTotal` (`features/debt-manager/helpers/requiredDebtTotal.ts`) keeps only `kind === "credit_card" && status === "active"` in both of its card paths (`getCreditCardObligations` and `getEstimatedCreditCardObligations`). Cycles and statements of other accounts are dropped. Both callers use their own account list only to look up names for the obligations that come back, which belong to active cards.

**Fix:** Pass `{ kind: "credit_card", status: "active" }` to `listFinancialAccounts` in both callers. Check that the dashboard's upcoming-debt section and the Debt Manager's required total stay the same for a user with one active and one archived card, where the archived card still has an unpaid statement.

## 4. The credit-card screen and statement date still use the device's day

**Severity:** WARNING — Logic

**Files:** `apps/app/features/debt-manager/credit-cards/components/CreditCardCollections.tsx` (`isoToday`); `apps/app/features/debt-manager/credit-cards/components/CreditCardStatementForm.tsx`; `apps/app/local-db/repositories/credit-cards/creditCardStatements.ts` (`createCreditCardStatement`, `deviceToday`)

Finding 24 moved the business rules to the Manila day: which cycle is open, when a statement may be recorded, and when a debt is behind. The credit-card screen still marks a cycle as waiting for its statement with the device's day, and the statement form and its "no later than today" check limit the statement date to the device's day. On a device in Manila the two days are the same. On a device set to a zone west of Manila (for example a user abroad), they can differ for part of each day. The screen then offers "Add statement" for a cycle the repository still treats as open, and saving fails with "Statements can only be recorded after the billing cycle has closed."

**Fix:** Decide whether the statement date is the user's own calendar day or the Manila day. If it is the Manila day, pass `localToday()` to `CreditCardCollections` and the statement form, and use it for the statement-date bound. Either way, the "pending statement" badge should use the same day as the closed-cycle check. Test a device zone of UTC−5 at 20:00 local on a cutoff day.

## 5. The Debt Manager screen combines data loading and cycle editing with presentation

**Severity:** WARNING — Code Quality

**Files:** `apps/app/features/debt-manager/DebtManagerScreen.tsx` (`load`, `openCycleEditor`, `saveCycle`)

This is the same coupling as finding 28's `FinancialPlanScreen`. The 222-line screen holds 21 `useState` values and imports eight local-database repository modules. Its `load()` runs nine awaits one after another: the active credit-card accounts, `ensureCurrentCreditCardCycles`, then seven list reads (cycles, cycle transactions, statements, installments, payments, strategies, settlements). It also owns the error and stale-data handling for those reads and the inline billing-cycle editor (`editingCycle`, `cycleStart`, `cycleCutoff`, `cycleError`, `cycleSaving`, `cycleNotice`, `cyclePicker`), so loading and editing edge cases can only be tested through the whole screen.

The seven list reads take only `userId`, so they load every credit card's data even when the screen shows a single `accountId`, and the screen filters most of it afterwards. The cost of this has not been measured.

**Fix:** Extract a feature-local data-loading hook (for example `useDebtManagerData`) that owns the reads, error and stale state, and a separate cycle-editor hook for the billing-cycle draft, validation and save. The screen then composes the existing components. When `accountId` is given, consider scoping the reads to that account.
