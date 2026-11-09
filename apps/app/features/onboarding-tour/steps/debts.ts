import { ROUTES } from "../../../routes";
import { ACCOUNT_IDS } from "../practice/seed/accounts";
import { DEBT_IDS } from "../practice/seed/debts";
import type { TourStepDef } from "../types";

const stage = "Debts" as const;
const card = { pathname: ROUTES.planCreditCard, params: { id: ACCOUNT_IDS.card } } as const;
const loan = { pathname: ROUTES.planOtherDebt, params: { id: DEBT_IDS.motorcycle } } as const;

export const debtSteps: TourStepDef[] = [
  { id: "debts-overview", stage, route: ROUTES.planDebts, target: "debts-overview", title: "Debts", body: "Andrea's credit card and loans, with what she owes and what is due next." },
  { id: "cards-list", stage, route: ROUTES.planCreditCards, target: "cards-list", title: "Credit cards", body: "Each card with its balance and current billing cycle." },
  { id: "card-summary", stage, route: card, target: "card-summary", title: "Credit used", body: "How much of her limit is used and how much is still available. Tap the (i) for what each term means." },
  { id: "card-cycles", stage, route: card, target: "card-cycles", title: "Billing cycles and statements", body: "Purchases land in the cycle they were made in. Each closed cycle has a statement with its amount and due date, and her payments." },
  { id: "card-strategy", stage, route: card, target: "card-strategy", title: "How to repay", body: "Andrea pays in full. She could pay the minimum or a set amount instead; the Financial Plan reserves whatever she chooses." },
  { id: "card-forecast", stage, route: card, target: "card-forecast", title: "Card outlook", body: "What her next statement is likely to be, based on how she uses the card." },
  { id: "loans-list", stage, route: ROUTES.planOtherDebts, target: "loans-list", title: "Loans", body: "Her motorcycle loan and SSS salary loan." },
  { id: "debt-balance", stage, route: loan, target: "debt-balance", title: "Balance left", body: "What Andrea still owes on the motorcycle." },
  { id: "debt-summary", stage, route: loan, target: "debt-summary", title: "On track?", body: "How much is paid off, the next payment, and when the loan should be finished." },
  { id: "debt-record-payment", stage, route: loan, target: "debt-record-payment", title: "Record a payment", body: "This opens Add Transaction with This is a debt payment on, so the balance drops as soon as she pays." },
  { id: "debt-payments", stage, route: loan, target: "debt-payments", title: "Payments", body: "Every payment, split into principal and interest." },
  { id: "debt-forecast", stage, route: loan, target: "debt-forecast", title: "Payoff date", body: "When the loan will be paid off if she keeps paying, and how extra payments would bring that forward." },
];
