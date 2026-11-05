export const SAVINGS_GOAL_PRIORITIES = ["low", "medium", "high"] as const;
export const SAVINGS_GOAL_STATUSES = ["active", "archived", "deleted"] as const;
export const EMERGENCY_FUND_TARGET_METHODS = ["fixed_amount", "essential_expense_coverage"] as const;
export const SAVINGS_ACTIVITY_KINDS = ["contribution", "withdrawal"] as const;

export type SavingsGoalPriority = typeof SAVINGS_GOAL_PRIORITIES[number];
export type SavingsGoalStatus = typeof SAVINGS_GOAL_STATUSES[number];
export type EmergencyFundTargetMethod = typeof EMERGENCY_FUND_TARGET_METHODS[number];
export type SavingsActivityKind = typeof SAVINGS_ACTIVITY_KINDS[number];

export type SavingsActivity = {
  id: string;
  savingsGoalId: string;
  transactionId: string;
  kind: SavingsActivityKind;
  amountCentavos: number;
  activityDate: string;
  notes: string | null;
  version: number;
};

export type SavingsGoalProgress = {
  currentAmountCentavos: number;
  remainingAmountCentavos: number;
  progressPercent: number;
  isAchieved: boolean;
  contributionShortfallCentavos: number;
};
