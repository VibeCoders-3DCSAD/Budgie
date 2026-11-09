import { ROUTES } from "../../../routes";
import { TOUR_MESSAGES } from "../messages";
import type { TourStepDef } from "../types";

const stage = "Dashboard" as const;
const route = ROUTES.dashboard;

export const dashboardSteps: TourStepDef[] = [
  { id: "welcome", stage, route, title: "Meet Andrea", body: `This tour uses Andrea's sample finances so you can explore freely. ${TOUR_MESSAGES.practice}` },
  { id: "dash-balance", stage, route, target: "dash-balance", title: "Available balance", body: "All the money in Andrea's cash, bank, and e-wallet accounts, in one number." },
  { id: "dash-income-expense", stage, route, target: "dash-income-expense", title: "This month's income and expenses", body: "What came in and went out this month, compared with last month." },
  { id: "dash-attention", stage, route, target: "dash-attention", title: "Needs Attention & Upcoming", body: "Reminders start seven days before income, debt payments, savings contributions, and card due dates. Bills that could not auto-post appear here too." },
  { id: "dash-cashflow", stage, route, target: "dash-cashflow", title: "Cash flow", body: "Income minus expenses this month. Tap the (i) beside any finance word for a plain-language definition." },
  { id: "dash-profile", stage, route, target: "dash-profile", title: "Savings & Debt Profile", body: "How well Andrea's emergency fund, debt payments, and spare money are doing. It feeds her Financial Plan." },
  { id: "dash-trends", stage, route, target: "dash-trends", title: "Trends", body: "Her balance and spending day by day, so a big week stands out." },
  { id: "dash-spending", stage, route, target: "dash-spending", title: "Where the money goes", body: "Spending by category this month. View all opens the full breakdown." },
  { id: "dash-recent", stage, route, target: "dash-recent", title: "Recent transactions", body: "The latest income and expenses. View all opens Activity." },
  { id: "dash-safe-to-spend", stage, route, target: "dash-safe-to-spend", title: "Safe to Spend", body: "What is left in each budget of her accepted Financial Plan, so she knows how much she can still spend." },
  { id: "dash-tabs", stage, route, target: "tab-dashboard", title: "Getting around", body: "Home, Money, Activity, and Plan are always at the bottom. The + button records a transaction from anywhere." },
];
