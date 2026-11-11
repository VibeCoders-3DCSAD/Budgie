import { ROUTES } from "../../../routes";
import type { TourStepDef } from "../types";

const stage = "Offline & Sync" as const;
const route = ROUTES.settings;

export const syncSteps: TourStepDef[] = [
  { id: "sync-status", stage, route, target: "settings-sync", title: "Works offline", body: "Accounts, transactions, savings, debts, and your accepted plan can be viewed and changed without a connection. Changes wait on this phone until they sync." },
  { id: "sync-states", stage, route, target: "settings-sync", title: "Sync status", body: "Offline, Pending changes, Syncing, Up to date, or Sync failed. Tap here to sync now or retry, and to see what is waiting." },
  { id: "sync-online-only", stage, route, target: "header-sync", title: "Online-only actions", body: "Refreshing forecasts, exporting data, and deleting your account need a connection. Unsynced changes must sync before you log out." },
];
