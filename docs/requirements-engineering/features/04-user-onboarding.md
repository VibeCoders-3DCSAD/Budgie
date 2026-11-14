## 4. User Onboarding

User Onboarding is an interactive mobile application tour. It teaches navigation
and common actions through highlighted controls, short explanations, and guided
taps across the real screens, filled with sample practice data. It does not
collect questionnaire answers or require users to create real financial records.

### 4.1 Tour Entry and Controls

The first-use sequence is Account Registration →
[Savings and Debt Profile Questionnaire](03-savings-and-debt-profile-questionnaire.md)
→ this interactive tour. Email verification, authenticated access, and required
terms consent precede the questionnaire. Enter the tour after questionnaire
submission and its results screen, including when classification is unavailable.

- Offer Start tour and Skip for now on the first visit to the application after
  the user completes the questionnaire and continues from its results; users who
  have never answered the offer see it once
- Divide the tour into stages and display the current stage and progress
- Allow users to continue, return to an earlier step, or choose Continue later
- Save progress separately for each signed-in user on the device and resume
  from the last unfinished step after returning to the application; a tour
  interrupted by locking or closing the application resumes as paused
- Treat skipping or pausing separately from completing the tour
- Make the tour available offline after the application is accessible locally

### 4.2 Guided Tour Flow

Taps marked *Tap* wait for the user's own tap on the highlighted control.

| Stage | Route and interactions | Guidance |
| --- | --- | --- |
| 1. Dashboard | Home → Dashboard | Introduce available balance, monthly income and expenses, Needs Attention & Upcoming, cash flow, the Savings & Debt Profile, trends, spending distribution, recent transactions, and Safe to Spend. Explain Home, Money, Activity, Plan, and the add-transaction button. |
| 2. Money | *Tap* Money → Accounts → *Tap* an account → *Tap* Income → *Tap* an income source → *Tap* Billers & Remittances | Explain accounts and cash position, income sources and paydays, and scheduled bills and remittances. Highlight each section and its add action without requiring setup. On Accounts and Income, the user opens a row's actions menu to see Edit and Delete; Next closes it. |
| 3. Transactions | *Tap* Activity → *Tap* + → Add Transaction → *Tap* Save → *Tap* a row's ⋮ menu | Explain search, filters, totals, and the daily list. In the form, the user fills in the amount, type and account, and category, then saves a practice transaction; This is a savings contribution and This is a debt payment are explained only. The tour moves on once the transaction is saved. The user then opens a row's ⋮ menu to see Edit and Delete, which are explained, not used. |
| 4. Debts | *Tap* Plan → Debts → *Tap* a card → *Tap* Back → *Tap* a loan → *Tap* Back | Follow the overview from top to bottom: the debt summary, this month's repayments, credit cards, a card (credit used, billing cycles and statements, repayment strategy, outlook, installments), loans and other debts, a loan (balance, on-track summary, Record payment, which opens Add Transaction with the debt payment on, payment history, payoff date), upcoming payments, and debt trends. |
| 5. Savings | *Tap* Savings Goals → *Tap* a goal | Explain total saved, the extra-savings split, the goal list, and a goal's progress, Add money and Withdraw (which open Add Transaction with the savings contribution on), details, projected completion, and activity. |
| 6. Financial Plan | *Tap* Budget → *Tap* Use this → *Tap* Continue to Plan → *Tap* Accept and save plan | Explain the planning amount, Past plans (without opening it), and why categories with recent spending, such as Food and Transport, start selected. Point out the arrow that shows a category's subcategories, without opening it. Show the plan summary and category budgets, then accept the practice plan and explain Safe to Spend and plan-versus-actual reports. |
| 7. Financial Reports | *Tap* header chart icon on the Plan page → Financial Reports → *Tap* Back | Explain the reporting period, cash outflow by category, last month's forecast versus actual, accepted-plan budgets versus actual, spending outlooks and forecast availability, and unusual spending, then return to the Plan page. |
| 8. Settings | *Tap* profile icon → Settings → *Tap* Categories → *Tap* Back → *Tap* Definition of Terms → *Tap* Back | Follow the page from top to bottom: account and preferences, categories, Definition of Terms, sync status (supported offline actions, locally queued changes, synchronization and retry), Terms & Conditions, export and account deletion (online only), and Lock and Log out (unsynced changes must sync first). Explain where settings live without requiring users to change them. |
| 9. Replay and Finish | Settings → Help and About → Replay tutorial | Show the exact path for starting the tutorial again. Explain Resume tutorial for unfinished progress, then offer Finish and return to the user's own Dashboard. |

