import type { Href } from "expo-router";

type RouteMap = { readonly [key: string]: Href | RouteMap };

// Every navigable path in one place; screens call router.push(ROUTES.dashboard)
// instead of hardcoding strings. Authenticated routes live in app/(app)/, a group
// that shares a guarded layout without adding a URL segment. Typed routes check each
// entry against the files in app/, so add a path here when its screen lands.
export const ROUTES = {
  login: "/login",
  registration: "/registration",
  forgotPassword: "/forgot-password",
  userOnboarding: "/user-onboarding",
  dashboard: "/dashboard",
  money: "/money",
  moneyAccounts: "/money/accounts",
  moneyIncome: "/money/income",
  moneyBillers: "/money/billers-remittances",
  // Build the [id] links with the helpers in features/money/moneyRoutes.
  incomeSourceNew: "/money/income/new",
  incomeSource: "/money/income/[id]",
  billerNew: "/money/billers-remittances/new",
  biller: "/money/billers-remittances/[id]",
  billerEdit: "/money/billers-remittances/[id]/edit",
  billerRecord: "/money/billers-remittances/[id]/record",
  activity: "/activity",
  // Build /activity/new links with transactionFormHref() from features/ledger/transactionFormRoute.
  transactionForm: "/activity/new",
  plan: "/plan",
  planDebts: "/plan/debts",
  planSavings: "/plan/savings",
  planBudgets: "/plan/budgets",
  // [id] routes: link with { pathname, params: { id } }.
  planCreditCards: "/plan/debts/credit-cards",
  planCreditCard: "/plan/debts/credit-cards/[id]",
  planOtherDebts: "/plan/debts/other",
  planOtherDebt: "/plan/debts/other/[id]",
  planPastPlans: "/plan/budgets/history",
  planPastPlan: "/plan/budgets/history/[id]",
  settings: "/settings",
  categories: "/settings/categories",
  // Link to one term with { pathname, params: { term } }; components/TermInfo does this.
  glossary: "/settings/glossary",
  financialReports: "/financial-reports",
  spendingAlerts: "/spending-alerts",
} as const satisfies RouteMap;
