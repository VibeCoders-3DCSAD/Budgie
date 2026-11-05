## 8. Debt Management

### 8.1 Debt Overview

- Allow users to view credit-card debts and non-credit-card debts from Debt Management.
- Show total recorded debt payments, remaining debt, and overall repayment progress.
- Show payment trends and projected debt balances across credit cards and loans.
- Show upcoming payments and their payment status.
- Show the debt budget from the Financial Plan, required payments, available surplus, and shortfalls.
- Explain when a Financial Plan is needed to provide budget-based repayment recommendations.

### 8.2 Credit Card Management

- Allow users to create and edit credit-card accounts through Accounts Management and review their debt activity through Debt Management.
- Show each card's issuer, credit limit, available credit, outstanding debt, cut-off day, and payment deadline.
- Allow users to view current and previous billing cycles, purchases, installments, statements, and payments.
- Allow users to reconcile available credit against the amount reported by the issuer.
- Require confirmation before replacing the calculated available credit with an issuer-reported amount.
- Explain that issuer records may differ from estimates shown by the application.

### 8.3 Credit Card Billing Cycles and Statements

- Organize credit-card activity by billing cycle, with the next cycle beginning the day after the cut-off date.
- Allow users to review and adjust a billing cycle's dates when they differ from the card's usual schedule.
- Assign purchases to the applicable cycle using the issuer's posting date when available, or the transaction date as an estimate.
- Preserve previous billing-cycle history when the card's usual schedule changes.
- Show an estimated statement balance before the issuer's statement is recorded and clearly identify it as an estimate.
- Prompt users to record the issuer's statement after a billing cycle ends.
- Allow users to record the statement balance, minimum amount due, finance charges, statement date, and payment deadline.
- Use the issuer's recorded statement as the basis for statement payment requirements.
- Keep each statement and its payments associated with the relevant billing cycle.

### 8.4 Credit Card Purchases and Installments

- Allow users to record regular and installment purchases through Transaction Management when paying with a credit card.
- Show purchases in the applicable card's billing-cycle history.
- Reflect purchases in available credit and outstanding card debt.
- Allow users to track an installment's remaining principal, remaining term, monthly amortization, and settlement progress.
- Support zero-interest and interest-bearing installments.
- Include only the installment amortization due for a cycle in that cycle's payment requirement.
- Reflect the full installment purchase in available credit when this matches the issuer's treatment.
- Keep installment payment requirements within credit-card billing cycles.
- Allow users to record a completed early settlement, including any applicable pre-termination fee, and mark the installment completed.
- Do not treat a regular card overpayment as an installment early settlement.

### 8.5 Credit Card Payments and Credit Balances

- Allow users to start a statement payment from Debt Management and complete it through Transaction Management.
- Require payments to use an eligible source account and appear in both transaction history and statement payment history.
- Allow one current payment record per billing cycle, with users editing that payment when correcting the recorded total.
- Allow users to edit a payment and update its related transaction together.
- Require confirmation before deleting a payment and reversing its related transaction.
- Show whether the statement is fully paid, the minimum payment is satisfied, or further payment is needed to meet the minimum.
- Warn that unpaid statement balances may incur finance charges.
- Allow a payment above the statement balance to create a credit balance.
- Keep the official credit limit unchanged by an overpayment.
- Show the resulting credit balance separately and apply it to later statement obligations only when confirmed.
- Do not automatically shorten or settle an installment because a card payment exceeds the statement balance.

### 8.6 Credit Card Repayment Strategy

- Allow users to choose Pay in Full, Pay Minimum, Percentage, or Custom Payment for each card.
- Use Pay in Full when the user has not chosen another strategy.
- Base Pay in Full on the statement balance and Pay Minimum on the issuer's minimum amount due.
- Base Percentage on the user's chosen proportion of the statement balance, without exceeding that balance.
- Require a Custom Payment target to meet the minimum amount due and remain below the full statement balance.
- Explain when the chosen payment target leaves a balance that may incur finance charges.
- Reflect the selected strategy in the Financial Plan's credit-card payment requirement and repayment projections.
- Keep each card's payment target independent of the global Snowball or Avalanche strategy used for surplus recommendations.

### 8.7 Non-Credit-Card Debt Management

- Allow users to create, view, and edit Personal Loans, Salary Loans, Multipurpose Loans, Business Loans, Auto Loans, and Custom Debts.
- Allow users to describe the lender, amount originally owed, current balance, repayment arrangement, target payoff date, and relevant loan context.
- Support adding an existing debt with an outstanding balance and recording subsequent repayments.
- Support Weekly, Biweekly, Semi-monthly, Monthly, Quarterly, and Custom repayment schedules.
- Support No Interest, Flat or Add-on, Diminishing Balance, and Provider Calculated interest arrangements.
- Allow users to account for applicable fees, penalties, loan terms, and notes.
- Allow users to indicate whether a loan permits extra payments.
- Show remaining balance, next payment, repayment progress, estimated payoff, and payment history.
- Distinguish a debt's active, paid-off, archived, or deleted status from its repayment progress.
- Provide separate views for active, finished, archived, and deleted debts.

