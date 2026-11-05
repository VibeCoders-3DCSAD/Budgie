## 7. Savings Goals Management

### 7.1 Savings Overview

- View savings goals and the total amount saved toward them.
- View each goal's saved amount, target amount, and progress.
- View active and achieved goals separately from archived goals.
- Open a goal to review its details, contribution schedule, projections, and
  activity history.
- View the current-cycle savings amount reserved by the Financial Plan,
  required contributions, shortfall, and unallocated amount.
- View the Financial Plan's remaining category budget after recorded spending,
  separately from money reserved for savings goals.
- Explain when no goals exist and allow users to create a goal.

### 7.2 Goal Management and Linked Accounts

- Create, view, and edit savings goals.
- Require each goal to be linked to one of the user's financial accounts that
  is currently in use. Credit card accounts are not eligible.
- Allow one account to hold multiple savings goals.
- Treat each goal as an amount set aside within its linked account. Linking a
  goal does not create an account or move money.
- Allow users to find and select an eligible account and explain when none
  are available.
- Preserve a goal's history and existing account relationship if its account
  is archived. Explain when the linked account is unavailable for new activity.
- Keep goals and their financial information private to their owner.

### 7.3 Goal Details and Contribution Schedule

- Require a meaningful goal name that is unique among the user's existing goals.
- Require a positive target amount and a target date.
- Allow users to specify a non-negative starting amount already saved toward
  the goal, defaulting to zero.
- Allow users to add optional notes and view them in the goal's details.
- Allow users to select Low, Medium, or High priority.
- Allow users to identify their emergency fund using "This is my emergency fund."
- Offer contribution frequencies: Daily, Weekly, Twice a Month, Monthly, or None.
- For Weekly, select a weekday; for Monthly, select one calendar day; for Twice
  a Month, select two distinct calendar days in chronological order.
- Use the last day of a shorter month when a selected day does not exist, while
  keeping twice-monthly contributions on distinct dates.
- Allow users to specify a non-negative planned amount for each contribution.
- With None selected, allow manual contributions without requiring a planned
  contribution amount or scheduled dates.
- Show the next scheduled contribution without requiring users to enter it
  separately. Require a scheduled occurrence on or before the target date.
- Suggest the contribution needed to reach the target by the selected date,
  based on the amount still needed and remaining scheduled contributions.
- Allow users to apply the suggested contribution or choose their own amount.
- Treat the schedule as a plan; saving it does not record a contribution or
  move money.
- Explain invalid or incomplete details and retain valid entries for correction.

### 7.4 Suggested Emergency Fund Target

- Show a suggested target when the user marks a goal as their emergency fund.
- Calculate average monthly essential expenses from recorded, posted essential
  expenses over the last six completed calendar months.
- Include months with no spending in the average and exclude the current
  incomplete month.
- Suggest a target equal to that monthly average multiplied by six months.
- Show the monthly average, six-month coverage, and calculation basis.
- Allow users to apply the suggestion or enter their own positive target.
  Replace the entered target only when the user chooses to apply the suggestion.
- Show when the suggestion is being calculated.
- If no essential expenses are available or calculation fails, explain this
  and allow users to enter their own target.

### 7.5 Contributions and Withdrawals

- Open Transaction Management from a goal to record a contribution or withdrawal
  with the selected goal and linked account already identified.
- Keep the contribution destination fixed to the goal's linked account.
- Allow contributions from unallocated money already in that account or from
  another eligible account. Exclude credit cards.
- Explain unallocated money as money in the account that has not been set aside
  for any savings goal.
- Allocating existing unallocated money increases the goal's saved amount
  without changing the account balance.
- A contribution from another account transfers money to the linked account
  and increases the goal's saved amount together.
- Prevent contributions from using money reserved for other goals.
- Record a standalone withdrawal as a transfer from the linked account to an
  eligible destination, reducing the goal's saved amount accordingly.
- Allow recurring contributions through Transaction Management's recurring
  transaction option.
- View recent activity and separate contribution and withdrawal histories.
- Open the related transaction to review or correct a contribution or withdrawal.
- Require confirmation before deleting an activity as a correction and update
  the related transaction and goal progress together.
- Ordinary deposits and income do not automatically increase goal progress.
- Prevent new contributions to achieved goals or archived goals unless the goal
  is reopened or restored as appropriate.