### 4.3 Navigation and Highlight Behavior

- Highlight one target and explain one action at a time
- Teach users how to reach each destination through visible navigation controls
- Advance tap steps only after the user's own tap on the highlighted control;
  the tap performs its normal action
- Leave the highlighted part of a fill step usable so the user can fill it in,
  then continue with Next, or once the app confirms the action (a saved
  transaction)
- Close a menu the user opened for a step when the tour moves past that step
- Show guidance once the destination screen and highlighted control are ready
- Scroll the target into view and position guidance within the visible screen
- Restore the relevant screen when users return to an earlier step
- If a target is unavailable or loading fails, offer retry, skip, or continue later
  without leaving the user blocked behind an overlay
- Support readable text, screen-reader labels, and accessible navigation controls

### 4.4 Practice Data

- Run the tour on sample practice data: a sample person's accounts, income,
  bills and remittances, three months of transactions, savings goals, loans, and
  a credit card, built fresh each time the tour starts
- Show the user's own categories, so practice transactions use their taxonomy
- Keep practice data on the device only: never write it to the user's records,
  never synchronize it, and discard it when the tour ends, is paused, or the
  application locks
- Mark practice screens with `Tutorial data — your records are not changed`
- Answer forecasts, Financial Plan recommendations, and the Savings & Debt Profile
  from the practice data; read the user's consents and preferences unchanged
- Allow accepting the practice Financial Plan, which changes practice data only
- Do not modify existing user records, submit real forms, change consent, change
  preferences, export data, log out, or delete the user's account during the tour;
  Log out is unavailable while practice data is shown, and Lock ends the tour

### 4.5 Offline and Sync Guidance

- Explain which financial records can be viewed or managed locally and that
  supported offline changes wait on the device until they synchronize
- Explain Offline, Pending changes, Syncing, Up to date, and Sync failed statuses
- Show where to inspect pending or failed changes, the last successful sync,
  and how to manually synchronize or retry when connected
- Explain online-only actions and the availability of cached forecasts;
  refreshing forecasts requires connectivity
- Explain that unsynced changes must be synchronized before logout and that
  account deletion requires synchronization
- Teach sync states with explanations; do not require users to disconnect,
  generate failures, discard changes, or perform account actions

### 4.6 Scope Boundary

- User Onboarding does not collect, save, review, submit, or assess financial
  questionnaire responses, including seasonal spending answers
- [Savings and Debt Profile Questionnaire](03-savings-and-debt-profile-questionnaire.md)
  defines questionnaire inputs, drafts, and initial assessment results
- Completing the tour does not mean financial setup or classification is complete
- Accepting the practice Financial Plan does not create or accept a plan for the user
- [User Settings](14-user-settings.md) provides Resume tutorial and Replay tutorial
  under Help and About
- Replay starts at the Dashboard stage with fresh tour progress and does not
  reset financial data, questionnaire answers, or preferences

### 4.7 Tour States

- Initial state: the user can start the tour or skip it for now
- Loading state: practice data, tour progress, or the destination screen is loading
- Active state: the current target and guidance are displayed
- Waiting-for-tap state: the expected tap on the highlighted control is pending
- Practice state: practice data replaces the user's data on screen
- Paused state: progress is saved for later continuation
- Skipped state: the user chose not to start the tour
- Resume state: unfinished progress is restored for continued guidance
- Replay state: the tour starts again from Dashboard
- Target-unavailable state: the target cannot be shown and recovery is available
- Complete state: the user finished the tour and returned to their own data
- Error state: practice data, guidance, or progress could not be loaded or saved

### 4.8 Tour Messages

- Initial state: `Welcome to Budgie. Take a guided tour to learn where things are and how to use them.`
- Practice state: `This is a tutorial example. It will not change your balances or financial records.`
- Practice banner: `Tutorial data — your records are not changed`
- Paused state: `Continue whenever you are ready. Open Settings → Help and About → Resume tutorial.`
- Skipped state: `You can start the tour anytime from Settings → Help and About → Replay tutorial.`
- Resume state: `Continue your tutorial from where you left off.`
- Target unavailable: `This step is unavailable right now. Retry, skip this step, or continue later.`
- Progress save failure: `Your tutorial progress could not be saved. You can continue, but you may need to repeat this step later.`
- Replay instructions: `To take the tour again, tap your profile icon, open Settings → Help and About, and choose Replay tutorial.`
- Complete state: `You're ready! Replay this tutorial anytime from Settings → Help and About → Replay tutorial.`
- Error state: `The tutorial could not be loaded. Try again or continue using the app.`
