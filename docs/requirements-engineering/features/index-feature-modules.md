# BUDGIE Feature Modules

## BUDGIE's Modules

Design the application with the following features. The linked module documents
define the detailed requirements, including validation, recovery, offline, and
empty states.

| No. | Components | Requirements |
| --- | --- | --- |
| 1 | [Account Registration](01-account-registration.md) | Allows users to securely create an account and verify their email address. |
| 2 | [Login](02-login.md) | Allows registered users to securely log in and recover their accounts. |
| 3 | [Savings and Debt Profile Questionnaire](03-savings-and-debt-profile-questionnaire.md) | Allows users to complete a financial questionnaire after registration and before the interactive onboarding tour, and receive savings and debt classifications that inform the Financial Plan and update as financial data changes. |
| 4 | [User Onboarding](04-user-onboarding.md) | Guides users through an interactive mobile tour of the Dashboard, Money, Transactions, Savings Goals, Debts, Financial Planning, Financial Reports, Settings, and Offline & Sync, then explains how to replay the tutorial from Settings. Does not collect questionnaire answers. |
| 5 | [Dashboard](05-dashboard.md) | Provides an overview of available balance, monthly income and expenses, cash flow, spending trends and distribution, recent expenses, savings goals, savings and debt profile classification, Safe to Spend allocations, and a spending forecast summary. Includes Needs Attention & Upcoming for failed biller and remittance auto-posts due to insufficient funds, unusual-spending observations with a frequent-spending prompt, and reminders starting seven days before expected income, debt repayments, savings contributions, and unpaid credit-card payment deadlines. |
| 6 | [Income Sources and Accounts Management](06-income-sources-and-accounts-management.md) | Allows users to manage salaries, allowances, side income, and other sources of earnings, while organizing associated cash, bank accounts, and e-wallets based on recorded transactions and balances. |
| 7 | [Savings Goals Management](07-savings-goals-management.md) | Allows users to define targets such as emergency funds, tuition, rent, medical expenses, or planned purchases; record contributions; monitor cumulative progress; and project goal completion. |
| 8 | [Debt Management](08-debt-management.md) | Allows users to manage debt accounts, track repayments and outstanding balances, and project debt payoff dates. |
| 9 | [Billers and Remittances](09-billers-and-remittances.md) | Allows users to create, update, and delete current bills, essential expenses, payment schedules, and upcoming financial commitments. |
| 10 | [Cash Flow Management](10-cashflow-management.md) | Allows users to record, view, categorize, update, and monitor income and expense transactions. |
| 11 | [Income and Expense Categories](11-income-and-expense-categories.md) | Allows users to view, navigate, search, create, update, and delete custom categories and subcategories grouped into Income and Expenses, with expense categories further grouped into Essentials and Non-Essentials. Provides category and filter selectors with an empty state when no eligible category exists, and supports classification of income, expense, and transfer transactions. |
| 12 | [Intelligent Financial Planning](12-intelligent-financial-planning.md) | Allows users to generate, adjust, and accept a monthly plan from available account balances, spending forecasts, savings and debt profile classification, financial obligations, and savings goals. Includes savings, debt, and bill budgets by default, with manual budgeting options, category allocations, and offline accepted-plan review. |
| 13 | [Financial Reports](13-financial-reports.md) | Allows users to review cash outflow, accepted-plan budgets versus actual spending, savings progress, and debt summaries. Includes last month's forecast versus actual spending, monthly and quarterly spending outlooks, and unusual-spending observations with one-time, frequent, or yearly answers. |
| 14 | [User Settings](14-user-settings.md) | Allows users to manage their profile, preferences, notifications, security, and application configurations, including changing their password, exporting their financial data, requesting account deletion, and logging out of their account. |
| 15 | [Definition of Terms](15-definition-of-terms.md) | Allows users to look up plain-language English and Filipino definitions of the finance words the app uses, search them by name, definition, or Filipino keyword, and open a definition directly from an (i) button beside a finance label. Opened from Settings. |

Account Registration and Login have separate specifications.

First-use flow: Account Registration → Savings and Debt Profile Questionnaire →
interactive User Onboarding. Email verification, authenticated access, and
required terms consent precede the questionnaire.

Budgeting will not be a standalone module. Intelligent Financial Planning owns
active monthly spending allocations and their health. Legacy budget records
remain syncable historical data only and are not shown as an active planning
workflow.

Definition of Terms supports all product modules. Finance labels in the
Dashboard, Debt Management, credit card forms, Intelligent Financial Planning,
and spending forecasts link to their definitions.

Offline access and synchronization support all product modules. User Onboarding
explains offline capability and sync status; User Settings covers sync controls
and handling unsynced changes before account actions.
