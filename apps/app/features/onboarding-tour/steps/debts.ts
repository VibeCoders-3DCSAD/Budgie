import { ROUTES } from "../../../routes";
import { ACCOUNT_IDS } from "../practice/seed/accounts";
import { DEBT_IDS } from "../practice/seed/debts";
import type { TourStepDef } from "../types";

const stage = "Debts" as const;
const debts = ROUTES.planDebts;
const card = { pathname: ROUTES.planCreditCard, params: { id: ACCOUNT_IDS.card } } as const;
const loan = { pathname: ROUTES.planOtherDebt, params: { id: DEBT_IDS.motorcycle } } as const;

// In the order they sit on each page. The user opens each record and comes back themselves.
export const debtSteps: TourStepDef[] = [
  { id: "plan-tap", stage, target: "tab-plan", action: "tap", title: "Open Plan", body: "Tap Plan for debts, savings goals, and the Financial Plan." },
  { id: "debts-summary", stage, route: debts, target: "debts-summary", title: "Debts", body: "What Andrea owes across her credit card and loans, and when she should be debt-free." },
  { id: "debts-plan", stage, route: debts, target: "debts-plan", title: "This month's repayments", body: "How her Financial Plan pays each debt this month: the required payment, plus any extra." },
  { id: "debts-cards", stage, route: debts, target: "debts-cards", title: "Credit cards", body: "Each card with what she owes and how she repays it. Manage opens the full list." },
  { id: "card-open", stage, route: debts, target: `debts-card-${ACCOUNT_IDS.card}`, action: "tap", title: "Open a card", body: "Tap Rewards Visa." },
  { id: "card-summary", stage, route: card, target: "card-summary", title: "Credit used", body: "How much of her limit is used and how much is still available. Tap the (i) for what each term means." },
  { id: "card-cycles", stage, route: card, target: "card-cycles", title: "Billing cycles and statements", body: "Purchases land in the cycle they were made in. Each closed cycle has a statement with its amount and due date, and her payments." },
  { id: "card-strategy", stage, route: card, target: "card-strategy", title: "How to repay", body: "Andrea pays in full. She could pay the minimum or a set amount instead; the Financial Plan reserves whatever she chooses." },
  { id: "card-forecast", stage, route: card, target: "card-forecast", title: "Card outlook", body: "What her next statement is likely to be, based on how she uses the card." },
  { id: "card-installments", stage, route: card, target: "card-installments", title: "Installments", body: "Her phone upgrade is a 0% plan: the full price is owed now, billed in six equal parts, one per statement. She can record an early settlement here." },
  { id: "card-back", stage, route: card, target: "header-back", action: "tap", title: "Back to Debts", body: "Tap back to return to Debts." },
  { id: "debts-loans", stage, route: debts, target: "debts-loans", title: "Loans and other debts", body: "Her motorcycle loan and SSS salary loan, with what is left and whether each is on track. Manage opens the full list." },
  { id: "loan-open", stage, route: debts, target: `debts-loan-${DEBT_IDS.motorcycle}`, action: "tap", title: "Open a loan", body: "Tap Honda Click motorcycle." },
  { id: "debt-balance", stage, route: loan, target: "debt-balance", title: "Balance left", body: "What Andrea still owes on the motorcycle." },
  { id: "debt-summary", stage, route: loan, target: "debt-summary", title: "On track?", body: "How much is paid off, the next payment, and when the loan should be finished." },
  { id: "debt-record-payment", stage, route: loan, target: "debt-record-payment", title: "Record a payment", body: "This opens Add Transaction with This is a debt payment on, so the balance drops as soon as she pays." },
  { id: "debt-payments", stage, route: loan, target: "debt-payments", title: "Payments", body: "Every payment, split into principal and interest." },
  { id: "debt-forecast", stage, route: loan, target: "debt-forecast", title: "Payoff date", body: "When the loan will be paid off if she keeps paying, and how extra payments would bring that forward." },
  { id: "loan-back", stage, route: loan, target: "header-back", action: "tap", title: "Back to Debts", body: "Tap back to return to Debts." },
  { id: "debts-upcoming", stage, route: debts, target: "debts-upcoming", title: "Upcoming payments", body: "Every debt payment due this month, so nothing catches her by surprise." },
  { id: "debts-trends", stage, route: debts, target: "debts-trends", title: "Debt trends", body: "The payments she has made, and how her total debt should fall over time." },
];
