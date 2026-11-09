# Guided Onboarding Tour Implementation Plan

**Goal:** An interactive tour (spec 04) that walks the user through the real screens filled with seeded practice data, including creating and accepting a scripted Financial Plan, without touching the user's records.

**Architecture:** Practice Mode swaps the data under the real screens instead of copying them. One global zustand store (`services/practiceMode.ts`, `usePracticeModeStore`) holds the swap state; React reads it with the hook, and three one-line checks read it with `getState()`:

- `local-db/client.ts` `getDatabase()` returns the practice database (in-memory, same migrations, seeded) while practice is on.
- `lib/localAccess.ts` `authorizedFetch()` answers from practice fixtures and never reaches the network.
- `local-db/sync/runSync.ts` `runSync()` is a no-op, so practice rows never sync.

Every repository goes through `getDb()` → `initDatabase()` → `getDatabase()`, and every API call (plans, forecast, classification, governance, onboarding, recurring, sync) goes through `authorizedFetch()`, so these hooks cover all reads, writes, and requests. Auth calls (`authApi`, `sessionService`) and the health check stay real.

**Tour library:** `react-native-spotlight-tour` (SVG mask; per-step `before()` promise for cross-screen navigation). Its only peer, `react-native-svg`, is already installed.

**Tech stack:** TypeScript, expo-sqlite, expo-router, zustand, Jest + React Native Testing Library, pnpm.

## Constraints

- Real screens only; no `./Practice` copies.
- Practice data is hardcoded seed data, typed against repository row types, written only to the practice database.
- Transactions: highlight only (no practice add/edit/delete).
- The Financial Plan can be created with scripted picks and accepted; the accepted plan lives only in the practice database.
- Blocked in practice: logout, account deletion, data export, consent changes (fixture responder refuses them).
- Leave the user's uncommitted debt-manager and savings changes untouched.
- Small files: one responsibility each; seed data split per domain.

## Tour order

1. Dashboard
2. Money · Accounts
3. Money · Income (list → detail)
4. Money · Billers & Remittances (list → detail → record payment, highlight only)
5. Activity (list, filters)
6. Add Transaction: type, category, account; **This is a savings contribution**; debt payment card (explained, not toggled)
7. Edit Transaction (highlight only)
8. Delete Transaction (highlight only, confirmation explained)
9. Plan · Savings (in depth): goals list, Emergency Fund, goal detail, contributions, progress and projection, allocation review, link back to Add Transaction
10. Plan · Debts (in depth): overview, credit cards list → card detail (statements, installments, repayment strategy), other debts list → debt detail (payments, payoff projection), link back to Add Transaction
11. Plan · Budget: Create Financial Plan with scripted picks ("Select Food and Groceries", "Select Transportation", …) → review → **Accept** → plan health; history
12. Financial Reports: periods, budget vs actual, forecast, unusual spending
13. Settings (in depth): profile, preferences, categories (taxonomy), Definition of Terms, Terms & Conditions, export (highlight only)
14. Offline & Sync: statuses, pending changes, retry
15. Help and About → Replay tutorial → Finish → Dashboard

## Layers and tasks

### Layer 1 — Swap (infrastructure)
- [x] `services/practiceMode.ts`: zustand store (`active`, practice database, fixture responder) with start/stop and `practiceFetch`.
- [x] `local-db/client.ts`: `openMigratedDatabase(name, migrations)` export; `getDatabase()` returns the practice handle after the unlock check.
- [x] `lib/localAccess.ts`: `authorizedFetch()` answers from the responder while practice is on.
- [x] `local-db/sync/runSync.ts`: no-op result while practice is on; `waitForSyncIdle()` so Layer 3 never swaps under a running sync.
- [x] Tests for the helper and each hook.

