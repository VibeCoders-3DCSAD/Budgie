## 6. Income Sources and Accounts Management

### 6.1 Account Management

- View total money across all accounts
- View the list of financial accounts
- Add a financial account
- View financial account details
- Edit a financial account
- Archive a financial account with confirmation while preserving its transaction history.
- View archived financial accounts separately from accounts currently in use.
- Require archiving before a financial account can be deleted.
- Delete an archived financial account with separate confirmation while preserving
  its transaction history.

### 6.2 Account Form

- Account name
- Account type choices: Cash / Bank / E-Wallet / Credit Card / Other.
- Balance
- Institution name
- Opening date
- Configure planned contributions, their frequency, and contribution dates in
  Savings Goals. Omit these controls from financial-account forms, including
  HYSA forms. Preserve schedules already saved on older accounts when editing.
- Credit limit, when applicable
- Payment deadline, for credit card accounts
- Cut-off day of the month (1-31), for credit card accounts
- Alert threshold percentage of credit limit, for credit card accounts

### 6.3 Account Form Placeholders

- Account name: `Enter account name`
- Account type: `Select account type`
- Balance: `Enter balance`
- Institution name: `Enter institution name`
- Opening date: `Select opening date`
- Credit limit: `Enter credit limit`
- Cut-off day: `Enter billing cycle end day`
- Alert threshold percentage: `Enter alert percentage`

### 6.4 Account States

- Initial state: account form is ready for input
- Empty-input state: required account fields are blank
- Validation-failure state: one or more account values are invalid
- Loading state: account data is being loaded
- Saving state: account changes are being saved
- Empty-list state: no financial accounts exist
- No-institution state: institution is optional and has not been provided
- Archive-confirmation state: the user must confirm account archiving
- Archived state: the account is available in the archive
- Delete-confirmation state: the user must confirm deletion of an archived account
- Error state: account data could not be loaded or saved
- Success state: account was created or updated

### 6.5 Account Messages

#### Validation Messages

- Empty account name: `Account name is required. Enter an account name before continuing.`
- Empty account type: `Account type is required. Select an account type before continuing.`
- Invalid opening balance: `Opening balance must be a valid amount. Enter a valid amount and try again.`
- Invalid credit limit: `Credit limit must be a valid amount. Enter a valid amount and try again.`
- Invalid credit limit: `Credit limit must be greater than 0. Enter any positive amount and try again.`

#### Account Error Messages

- Create failure: `This financial account "{account name}" could not be created. Check the details and try again.`
- Update failure: `This financial account "{account name}" could not be updated. Check the details and try again.`
- Delete failure: `This financial account "{account name}" could not be deleted. Check your connection and try again.`
- Generic failure: `Something went wrong. Please try again.`

#### Account Notices

- Loading state: `Your financial accounts are loading. Please wait a moment.`
- Empty-list notice: `No accounts are available yet. Tap + to add your first account.`
- No-institution notice: `No institution was added. Continue without one or add it later.`
- Archive-confirmation notice: explain that the account will move to the archive,
  be excluded from available money, and retain its transaction history.
- Delete-confirmation notice: explain that the archived account will be removed
  and its transaction history will be preserved.

#### Account Progress and Success Messages

- Saving progress: `Your account is being saved. Please wait a moment.`
- Account success: `Your account was saved. Continue managing your accounts.`

### 6.6 Account Validation and Calculations

- Require an account name
- Require an account type
- Require a valid opening balance
- Require a valid credit limit for credit card accounts when enabled
- Require a credit limit greater than 0 when provided
- Define each billing cycle from the day after the previous cut-off through the next cut-off.
- Track the payment deadline separately from the cut-off day for credit card accounts.
- Require a valid cut-off day in 1-31 for credit card accounts; short months clamp the cutoff to the month's last day
- Require an alert threshold percentage from 0 to 100 for credit card accounts
- Planned: alert the user when a credit card balance exceeds its configured alert threshold percentage of the credit limit.
- Current account balance reflects the opening balance and supported transaction effects
- Total money includes financial accounts currently in use and excludes archived accounts.

