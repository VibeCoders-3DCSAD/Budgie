import { ROUTES } from "../../../routes";
import type { TourStepDef } from "../types";

const stage = "Money" as const;

export const moneySteps: TourStepDef[] = [
  { id: "money-tap", stage, target: "tab-money", action: "tap", title: "Open Money", body: "Tap Money to see Andrea's accounts, income, and bills." },
  { id: "money-accounts-total", stage, route: ROUTES.moneyAccounts, target: "money-accounts-total", title: "Accounts", body: "Her cash position across every account. Savings accounts and credit cards are kept apart from spending money." },
  { id: "money-accounts-add", stage, route: ROUTES.moneyAccounts, target: "money-accounts-add", title: "Add an account", body: "Add a bank, e-wallet, cash, savings, or credit card account here. No need to add one now." },
  { id: "money-accounts-list", stage, route: ROUTES.moneyAccounts, target: "money-accounts-list", title: "Each account", body: "Payroll, GCash, savings, and a credit card, each with its balance." },
  { id: "money-accounts-open", stage, route: ROUTES.moneyAccounts, target: "money-accounts-first", action: "tap", title: "Account actions", body: "Tap the highlighted account to see what you can do with it." },
  { id: "money-accounts-menu", stage, route: ROUTES.moneyAccounts, target: "money-accounts-menu", title: "Edit or delete", body: "Edit changes the account's details. Delete removes it after you confirm. Next closes this." },
  { id: "money-income-tap", stage, route: ROUTES.moneyAccounts, target: `hub-${ROUTES.moneyIncome}`, action: "tap", title: "Income", body: "Tap Income." },
  { id: "money-income-total", stage, route: ROUTES.moneyIncome, target: "money-income-total", title: "Expected income", body: "What Andrea expects each month after salary-loan deductions, from her salary and freelance work." },
  { id: "money-income-add", stage, route: ROUTES.moneyIncome, target: "money-income-add", title: "Add income", body: "Add a salary, allowance, or side income here. No need to add one now." },
  { id: "money-income-list", stage, route: ROUTES.moneyIncome, target: "money-income-list", title: "Income sources", body: "Each source has a payday. Budgie reminds her a week before money is due." },
  { id: "money-income-open", stage, route: ROUTES.moneyIncome, target: "money-income-first", action: "tap", title: "Income actions", body: "Tap the highlighted income source to see what you can do with it." },
  { id: "money-income-menu", stage, route: ROUTES.moneyIncome, target: "money-income-menu", title: "Edit or delete", body: "Edit changes the amount or payday. Delete removes the source after you confirm; past transactions stay. Next closes this." },
  { id: "money-billers-tap", stage, route: ROUTES.moneyIncome, target: `hub-${ROUTES.moneyBillers}`, action: "tap", title: "Billers and Remittances", body: "Tap Billers and Remittances." },
  { id: "money-billers-total", stage, route: ROUTES.moneyBillers, target: "money-billers-total", title: "Due this month", body: "Rent, utilities, her phone plan, and the allowance she sends her parents, all scheduled." },
  { id: "money-billers-filters", stage, route: ROUTES.moneyBillers, target: "money-billers-filters", title: "Filter and open", body: "Filter by status, then open a biller to record a payment or turn on auto-post." },
];