### Layer 2 — Practice data
Persona: Andrea Cruz ("healthy-worker", `apps/api/scripts/seed/personas.ts`): PHP 75,000 salary, condo rent, fully funded emergency fund, house deposit. Additions so every tour screen has content: PHP 60,000 opening payroll cash, a GCash wallet with freelance income, a parents' remittance biller, a Japan trip goal, two loans (motorcycle auto loan, SSS salary loan), and a Rewards Visa paid in full.

- [x] `features/onboarding-tour/practice/seed/` one file per domain (accounts, income, billers, spending, savings, debts, creditCard) plus `context.ts` (stable uuidV5 ids, dates, row helpers), `balances.ts` (ledger replay, no overdraft), `index.ts` (`buildPracticeSeed`, write order).
- [x] `practice/taxonomy.ts`: copy the user's own categories; look up subcategories by system slug.
- [x] `practice/applyPracticeSeed.ts`: write through `normalizePullRow` + `applyPullRow` (the sync pull path), in one transaction, nothing queued to sync.
- [x] Test on a real migrated SQLite (four dates incl. month/year edges): every row lands, no FK breaks, empty sync queue, repositories read it back, balances never negative, deterministic.
- [x] `practice/fixtures/`: commitments, plan forecast, recommendation (reserves commitments, allocates picked categories at usual spending, scales to fit, INFEASIBLE when short, surplus advice to the motorcycle loan), explanations, monthly and quarterly forecast, Savings & Debt Profile. All computed from the seed, never hardcoded amounts.
- [x] `practice/respond.ts`: routes each request to its fixture; passes the user's own settings reads (`/me`, seasonal preferences, deletion status) to the server via `authorizedServerFetch`; refuses everything else (logout, consent, export, deletion, preference changes, sync) with 403.
- [x] Tests: every `/odin/api` path in the app source is answered or refused on purpose; plan scenarios (fits, scaled, infeasible, manual, skipped); refusals never reach the server.
- [ ] Follow-ups: a credit-card installment purchase; past accepted plans for plan history.

### Layer 3 — Practice lifecycle
- [x] `features/onboarding-tour/services/practiceSession.ts`: `enterPracticeMode(userId)` copies the user's categories → builds the seed → opens and seeds an in-memory database → waits for sync to go idle → turns Practice Mode on → clears shell state. `exitPracticeMode()` waits for a start in progress, closes the practice database, clears shell state. Concurrent starts share one database; a failed start closes it and stays on the user's data.
- [x] `features/shell/helpers/resetShellState.ts`: one reset for unusual-spending prompt, activity editing, and the transaction list cache (used on lock/logout and on tour switches).
- [x] Shell layout: the screen stack is keyed on Practice Mode, so every screen remounts onto practice data and back; unmount (lock, logout) ends the tour.
- [x] `lockVault()` ends Practice Mode and closes its database before closing the user's.
- [x] `PracticeBanner`: "Tutorial data — your records are not changed", floating above the tab bar, never blocks taps.
- [ ] Verify on device: the keyed stack returns to the Dashboard on enter/exit; the sync indicator refreshes after the tour ends.
- [ ] Layer 4: hide or disable Log out while the tour runs (the server call is already refused).

