import { ROUTES } from "../../../routes";
import type { TourStepDef } from "../types";

const stage = "Transactions" as const;
const form = ROUTES.transactionForm;

export const transactionSteps: TourStepDef[] = [
  { id: "activity-tap", stage, target: "tab-activity", action: "tap", title: "Open Activity", body: "Tap Activity to see every transaction." },
  { id: "activity-search", stage, route: ROUTES.activity, target: "activity-search", title: "Search and filter", body: "Find a transaction by name, or filter by type, category, account, or date." },
  { id: "activity-totals", stage, route: ROUTES.activity, target: "activity-totals", title: "Totals", body: "Income and expenses for whatever the filters show." },
  { id: "activity-day", stage, route: ROUTES.activity, target: "activity-first-day", title: "Each transaction", body: "Transactions are grouped by day, newest first." },
  { id: "add-tap", stage, route: ROUTES.activity, target: "tab-add", action: "tap", title: "Add a transaction", body: "Tap + to open the form." },
  { id: "form-amount", stage, route: form, target: "form-amount", action: "fill", title: "Amount", body: "Type how much Andrea spent, like 150, then tap Next." },
  { id: "form-details", stage, route: form, target: "form-details", action: "fill", title: "Type and account", body: "Keep Expense, add a description like Lunch, and choose the account she paid from. Then tap Next." },
  { id: "form-savings", stage, route: form, target: "form-savings", title: "This is a savings contribution", body: "Turn this on when the money goes to a savings goal. It moves to the goal's account and counts towards the goal." },
  { id: "form-debt", stage, route: form, target: "form-debt", title: "This is a debt payment", body: "Turn this on to pay a loan. The payment lowers the loan's balance and shows in its history." },
  { id: "form-category", stage, route: form, target: "form-category", action: "fill", title: "Category", body: "Tap Category and pick one, like Food, so reports and the Financial Plan know what the money was for. Then tap Next." },
  { id: "form-save", stage, route: form, target: "form-save", action: "fill", until: "transaction-created", title: "Save", body: "Tap Save to record it and update her balances. In the tour, nothing is saved to your own records." },
  { id: "activity-kebab", stage, route: ROUTES.activity, target: "activity-kebab", action: "tap", title: "Transaction actions", body: "Tap ⋮ on a transaction." },
  { id: "activity-menu", stage, route: ROUTES.activity, target: "activity-kebab-menu", title: "Edit or delete", body: "Edit opens the same form with the saved details. Delete explains what changes and asks you to confirm before anything is removed. Next closes this." },
];
