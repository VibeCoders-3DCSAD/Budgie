import { ROUTES } from "../../../routes";
import { manilaToday } from "../../../lib/dates";
import { transactionFormHref } from "../../ledger/transactionFormRoute";
import { practiceId } from "../practice/seed/context";
import type { TourStepDef } from "../types";

const stage = "Transactions" as const;

// This month's first salary is always on record, so editing it never opens a missing transaction.
const editSalary = () => transactionFormHref({ kind: "edit", transactionId: practiceId(`transaction:salary:${manilaToday().slice(0, 7)}-01:1`) });

export const transactionSteps: TourStepDef[] = [
  { id: "activity-tap", stage, target: "tab-activity", action: "tap", title: "Open Activity", body: "Tap Activity to see every transaction." },
  { id: "activity-search", stage, route: ROUTES.activity, target: "activity-search", title: "Search and filter", body: "Find a transaction by name, or filter by type, category, account, or date." },
  { id: "activity-totals", stage, route: ROUTES.activity, target: "activity-totals", title: "Totals", body: "Income and expenses for whatever the filters show." },
  { id: "activity-day", stage, route: ROUTES.activity, target: "activity-first-day", title: "Each transaction", body: "Transactions are grouped by day. The ⋮ menu on a row edits or deletes it." },
  { id: "add-tap", stage, route: ROUTES.activity, target: "tab-add", action: "tap", title: "Add a transaction", body: "Tap + to open the form." },
  { id: "form-amount", stage, route: ROUTES.transactionForm, target: "form-amount", title: "Amount", body: "Type the amount, or use a quick amount below." },
  { id: "form-details", stage, route: ROUTES.transactionForm, target: "form-details", title: "Type and account", body: "Choose expense, income, or transfer, then the date and the account the money moves through." },
  { id: "form-savings", stage, route: ROUTES.transactionForm, target: "form-savings", title: "This is a savings contribution", body: "Turn this on when the money goes to a savings goal. It moves to the goal's account and counts towards the goal." },
  { id: "form-debt", stage, route: ROUTES.transactionForm, target: "form-debt", title: "This is a debt payment", body: "Turn this on to pay a loan. The payment lowers the loan's balance and shows in its history." },
  { id: "form-category", stage, route: ROUTES.transactionForm, target: "form-category", title: "Category", body: "Pick a category so reports and the Financial Plan know what the money was for." },
  { id: "form-save", stage, route: ROUTES.transactionForm, target: "form-save", title: "Save", body: "Saving records the transaction and updates balances. In the tour, nothing is saved to your own records." },
  { id: "edit", stage, route: editSalary, target: "form-amount", title: "Edit a transaction", body: "Editing opens the same form with the saved details. Change anything, then Save Changes." },
  { id: "delete", stage, route: ROUTES.activity, target: "activity-first-day", title: "Delete a transaction", body: "Choose Delete from a row's ⋮ menu. Budgie explains what changes and asks you to confirm before anything is removed." },
];
