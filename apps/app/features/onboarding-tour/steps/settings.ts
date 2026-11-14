import { ROUTES } from "../../../routes";
import type { TourStepDef } from "../types";

const stage = "Settings" as const;
const route = ROUTES.settings;

// In the order they sit on the page; Replay tutorial comes last, in the next stage.
export const settingsSteps: TourStepDef[] = [
  { id: "settings-tap", stage, route: ROUTES.planBudgets, target: "topbar-settings", action: "tap", title: "Settings", body: "Tap the profile icon at the top." },
  { id: "settings-account", stage, route, target: "settings-account", title: "Account", body: "Your profile, password, and seasonal preferences like school fees or holidays." },
  { id: "settings-categories", stage, route, target: "settings-categories", action: "tap", title: "Categories", body: "Tap Categories." },
  { id: "taxonomy", stage, route: ROUTES.categories, target: "taxonomy-create", title: "Your categories", body: "Income and expense categories, with essentials and non-essentials. Create your own or add subcategories here." },
  { id: "categories-back", stage, route: ROUTES.categories, target: "header-back", action: "tap", title: "Back to Settings", body: "Tap back to return to Settings." },
  { id: "settings-glossary", stage, route, target: "settings-glossary", action: "tap", title: "Definition of terms", body: "Tap Definition of terms." },
  { id: "glossary", stage, route: ROUTES.glossary, target: "glossary-toolbar", title: "Plain-language definitions", body: "Look up any finance word in English or Filipino. The (i) buttons around the app open the same definitions." },
  { id: "glossary-back", stage, route: ROUTES.glossary, target: "header-back", action: "tap", title: "Back to Settings", body: "Tap back to return to Settings." },
  { id: "sync-status", stage, route, target: "settings-sync", title: "Works offline", body: "Accounts, transactions, savings, debts, and your accepted plan can be viewed and changed without a connection. Changes wait on this phone until they sync." },
  { id: "sync-states", stage, route, target: "settings-sync", title: "Sync status", body: "Offline, Pending changes, Syncing, Up to date, or Sync failed. Tap here to sync now or retry, and to see what is waiting." },
  { id: "settings-terms", stage, route, target: "settings-terms", title: "Terms & Conditions", body: "Read the terms you agreed to, any time." },
  { id: "settings-export", stage, route, target: "settings-export", title: "Export and delete", body: "Download your data as a CSV, or request account deletion below. Like refreshing forecasts, both need a connection. They are off during the tour." },
  { id: "settings-account-actions", stage, route, target: "settings-account-actions", title: "Lock and log out", body: "Lock keeps Budgie closed until your PIN. Unsynced changes must sync before you log out. Log out is turned off during the tour." },
];
