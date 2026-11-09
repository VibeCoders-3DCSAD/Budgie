import { ROUTES } from "../../../routes";
import type { TourStepDef } from "../types";

const stage = "Settings" as const;
const route = ROUTES.settings;

export const settingsSteps: TourStepDef[] = [
  { id: "settings-tap", stage, route: ROUTES.dashboard, target: "topbar-settings", action: "tap", title: "Settings", body: "Tap the profile icon." },
  { id: "settings-account", stage, route, target: "settings-account", title: "Account", body: "Your profile, password, and seasonal preferences like school fees or holidays." },
  { id: "settings-categories", stage, route, target: "settings-categories", action: "tap", title: "Categories", body: "Tap Categories." },
  { id: "taxonomy", stage, route: ROUTES.categories, target: "taxonomy-create", title: "Your categories", body: "Income and expense categories, with essentials and non-essentials. Create your own or add subcategories here." },
  { id: "settings-glossary", stage, route, target: "settings-glossary", action: "tap", title: "Definition of terms", body: "Tap Definition of terms." },
  { id: "glossary", stage, route: ROUTES.glossary, target: "glossary-toolbar", title: "Plain-language definitions", body: "Look up any finance word in English or Filipino. The (i) buttons around the app open the same definitions." },
  { id: "settings-terms", stage, route, target: "settings-terms", title: "Terms & Conditions", body: "Read the terms you agreed to, any time." },
  { id: "settings-export", stage, route, target: "settings-export", title: "Export and delete", body: "Download your data as a CSV, or request account deletion below. Both need a connection and are off during the tour." },
  { id: "settings-account-actions", stage, route, target: "settings-account-actions", title: "Lock and log out", body: "Lock keeps Budgie closed until your PIN. Log out is turned off during the tour." },
];