### 7.6 Spending from an Account with Goals

- Calculate the account's unallocated money after reserving the saved amounts
  of all linked goals. Archived goals continue to reserve their saved money.
- Use unallocated money first for ordinary expenses without reducing goal progress.
- When an expense requires reserved savings, ask the user to choose the goals
  and amounts to withdraw. Show how much is needed and available in each goal.
- Require explicit confirmation of the withdrawal split; do not choose goals
  or divide amounts automatically.
- Record the expense and its goal withdrawals together. Prevent withdrawals
  exceeding the savings available in the selected goals.
- Update affected goal amounts when the expense is edited and restore withdrawn
  savings when the expense is deleted.
- Stop automatic expense posting when it would require reserved goal money.
  Apply the same withdrawal review to manual bill payments.
- Explain any existing shortage when reserved goal amounts exceed the account
  balance and ask users to review their allocations.

### 7.7 Progress and Completion

- Calculate the saved amount as the starting amount plus recorded contributions
  minus recorded withdrawals.
- Calculate the remaining amount and completion percentage against the target.
- Keep the displayed progress between zero and one hundred percent and the
  remaining amount at or above zero.
- Mark a goal as achieved when its saved amount meets or exceeds its target.
- Return an achieved goal to active progress if a withdrawal reduces its saved
  amount below the target.
- Update progress after contributions, withdrawals, and transaction corrections.
- Exclude deleted activities from current progress and projections.

### 7.8 Savings Allocation

- Review how the Financial Plan's savings amount is allocated across active goals.
- Show required contributions, proposed amounts, shortfalls, and unallocated money
  for the current planning cycle.
- Prioritize the emergency fund until its saved target is met.
- Allocate required contributions before distributing surplus.
- Allow users to choose Avalanche or Snowball for savings allocation.
- After emergency fund priority, Avalanche favors the goal with the largest
  current-cycle contribution shortfall, then, when shortfalls are equal (for
  example, every required contribution is already covered), the goal with the
  largest remaining target amount; Snowball favors the goal with the smallest
  remaining target amount. Remaining ties go to the earliest target date.
- Show funded, partially funded, and unfunded goals with understandable reasons.
- Exclude archived goals from new allocation proposals.
- Allow users to review a proposed contribution and open Transaction Management
  to confirm it. A proposal alone does not move money or change goal progress.

### 7.9 Offline Projections and Forecast Display

- Calculate projections offline from the goal's current saved amount, target,
  target date, and selected contribution schedule and amount.
- Project when the goal will reach its target and explain when the planned
  contributions will not reach the target by the selected date.
- Recalculate projections when goal details or recorded activity change.
- Display Ahead, On track, Behind, or No schedule status as appropriate.
- Show actual savings history and future projected savings together in a chart,
  clearly distinguishing recorded amounts from projections.
- Allow users to select one-month, one-year, or all-date views.
- Show a projection table and the projected target-completion milestone.
- Explain when a complete contribution schedule is needed to show future projections.
- With no schedule, explain that manual contributions update actual progress.
- Keep projected contributions separate from actual savings; projections do
  not record transactions or change balances.

### 7.10 Archive, Restore, and Delete

- Require confirmation before archiving a goal and explain that its history
  and reserved savings will be retained.
- View archived goals separately and allow users to restore them.
- Exclude archived goals from current planning and new contributions.
- Require a goal to be archived before it can be deleted.
- Require separate confirmation before deletion and explain its effect on the
  goal, its history, and any money still reserved for it.
- Deleting a goal must not move money or erase the account's transaction history.

### 7.11 Savings Reminders and Alerts

- Receive upcoming target-date reminders.
- Receive reminders for upcoming or missed scheduled contributions.
- Receive behind-goal alerts and goal-achieved notifications.
- Receive replenishment reminders after withdrawing from an emergency fund.
- Acknowledge, dismiss, or snooze savings alerts.
- Configure savings notification preferences.

### 7.12 Feedback and Availability

- Show loading, saving, empty, and error feedback for the relevant action.
- Explain when no eligible account or goal is available for a selected action.
- Distinguish active, achieved, and archived goals and explain available actions.
- Show archive and deletion confirmations before carrying out those actions.
- Explain when a Financial Plan is needed to review savings allocations.
- Keep offline projections available using the goal information on the device.
- Retain entered information after a failed save and allow users to retry.
