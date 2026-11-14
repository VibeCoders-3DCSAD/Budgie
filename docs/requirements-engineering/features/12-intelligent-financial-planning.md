## 12. Intelligent Financial Planning

### 12.1 Monthly Financial Plan

- Allow users to generate, review, adjust, and accept a monthly Financial Plan combining spending budgets, savings contributions, and debt repayments.
- Plan for the full current calendar month, including when a plan is created mid-month.
- Use selected expense categories, spending forecasts, financial commitments, savings goals, debt requirements, and Savings and Debt Profile Classification to inform recommendations.
- Keep a recommendation separate from the accepted plan until the user accepts it.
- Require an internet connection to generate a recommendation, while keeping accepted plans available for offline review.
- Keep accepted allocations and planned commitments unchanged when underlying goals, schedules, or category preferences later change.

### 12.2 Planning Amount

- Show available money from eligible financial-account balances, including cash, bank accounts, e-wallets, and other eligible accounts.
- Exclude credit-card credit from the available planning amount.
- Allow users to choose a positive planning amount no greater than the available money.
- Base the plan on that chosen amount without separately adding expected future income.
- Explain when available money is insufficient to begin planning or cover the selected requirements.

### 12.3 Category Selection and Budget Rules

- Allow users to select broad expense categories or individual subcategories for the plan.
- Prevent a broad category and its individual subcategories from being budgeted together in the same plan.
- Recommend previously used categories and subcategories for selection.
- Use recorded seasonal spending to recommend categories and a planning amount for the plan month. Keep the suggested planning amount within available money and let users change it.
- Allow users to provide a planned amount for selected categories without spending history.
- Allow users to choose Flexible, Minimum, or Fixed treatment for a category or subcategory in future Financial Plans.
- Treat Fixed as an exact allocation, Minimum as a non-reducible floor, and Flexible as adjustable without a required floor.
- Automatically include categories and subcategories with Fixed or Minimum requirements and prevent their removal while those rules apply.
- Preserve category rules when a recommendation cannot cover them; do not silently reduce required amounts.

### 12.4 Debt and Savings Commitment Review

- Include savings contributions, debt repayments, and billers and remittances in automatic budgeting by default.
- During setup, offer independent, initially unchecked "I'll budget savings manually", "I'll budget debt repayments manually", and "I'll budget billers & remittances manually" options. Checking an option excludes that commitment type from automatic budgeting and lets the user enter its budgets after `Continue to Plan`.
- Show scheduled amounts and dates alongside manually entered budgets before generating category allocations. Keep automatic budgets for commitment types the user has not chosen to budget manually.
- When the user selects manual budgeting, generate category allocations after they review the commitment budgets and choose `Calculate Allocations`. Otherwise, generate allocations after `Continue to Plan` using the automatic commitment budgets.
- Clearly identify exclusions and explain that excluding debt repayments from the plan does not cancel existing payment obligations.
- When API exclusion preferences are omitted, include savings contributions and debt repayments. Use scheduled amounts for automatic commitment budgets; require an explicit amount for each commitment the user chooses to budget manually before generating category allocations.
- Apply exclusions to optional surplus guidance as well as scheduled reservations.
- Allow users to choose how much to set aside for each payment and goal, and review or adjust these budgets again before accepting the plan.
- Show the original amount due or scheduled contribution alongside the user's chosen budget.
- Warn when a debt budget is below the amount due and may result in a missed payment.
- Warn when a savings budget is below the contribution schedule and may delay goal completion.
- Show a live breakdown of the planning amount, savings, debt, other scheduled commitments, and the amount available for categories.
- Keep full-month commitment budgets separate from payment status. Include occurrences already paid or contributed during the month in the monthly budget, and show recorded payments against their original requirements when reviewing the accepted plan.
- Prevent acceptance when total allocations and extra amounts exceed the available plan funds.
- Keep plan reservations separate from actual payments and savings contributions; accepting a plan does not move money.

### 12.5 Billers and Remittances

- Include active billers and remittances due within the plan month.
- Account for all scheduled occurrences in the month, including paid and partially paid occurrences. Default each occurrence's budget to its full scheduled amount and allow users to choose a manual budget.
- Show each commitment's name, reserved amount, and due date, together with the section total.
- Avoid counting the same scheduled expense in both a separate commitment reservation and the category spending budget.
- Count scheduled expenses toward matching Fixed or Minimum category requirements and budget only the remaining requirement separately.
- Keep the accepted plan's commitment amounts available for later review even if the underlying schedule changes.

### 12.6 Spending Budget Recommendation

- Recommend category budgets using the chosen planning amount after debt, savings, and bill-payment reservations.
- Use spending forecasts informed by recorded expense history. Exclude unusual expenses identified as one-time or awaiting an answer; include confirmed frequent spending and account for confirmed yearly payments in their recurring month.
- Use recorded spending as a fallback estimate when a forecasting service cannot provide a usable forecast.
- Respect Fixed and Minimum requirements while distributing money among selected categories.
- Show each category's treatment, estimated spending, proposed budget, and any constrained or unfunded amount.
- Allow users to adjust eligible allocations before accepting the plan.
- Show an overall shortfall when required commitments exceed the planning amount, without silently relaxing category rules.
- Separately highlight when Essentials budgets fall below estimated spending or required amounts.
- Allow users to revise the planning amount and refresh the recommendation within their available money.

