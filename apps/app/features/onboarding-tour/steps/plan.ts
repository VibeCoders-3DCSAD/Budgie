import { ROUTES } from "../../../routes";
import type { TourStepDef } from "../types";

const stage = "Financial Plan" as const;
const route = ROUTES.planBudgets;

export const planSteps: TourStepDef[] = [
  { id: "budget-tap", stage, route: ROUTES.planSavings, target: `hub-${ROUTES.planBudgets}`, action: "tap", title: "Budget", body: "Tap Budget." },
  { id: "plan-intro", stage, route, target: "plan-amount", title: "Create a Financial Plan", body: "Each month Budgie builds a plan from Andrea's balances, forecast, profile, bills, debts, and goals. First, how much to plan." },
  { id: "plan-history", stage, route, target: "plan-history", title: "Past plans", body: "Andrea accepted a plan in each of the last two months. Past plans shows each one next to what she actually spent." },
  { id: "plan-use-recommended", stage, route, target: "plan-use-recommended", action: "tap", title: "Use the recommended amount", body: "Tap Use this. It covers her commitments and her usual spending." },
  { id: "plan-food", stage, route, target: "plan-category-food", title: "Food and groceries", body: "Categories she spends on every month, like Food and Transport, are already ticked. Tap any category to add or remove it." },
  { id: "plan-subcategories", stage, route, target: "plan-expand-food", title: "Subcategories", body: "The arrow beside a category shows its subcategories, so she can budget just some of them instead of the whole category." },
  { id: "plan-continue", stage, route, target: "plan-continue", action: "tap", title: "Build the plan", body: "Tap Continue to Plan." },
  { id: "plan-summary", stage, route, target: "plan-summary", title: "The plan", body: "The money in the plan, what is reserved for commitments, and what each category gets." },
  { id: "plan-allocations", stage, route, target: "plan-allocations", title: "Category budgets", body: "Each category's budget, close to what she usually spends. She can adjust any of them." },
  { id: "plan-accept", stage, route, target: "plan-accept", action: "tap", title: "Accept the plan", body: "Tap Accept and save plan. In the tour this only changes Andrea's sample data." },
  { id: "plan-accepted", stage, route, target: "plan-summary", title: "Plan accepted", body: "Safe to Spend on the Dashboard now tracks this plan, and Financial Reports compares it with what she actually spends." },
];
