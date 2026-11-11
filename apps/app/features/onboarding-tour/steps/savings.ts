import { ROUTES } from "../../../routes";
import { GOAL_IDS } from "../practice/seed/savings";
import type { TourStepDef } from "../types";

const stage = "Savings" as const;
const route = ROUTES.planSavings;

export const savingsSteps: TourStepDef[] = [
  { id: "savings-tap", stage, route: ROUTES.planDebts, target: `hub-${ROUTES.planSavings}`, action: "tap", title: "Savings Goals", body: "Tap Savings Goals." },
  { id: "savings-total", stage, route, target: "savings-total", title: "Saved so far", body: "Everything Andrea has set aside across her goals, against what she is aiming for." },
  { id: "savings-allocation", stage, route, target: "savings-allocation", title: "Where extra savings go", body: "When there is money left over, Budgie suggests how to split it between goals. She can change the strategy here." },
  { id: "savings-add", stage, route, target: "savings-add", title: "Your goals", body: "An emergency fund, a house deposit, and a Japan trip. Add goal sets a target, a date, and a monthly contribution." },
  { id: "savings-open-goal", stage, route, target: `savings-goal-${GOAL_IDS.house}`, action: "tap", title: "Open a goal", body: "Tap House deposit." },
  { id: "goal-progress", stage, route, target: "goal-progress", title: "Progress", body: "How much is saved, how far to go, and the target date." },
  { id: "goal-actions", stage, route, target: "goal-actions", title: "Add money or withdraw", body: "These open Add Transaction with This is a savings contribution already on, so the goal and its account stay in step." },
  { id: "goal-details", stage, route, target: "goal-details", title: "Details", body: "The linked account, priority, and the next scheduled contribution. Budgie reminds her a week before it is due." },
  { id: "goal-forecast", stage, route, target: "goal-forecast", title: "When she will get there", body: "At her current pace, Budgie projects when the goal will be reached." },
  { id: "goal-activity", stage, route, target: "goal-activity", title: "Activity", body: "Every contribution and withdrawal. Tap one to open its transaction." },
];
