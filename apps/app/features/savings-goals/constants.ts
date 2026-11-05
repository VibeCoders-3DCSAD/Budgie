import { SAVINGS_GOAL_PRIORITIES, type SavingsGoalPriority } from "./types";

export { SAVINGS_GOAL_PRIORITIES };
export type { SavingsGoalPriority };

// A savings goal is either the Emergency Fund or a general goal.
export function savingsGoalKindLabel(isEmergencyFund: boolean): string {
  return isEmergencyFund ? "Emergency Fund" : "General";
}

export const SAVINGS_GOAL_PRIORITY_LABELS: Record<SavingsGoalPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const SAVINGS_GOAL_PLACEHOLDERS = {
  name: "e.g. New laptop",
  targetAmount: "0.00",
  startingAmount: "0.00",
  targetDate: "YYYY-MM-DD",
};
