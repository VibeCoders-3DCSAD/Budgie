import { ROUTES } from "../../../routes";
import type { TourStepDef } from "../types";

const stage = "Money" as const;

export const moneySteps: TourStepDef[] = [
  { id: "money-tap", stage, target: "tab-money", action: "tap", title: "Open Money", body: "Tap Money to see Andrea's accounts, income, and bills." },
  { id: "money-accounts-total", stage, route: ROUTES.moneyAccounts, target: "money-accounts-total", title: "Accounts", body: "Her cash position across every account. Savings accounts and credit cards are kept apart from spending money." },
  { id: "money-accounts-list", stage, route: ROUTES.moneyAccounts, target: "money-accounts-list", title: "Each account", body: "Payroll, GCash, savings, and a credit card. Tap one to edit it; the add button sets up a new account." },
  { id: "money-income-tap", stage, route: ROUTES.moneyAccounts, target: `hub-${ROUTES.moneyIncome}`, action: "tap", title: "Income", body: "Tap Income." },
  { id: "money-income-total", stage, route: ROUTES.moneyIncome, target: "money-income-total", title: "Expected income", body: "What Andrea expects each month after salary-loan deductions, from her salary and freelance work." },
  { id: "money-income-list", stage, route: ROUTES.moneyIncome, target: "money-income-list", title: "Income sources", body: "Each source has a payday. Budgie reminds her a week before money is due." },
  { id: "money-income-add", stage, route: ROUTES.moneyIncome, target: "money-income-add", title: "Add income", body: "Add a salary, allowance, or side income here. No need to add one now." },
  { id: "money-billers-tap", stage, route: ROUTES.moneyIncome, target: `hub-${ROUTES.moneyBillers}`, action: "tap", title: "Billers and Remittances", body: "Tap Billers and Remittances." },
  { id: "money-billers-total", stage, route: ROUTES.moneyBillers, target: "money-billers-total", title: "Due this month", body: "Rent, utilities, her phone plan, and the allowance she sends her parents, all scheduled." },
  { id: "money-billers-filters", stage, route: ROUTES.moneyBillers, target: "money-billers-filters", title: "Filter and open", body: "Filter by status, then open a biller to record a payment or turn on auto-post." },
];