### Layer 4 — Tour engine
- [x] `react-native-spotlight-tour@4.0.0` (pure JS; peers react-native-svg and react-dom already installed; ES module, so Jest maps it to `test-mocks/react-native-spotlight-tour.tsx`). v4 takes `placement`/`offset`/`shift`/`flip` as props (the README still shows v3's `floatingProps`).
- [x] `types.ts` (10 stages, step and progress types), `messages.ts` (spec §4.8 wording), `steps/` (one file per stage; `welcome` and `finish` so far).
- [x] `TourTarget id="…"`: wraps `AttachStep`, maps step ids to indexes, registers mounts. Steps without a target, and unavailable steps, attach to a centre anchor (the library does not export `changeSpot`).
- [x] `services/tourRunner.ts`: `prepareStep` navigates and waits up to 4 s for the target, never rejects (the library does not catch `before`); start / resume / replay enter Practice Mode then `goTo`; continue later, finish, skip tour, retry, skip step.
- [x] Progress per user in secure storage (`tour-progress`); a run interrupted by a lock or a closed app reads back as paused; save failures show §4.8's message.
- [x] `TourHost` in the shell layout, outside the keyed stack; `TourOffer` (Start tour / Skip for now) on the first shell visit after the questionnaire for users who have not answered it.
- [x] Settings → Help and About: Resume tutorial (paused progress only) and Replay tutorial. Log out is disabled while practice data is on screen.
- [ ] On device: overlay and tooltip placement, the centre anchor, navigation in `before`.
- [ ] Layer 5: steps that wait for the user's own tap (tab presses) instead of Next; scroll targets into view.

### Layer 5 — Stages
Engine additions:
- [x] Tap steps (`action: "tap"`): the spotlight is a full-screen `Modal`, so it cannot let a tap reach the app. A tap step closes it and `TapHint` dims the screen around a live hole over the control; `TourTarget` reports the real press (through `useTourTargets`, so screens never import the runner) and the tour moves on.
- [x] The runner owns the current step (`stepIndex`); Back / Next / Skip go through it.
- [x] Scroll into view: targets inside a shell page use `PageScroll`'s scroll position (`useOptionalShellPage`); screens with their own scroll view use `TourScrollArea` (the transaction form).
- [x] Lazy routes (`route: () => Href`) for links that depend on today's practice data.

Screen map (targets per stage; 86 steps, 15 of them taps):
1. Dashboard (11): balance, income/expense, Needs Attention & Upcoming, cash flow, Savings & Debt Profile, trends, spending, recent, Safe to Spend, tab bar.
2. Money (10): tap Money → accounts total and list → tap Income → total, list, add → tap Billers and Remittances → due this month, filters.
3. Transactions (13): tap Activity → search, totals, newest day → tap + → amount, type and account, **This is a savings contribution**, **This is a debt payment**, category, save → Edit (this month's salary in the form) → Delete (row ⋮ menu, confirmation explained). Highlight only.
4. Savings (11): tap Plan → tap Savings Goals → total, allocation strategy, goals → tap House deposit → progress, Add money / Withdraw (links to the savings switch), details, projection, activity.
5. Debts (12): overview → credit cards list → Rewards Visa: credit used, cycles and statements, repayment strategy, outlook → loans list → motorcycle loan: balance, on-track summary, Record payment (links to the debt switch), payments, payoff date.
6. Financial Plan (8): amount → tap Use this → Food and Transport (already ticked from history, explained, not tapped, since a tap would untick them) → tap Continue to Plan → plan summary, category budgets → tap Accept and save plan → accepted.
7. Financial Reports (7): tap chart icon → period, distribution, forecast vs actual, plan vs actual, outlook, unusual spending.
8. Settings (9): tap profile icon → account → tap Categories → taxonomy → tap Definition of terms → glossary → Terms & Conditions → export and delete → lock and log out.
9. Offline & Sync (3): offline records, sync states and retry, online-only actions.
10. Replay and Finish (2): Replay tutorial row → Finish.

Files whose uncommitted changes belong to the user were not edited: the Debts overview and loans list are marked from their route files.

- [x] Step files under `steps/` (one per stage) and markers in 20 screens.
- [x] Tests: tap steps wait for the right control; scroll into view; `TapHint`; drift guard (every step's target exists in a screen; ids unique; stages in order).
- [ ] On device: walk all 82 steps; tune placement where the card covers its target.
- [ ] Resuming inside a goal's detail lands on the goals list (detail is screen state, not a route); the step offers recovery.

### Layer 6 — Guards and docs
- [ ] Drift test: render each step's screen with seed data and assert its anchor exists.
- [ ] Update `04-user-onboarding.md` (order, highlight-only transactions, accepting a practice plan) and the index entry.
- [ ] Focused Jest, `tsc`, `graphify update`.
