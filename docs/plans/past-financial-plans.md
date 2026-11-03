# Past Financial Plans Execution Plan

## Goal

Implement section 18.8 of `docs/requirements-engineering/features/12-intelligent-financial-planning.md`: let users browse accepted Financial Plans from completed plan periods and review each one against what actually happened (planned vs actual vs variance for spending, savings contributions and debt payments). The feature is local-first and works offline, reading only data already synced to the device.

## Source Of Truth

- Spec: `12-intelligent-financial-planning.md` §18.1 (accepted plans persist an immutable snapshot and stay viewable offline) and §18.8 (past plans).
- Local schema: `apps/app/local-db/migrations/066_financial_plans.ts`, `068_financial_plan_surplus.ts`.
- Remote schema: `supabase/migrations/20261023000000_add_financial_plan_sync.sql`. Plans are create-only server-side, so the allocations and reservations tables already work as the immutable historical baseline.
- Actuals sources:
  - `transactions` (posted expenses)
  - `savings_goal_activities` (`053_savings_goal_model.ts`)
  - `debt_payments` (`019_debt_management.ts`)
  - `credit_card_payments` (`024_credit_cards.ts`, `043_credit_card_statement_payments.ts`)
- Existing reader: `apps/app/local-db/repositories/financialPlans.ts` (`mapPlan`, `getFinancialPlanAllocationSpending`, `getFinancialPlanSpentAmount`, `getFinancialPlanLabels`).
- UI: `apps/app/features/financial-plan/FinancialPlanScreen.tsx`, with routing in `apps/app/components/MobileShell.tsx:170,853`.

## Current State (findings)

1. **No history access.** `getLatestFinancialPlan` returns only the newest accepted plan. No repository function lists plans, and the UI has no history entry point.
2. **The latest plan never expires.** `FinancialPlanScreen` shows the latest plan as `saved` even after its period has ended. A completed plan therefore blocks planning for the new period until the user resets it. Past plans need a separate home, and the main screen should treat a completed plan as history rather than the current plan.
3. **Spending double counting.** `getFinancialPlanSpentAmount` sums every posted `expense` transaction in the period. Debt payments are also `expense` transactions (see the trigger in `045_allow_authoritative_payment_pull.ts`), so in a past-plan review the "actual spending" total would also count debt payments that are reported separately as debt actuals.
4. **Allocation matching gap.** A category-level allocation only matches transactions where `t.category_id = a.category_id`. If transactions carry only a `subcategory_id`, spending under a broad category may be missed. This needs to be checked against how `transactions.category_id` is populated.
5. **Labels are not historical.** `getFinancialPlanLabels` filters `deleted = 0`. If a category, goal or debt is later deleted, the past plan loses its label. §18.8 says later changes must not alter a past plan.
6. **Local snapshot is partial.** `mapPlan` rebuilds `inputSnapshot` from normalized columns and returns `obligations.reservations: []`. The normalized data (allocations, reservations, forecast points, classification metadata, funds and shortfall) covers everything §18.8 needs to display. No change is required for this feature, but it is noted here.
7. **Spec/code drift (fixed first, in PR 0).** §18.1 says plans cover the *current* month, but every layer enforces the *next* calendar month:
   - app: `validate()` and `nextCalendarMonth()` in `local-db/repositories/financialPlans.ts:101-118`; `getNextFinancialPlanPeriod` callers in `savingsEnvelopeAllocationQueries.ts:8` and `DebtManagerOverview.tsx:77`
   - API: `nextCalendarMonth()` in `services/financialPlan/recommendationService.ts:83,226`; `nextFinancialPlanPeriod()` check in `services/syncApplyOperation.ts:1623-1624`
   - DB: `v_next_month` check in `apply_financial_plan_sync_operation_base` (last redefined in `20261027000004_recreate_financial_plan_sync_rpc.sql:11,22`)

## Decisions