### 8.8 Loan-Specific Behavior

- Allow users to describe the purpose of personal, multipurpose, and business loans.
- Allow business loans to be associated with a relevant income source.
- Allow users to identify a salary-loan provider, including SSS, GSIS, Pag-IBIG, or Other, and link the loan to an income source.
- Support payroll deduction, automatic debit, manual payment, and other salary-loan repayment arrangements.
- Reflect scheduled payroll-loan deductions in estimated income from the linked income source.
- Allow auto loans to include vehicle and downpayment information and show the financed amount based on the purchase price less the downpayment.
- Allow Custom Debts to use a repayment and interest arrangement appropriate to the debt.

### 8.9 Non-Credit-Card Debt Payments

- Allow users to start a payment from a debt's details or identify an expense as a debt payment in Transaction Management.
- Associate each payment with the selected debt and its expense transaction.
- Allow users to distinguish the principal repaid from interest or fees paid.
- Reduce the outstanding debt by the principal portion of the payment.
- Prevent principal repayment from exceeding the outstanding debt and prevent the principal and interest or fees from exceeding the total payment.
- Show recent payments and allow users to view the complete payment history.
- Allow users to edit a payment through Transaction Management and update the related transaction, debt balance, and repayment progress together.
- Require confirmation before deleting a payment, reversing its related transaction, and restoring the corresponding debt balance.
- Mark a debt paid off when its balance is cleared and update that status if a payment correction restores an outstanding balance.
- Keep ordinary expenses separate from debt repayments unless the user explicitly records them as debt payments.

### 8.10 Repayment Budget and Surplus Allocation

- Include credit-card payment targets and required non-credit-card repayments when showing the total debt payment requirement.
- Show the amount available for repayments, any shortfall, and any surplus after required payments.
- Allow users to select Snowball or Avalanche as the global surplus repayment strategy.
- Use Snowball to prioritize smaller outstanding balances and Avalanche to prioritize higher interest rates.
- Under Avalanche, rank unpaid credit-card statements ahead of loans, because cards do not store an interest rate and their finance charges are usually the highest.
- Allow users to prioritize eligible debts ahead of the selected strategy when allocating surplus.
- Recommend surplus only for loans that permit extra payments; exclude salary loans from surplus allocation.
- Include unpaid credit-card statements as candidates for surplus recommendations after required payment targets are considered.
- Size each debt's surplus from what was owed at the start of the plan month less its required payment, so surplus never exceeds the balance.
- Count payments recorded this plan month above a debt's required payment toward its recommended surplus, and show the surplus left to pay.
- Show surplus that no debt can take as "Not assigned to a debt". The user decides where that money goes; the app suggests adding it to their savings goals but does not cap or redirect it.
- Show a plan shortfall and the strategy surplus together when both apply.
- Exclude archived and deleted debts from current repayment planning.
- Present allocations as recommendations; they do not record payments or move money.

### 8.11 Offline Repayment Projections

- Provide repayment projections offline using recorded balances, payment schedules, recorded repayments, applicable interest, and Financial Plan allocations when available.
- Show estimated payoff dates and whether repayment is ahead of, on track for, or behind the user's target payoff date.
- Explain when a repayment schedule is incomplete or scheduled payments do not produce a projected payoff.
- Distinguish recorded payment progress from future repayment projections.
- Show actual and projected balances in charts and repayment tables for individual debts, credit cards, and the overall debt view where applicable.
- Allow users to inspect one-month, one-year, all-period, and debt-free views where applicable.
- Show missed scheduled payments and their effect on repayment progress.
- Recalculate projections when balances, payment history, repayment arrangements, card strategies, or relevant Financial Plan allocations change.
- Explain the assumptions used for projected contributions, including the effect of recorded payment amounts.
- Exclude unconfirmed provider-calculated interest and fees from estimates and explain this limitation.
- Keep projections separate from actual payments and account balances.

### 8.12 Archive, Restore, and Delete

- Allow users to archive a non-credit-card debt after confirmation while retaining its payment history.
- Exclude archived debts from current repayment planning and new payment recording.
- Allow users to review archived debts and restore them to current planning.
- Require a debt to be archived before it can be deleted.
- Require a separate deletion confirmation that explains the effect on the debt and its history.
- Preserve previously recorded financial transactions when deleting a debt.
- Manage credit-card account archiving and deletion through Accounts Management.

### 8.13 Feedback and Availability

- Show clear loading, saving, empty, success, and error feedback for debt and credit-card actions.
- Explain when an eligible account, income source, debt, statement, or repayment schedule is unavailable and guide users to the relevant action.
- Preserve users' valid entries when an action fails and allow them to correct or retry it.
- Clearly identify estimated statements, repayment assumptions, incomplete information, and potentially outdated card information.
- Require explicit confirmation for destructive actions and authoritative available-credit changes.
