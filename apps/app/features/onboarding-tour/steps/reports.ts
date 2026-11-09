import { ROUTES } from "../../../routes";
import type { TourStepDef } from "../types";

const stage = "Financial Reports" as const;
const route = ROUTES.financialReports;

export const reportSteps: TourStepDef[] = [
  { id: "reports-tap", stage, route: ROUTES.dashboard, target: "topbar-reports", action: "tap", title: "Financial Reports", body: "Tap the chart icon at the top." },
  { id: "reports-period", stage, route, target: "reports-period", title: "Reporting period", body: "Switch between this month, last month, and longer periods." },
  { id: "reports-distribution", stage, route, target: "reports-distribution", title: "Where money went", body: "Cash outflow by category for the period." },
  { id: "reports-forecast-actual", stage, route, target: "reports-forecast-actual", title: "Forecast versus actual", body: "Last month's forecast next to what she really spent." },
  { id: "reports-budget-actual", stage, route, target: "reports-budget-actual", title: "Plan versus actual", body: "Each budget in her accepted plan against actual spending." },
  { id: "reports-outlook", stage, route, target: "reports-outlook", title: "Spending outlook", body: "Monthly and quarterly forecasts. Refreshing them needs a connection; the last forecast stays available offline." },
  { id: "reports-unusual", stage, route, target: "reports-unusual", title: "Unusual spending", body: "Purchases well above her usual, like the air fryer. She can mark one as one-time, frequent, or yearly." },
];