### 6.7 Income Source Overview

- View estimated monthly income after linked payroll-loan deductions
- Show monthly income before those debt deductions and the deducted amount
- View the list of income sources
- View archived income sources separately

### 6.8 Create Income Source

- Add an income source

### 6.9 Edit Income Source

- Edit an income source

### 6.10 Archive and Delete Income Source

- Archive an income source with confirmation.
- Exclude archived income sources from future income planning and monthly estimates.
- Preserve previously recorded income transactions when archiving.
- Require archiving before an income source can be deleted.
- Delete an archived income source with separate confirmation while preserving
  previously recorded income transactions.

### 6.11 Income Source Form

- Income name
- Destination account
- Income category
- Frequency: Monthly / Twice a month / Every week / Every day
- Expected amount: one required amount greater than zero
- Pay date or schedule
- Notes

### 6.12 Income Calculations

- Monthly expected income is normalized from each source's frequency
- Deduct repayments for linked payroll-deducted salary loans from the monthly estimate.
- Display zero when those deductions exceed estimated income.

### 6.13 Income Scheduling and Automation

- Create a recurring income schedule when an income source is saved.
- Update the linked recurring schedule when the income source is edited.
- Use the source's expected amount, destination account, income category, and
  payment schedule for generated transactions.
- For Monthly, select one payday; for Twice a month, select two distinct paydays
  in chronological order; for Every week, select a weekday.
- Use the last day of the month when a payday exceeds that month's length.
- Keep twice-monthly paydays distinct even in February.
- Apply saved schedule changes from the current date without generating missed
  income from earlier paydays.
- Stop future generation when the income source is archived or deleted and preserve
  previously recorded income transactions.
- Maintain one linked recurring schedule per income source.

### 6.14 Income Source States

- Initial state: income source management is ready for use
- Loading state: income sources or automation details are loading
- Empty-list state: no income sources are recorded
- Empty-input state: required income source fields are blank
- Validation-failure state: income source inputs are invalid
- Saving state: income source changes are being saved
- Network-required state: the requested income source action requires an internet connection
- Sync-failure state: income source changes could not be synchronized
- Archive-confirmation state: the user must confirm income source archiving
- Archived state: the income source is available in the archive
- Delete-confirmation state: the user must confirm deletion of an archived income source
- Error state: income source data could not be loaded or saved
- Success state: income source changes were saved

### 6.15 Income Source Messages

#### Validation Messages

- Empty income name: `Income name is required. Enter an income name before continuing.`
- Empty destination account: `Destination account is required. Select an account before continuing.`
- Empty income category: `Income category is required. Select a category before continuing.`
- Empty frequency: `Income frequency is required. Select a frequency before continuing.`
- Invalid expected amount: `Expected amount must be greater than zero.`
- Invalid pay schedule: `Pay date or schedule is not valid. Enter a valid schedule and try again.`

#### Error Messages

- Income source error: `Your income source could not be loaded or saved. Check your connection and try again.`
- Sync failure: `Your income source changes could not be synchronized. Retry the sync when your connection is available.`

#### Notice Messages

- Initial state: `Income source management is ready. Add or review an income source to continue.`
- Empty income source list: `No income sources are recorded yet. Add an income source to plan expected income.`

#### Network and Session Error Messages

- Network required: `This income source action requires an internet connection. Reconnect and try again.`
- Network error: `We could not reach your income sources. Check your connection and try again.`

#### Progress and Success Messages

- Income source loading: `Your income sources are loading. Wait a moment for the list to appear.`
- Income source saving: `Your income source changes are being saved. Wait a moment for the update to finish.`
- Income source saved: `Your income source changes were saved. Continue managing expected income.`

#### Confirmation Messages

- Income source archive confirmation: explain that archiving excludes the source
  from future planning and income estimates, stops future automated income, and
  preserves previously recorded transactions.
- Income source deletion confirmation: explain that deletion removes the archived
  source while preserving previously recorded transactions.

#### Recovery Messages

- Income source sync recovery: `Some income source changes could not be synchronized. Retry them or review the failed changes before discarding anything.`