### 12.7 Seasonal Context and Explanations

- Use the user's reported higher- and lower-expense seasons to explain estimated spending changes when their directions agree.
- Allow overlapping seasons and keep saving preferences separate from expense patterns.
- Show a review notice when the forecast differs from the user's reported seasonal direction.
- Use seasonal preferences as explanatory context rather than automatically changing budget requirements or payment reservations.
- Base monthly explanations on relevant spending evidence and confirmed financial commitments.
- Distinguish an expense forecast from a claim that prices have changed.
- Explain usual spending, forecast changes, available money, and reserved commitments separately.
- Present recommendations in simple English with clear peso amounts, without pressure, promised outcomes, or unsupported claims.
- Keep useful explanations and review notices available if additional generated insights are delayed or unavailable.

### 12.8 Savings Contribution Plan

- By default, budget scheduled contributions for active savings goals due during the plan month, including emergency fund goals. When the user chooses manual savings budgeting, use their reviewed contribution budgets.
- Show the selected contribution budgets and their scheduled dates.
- Use Savings and Debt Profile Classification to inform optional surplus guidance, including an eligible emergency fund as a possible destination.
- Allow users to choose an extra savings amount after required reservations and category allocations.
- When the recommendation is infeasible, allow users to skip savings contributions for that plan only after confirming that this may delay their goals.
- Clearly identify skipped or underfunded savings contributions in the plan review.

### 12.9 Debt Repayment Plan

- By default, budget loan repayments and authoritative credit-card statement minimums due during the plan period, including payments already made that month and loans paid off during the month. When the user chooses manual debt budgeting, use their reviewed repayment budgets.
- Show original payment requirements, selected repayment budgets, due dates, and underfunding warnings.
- Use Savings and Debt Profile Classification to inform optional surplus guidance without automatically bypassing other commitments.
- Allow users to choose an extra debt repayment amount separately from scheduled repayment budgets.
- Keep debt prioritization and credit-card repayment behavior consistent with Debt Management.
- When the recommendation is infeasible, allow users to skip debt repayments for that plan only after confirming the risk of missed payments.
- Keep detailed debt payoff projections in Debt Management.

### 12.10 Review and Acceptance

- Present savings and debt budgets, billers and remittances, and category allocations in a clear plan review.
- Show remaining unallocated money and optional surplus guidance separately from scheduled commitments.
- Require confirmation before accepting underfunded savings, debt, or bill budgets, explaining the risk of delayed goals or missed payments.
- Leave optional surplus amounts under the user's control, including when classification information is incomplete or outdated.
- Require users to refresh an unaccepted recommendation when its source information changes.
- After a savings, debt, or bill budget changes, update the remaining plan money and let users choose `Recalculate` to rebalance category allocations or adjust eligible category allocations themselves.
- Hide explanations and surplus guidance based on the earlier allocation after commitment budgets change. Allow acceptance without recalculation when the edited plan remains feasible, contains valid amounts, and fits the planning amount.
- Prevent acceptance while the plan is infeasible, contains invalid amounts, or exceeds available plan funds.
- Save the accepted plan for its month and allow users to reopen it without regenerating its original allocations or commitments.
- Retain the accepted savings and debt budgets and any explicit plan exclusions when reopening a plan. Manual budgeting alone does not exclude the user's reviewed budgets from the accepted plan.

### 12.11 Accepted Plan Spending Review

- Show actual category spending against accepted budgets, including amounts used, remaining, or overspent.
- Show budget utilization and identify the category placing the most pressure on its allocation.
- Include eligible expenses outside planned categories in total spending and identify those expenses separately.
- Avoid counting debt payments, savings activity, credit-card payments, and scheduled expenses reserved outside category budgets as ordinary category spending.
- Base category budget utilization on the accepted category allocations rather than the full planning amount.
- Allow utilization to exceed 100% when spending exceeds the budget and omit percentages when no budget exists.
- Show calendar-period progress as context without asserting that future spending is on track.
- Calculate spending review information offline and refresh it after acceptance and transaction synchronization.
- Preserve the accepted plan and explain when actual spending information is unavailable.

### 12.12 Past Financial Plans

- Allow users to browse accepted plans from completed months and open their details.
- Preserve each past plan's accepted allocations and planned commitments as the comparison baseline.
- Compare actual spending during the plan period against category and subcategory budgets.
- Show planned, actual, and variance amounts and identify overspent categories.
- Show total planned and actual spending and whether spending exceeded the plan.
- Compare actual savings contributions and debt repayments with their planned amounts and identify additional activity.
- Distinguish an unplanned commitment or activity from a planned payment that has not been recorded.
- Keep historical plan comparisons within the relevant user's account and the plan's own period.

### 12.13 Feedback and Availability

- Show clear loading, generating, saving, empty, success, and error feedback.
- Explain missing expense categories, insufficient available money, unavailable recommendations, and conflicting requirements.
- Preserve valid planning choices when generation or saving fails and allow users to retry.
- Clearly distinguish a recommendation, an infeasible plan, a recommendation requiring refresh, and an accepted plan.
- Provide accepted-plan viewing and locally calculated spending review without requiring online insights.