- **D0. Plan period = current calendar month (decided).** A plan always covers the first through the last day of the month containing "today" in Asia/Manila time, including when it is created mid-month (§18.1). The server already uses Manila time, and the app should use `manilaToday()`, so the device and server always agree on which month is current.
- **D1. Completed period:** `period_end < manilaToday()`. The current-month plan is never listed as "past".
- **D2. Actual spending:** (bill payments, i.e. transactions from an obligation's recurring template, are also excluded because bills are reserved separately from category allocations) posted, non-deleted `expense` transactions in `[period_start, period_end]` for the user. Exclude transactions linked to a live `debt_payments.transaction_id` or `credit_card_payments.transaction_id`, and exclude savings-goal transfers. Debt and savings actuals are reported in their own sections.
- **D3. Category matching:** a category allocation matches transactions whose category, or the parent of their subcategory, equals the allocation's category. A subcategory allocation matches only that subcategory. Because a plan selects either a broad category or its subcategories, never both, nothing is double counted.
- **D4. Unplanned spending (decided):** spending in categories with no allocation is shown as a separate "Unplanned" line. It counts toward total actual spending, and therefore toward "actual spending exceeded the plan", but not toward any per-allocation variance.
- **D5. Savings actuals (decided):** only live `savings_goal_activities` with `activity_kind = 'contribution'` in the period count, grouped by goal. Withdrawals are ignored entirely: they are not netted and not displayed. Per goal: `actual − reserved > 0` is an **additional contribution**. A goal with contributions but no reservation is also additional.
- **D6. Debt actuals:** live `debt_payments` grouped by `debt_account_id`, plus `credit_card_payments` grouped by `statement_id` for statement reservations, both within the period. Payments beyond a reservation, or to a debt without one, are **additional payments**.
- **D7. Missing commitment vs not recorded:** each reservation gets one status:
  - `met`: actual ≥ reserved
  - `partial`: 0 < actual < reserved
  - `not_recorded`: actual = 0. The UI says "No payment/contribution recorded", never "missed", because the app cannot tell a missed payment from an unrecorded one.
  - `unplanned`: actual activity with no matching reservation (D5/D6)
- **D8. Historical labels:** label lookups for past plans include soft-deleted rows. Deleted entities are shown with a "(removed)" suffix. No snapshot columns are added.
- **D9. No server changes.** Plans and actuals already sync down (`pullConvergence.ts` handles `financial_plans`). All analysis runs locally, scoped by `user_id` in every query.

## Execution: stacked PRs (each under 200 lines)

```
main → fp-period/current-month → fp-history/repo-list → fp-history/actuals-spending → fp-history/actuals-commitments → fp-history/list-ui → fp-history/detail-ui → fp-history/current-period-fix
```

### PR 0: `fp-period/current-month`: plans cover the current month (~150 lines)
- **App:**
  - Replace `nextCalendarMonth()` with `currentCalendarMonth()` in `financialPlans.ts`, computed from `manilaToday()`.
  - Rename `getNextFinancialPlanPeriod` to `getCurrentFinancialPlanPeriod`, and update its callers in `savingsEnvelopeAllocationQueries.ts` and `DebtManagerOverview.tsx`.
  - Change the `validate()` error message to "Financial Plans can only cover the current calendar month".
  - Update the screen subtitle in `MobileShell.tsx:199` ("Plan next month's money").
- **API:**
  - Switch `recommendationService.ts` (`nextCalendarMonth` → `currentCalendarMonth`, used for `period` and the forecast month) and the `syncApplyOperation.ts` period check to the current month.
  - Confirm the ML forecast request targets the plan period month.
- **DB:**
  - Add a new migration that redefines `apply_financial_plan_sync_operation_base` with `v_current_month := date_trunc('month', now() AT TIME ZONE 'Asia/Manila')::date`.
  - Copy the body from the latest definition, and check `20261029*` for later redefinitions first.
  - Update `supabase/public-schema.sql` and `supabase/tests/sync_rpc_contract.sql`.
- **Tests:**
  - Update `syncApplyOperation.financialPlans.test.ts`, `recommendationService.test.ts`, `financialPlans.test.ts`, `DebtManagerOverview.test.tsx` and `savingsEnvelopeAllocationQueries.test.ts`.
  - Add a mid-month case, e.g. creating a plan on 2026-10-15 covers 2026-10-01 to 2026-10-31.
- **Transition:** a plan accepted before this change for next month (e.g. Nov 2026, accepted in October) stays valid. It becomes the current plan when November starts. Until then, the user can create the October plan.
- **Mid-month check:** reservations for debts and goals due earlier in the month may already be paid when the plan is created. Confirm the recommendation still follows the spec's whole-month rule. Flag any double-reservation as a follow-up rather than changing it here.

### PR 1: `fp-history/repo-list`: list completed plans (~80 lines)
- `financialPlans.ts`: add `listCompletedFinancialPlans(userId, today)`, which returns a summary for each accepted, non-deleted plan with `period_end < today`, sorted by `period_start DESC`. Each summary has `id`, `periodStart`, `periodEnd`, `availableFundsCentavos`, `shortfallCentavos` and the total allocated amount, computed with one aggregate query (no N+1).
- Make `getFinancialPlanLabels` take `{ includeDeleted }` (D8) and return `removedIds`, the ids of soft-deleted entities, so the UI can mark them as removed.
- Tests in `local-db/repositories/__tests__/financialPlans.test.ts`:
  - only completed periods are listed
  - order is correct
  - another user's plans are excluded
  - deleted plans are excluded
  - labels resolve for soft-deleted categories

### PR 2: `fp-history/actuals-spending`: spending comparison (~150 lines)
- New `local-db/repositories/financialPlanSpendingReview.ts` with `getPlanSpendingReview(userId, planId)`. It returns a row for each allocation (`planned`, `actual`, `variance = planned − actual`, `exceeded`), an `unplanned` row, and totals (`plannedTotal`, `actualTotal`, `exceeded`).
- Implement D2 (exclusions), D3 (category and subcategory parent matching) and D4.
- Before writing the query, check how `transactions.category_id` and `subcategory_id` are populated (finding 4).
- Tests:
  - debt-payment expense excluded
  - savings transfer excluded
  - out-of-period transactions excluded
  - pending and deleted transactions excluded
  - subcategory rolls up to a broad category
  - unplanned bucket
  - exceeded flags
  - user scoping

### PR 3: `fp-history/actuals-commitments`: savings and debt comparison (~170 lines)
- New `local-db/repositories/financialPlanCommitmentReview.ts` with `getPlanCommitmentReview(userId, planId)`. It returns savings and debt rows with `reserved`, `actual`, `additional` and `status` (D5–D7), including `unplanned` rows for unreserved activity.
- Tests:
  - met, partial and not_recorded statuses
  - additional contribution and additional payment
  - unreserved goal or debt with activity
  - credit-card statement reservation matched through `credit_card_payments.statement_id`
  - withdrawals ignored (not netted, not returned)
  - period bounds
  - user scoping

### PR 4: `fp-history/list-ui`: past plans list (~150 lines)
- New `features/financial-plan/PastFinancialPlansScreen.tsx`, a list of completed plans (month label, planned total), with an empty state ("No completed plans yet").
- Entry point: a "Past plans" action on `FinancialPlanScreen`, plus a `financial-plan-history` page in `MobileShell` (page union, title map and render switch).
- Tests: list renders summaries, empty state, navigation callback.

### PR 5: `fp-history/detail-ui`: past plan review (~190 lines; split spending and commitments into two PRs if it grows past that)
- New `PastFinancialPlanDetailScreen.tsx` with these sections:
  - **Spending:** one row per allocation with rule, planned, actual, variance and an over-allocation badge; an Unplanned row; and a totals card with an "Over plan" or "Within plan" verdict.
  - **Savings:** reserved vs actual per goal, status chip, additional amount.
  - **Debt:** reserved vs actual per debt or statement, status chip, additional amount.
  - **Snapshot footer:** available funds, shortfall, forecast model and quality, classification status and assessed-at date. This content is read-only and has no edit or reset actions.
- Reuse the presentation helpers in `financialPlanPresentation.ts` (add pure formatters there and test them in `financialPlanPresentation.test.ts`).
- Tests: renders all sections, "not recorded" copy (never "missed"), removed-label suffix, offline render from local data only.

### PR 6: `fp-history/current-period-fix`: stop completed plans blocking the main screen (~60 lines)
- `FinancialPlanScreen` loads the accepted plan for `getCurrentFinancialPlanPeriod(manilaToday())` with `getAcceptedFinancialPlanForPeriod`, instead of `getLatestFinancialPlan`. When no plan exists for the current month, it shows the selection flow, with a link to past plans if any exist.
- Tests: a completed previous-month plan no longer appears as `saved`, the new period can be planned, and the current-period plan still loads.
- Kept last so that history is reachable before the main screen stops showing old plans.

## Verification

- Per PR: `pnpm` test suite for `apps/app` (repository and component tests), plus typecheck.
- Manual smoke test on the stack tip:
  1. Seed a plan for a prior month with expenses (including one unplanned category), a debt payment, a credit-card statement payment and a savings contribution.
  2. Open Past plans, then the plan detail.
  3. Check totals, variances, statuses and additional amounts by hand.
  4. Toggle airplane mode and confirm the view still renders.
- Integration of the parent branch: CI and smoke checks only, as each sub-PR is reviewed separately.

## Non-Goals

- Editing, re-accepting or deleting past plans.
- Server-side or API endpoints for plan history.
- Restoring the full JSON `input_snapshot` locally (finding 6).
- Charts or trends across multiple past plans.

## Resolved Questions (2026-10-15)

1. Savings withdrawals: only contributions count; withdrawals are ignored (D5).
2. Unplanned spending counts toward "actual spending exceeded the plan" (D4).
3. Plans cover the current month instead of next month; this is fixed first in PR 0 (D0).

## Follow-up Changes (2026-10-15)

- **Mid-month deductions.** The recommendation deducts commitments already paid this month: credit-card statement minimums (by `credit_card_payments.statement_id`) and bills linked to a recurring transaction. The optimizer funds only what remains of each category after month-to-date spending. Stored allocations and available funds add that spending back, so they still cover the whole month. Bills without a recurring link stay fully reserved. Deleted bills are no longer reserved.
- **One spending rule.** Current-plan progress (`getFinancialPlanAllocationSpending`, `getFinancialPlanSpentAmount`) delegates to `getPlanSpendingReview`, so the main screen and the past-plan review count spending the same way. This also fixes broad-category progress, which matched the never-populated `transactions.category_id`.
- **Sync grace month.** The server also accepts a plan for the month that just ended (`20261106000000_financial_plan_sync_grace_month.sql` and `syncApplyOperation.ts`), so a plan accepted offline near month end still syncs. The device still creates plans only for the current month.
- **Forecasts.** odin-ml forecasts next month only, so current-month plans use the fallback forecast until odin-ml can forecast the current month.
