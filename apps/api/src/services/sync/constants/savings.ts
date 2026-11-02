export const SAVINGS_GOAL_FIELDS = new Set(["linked_account_id", "name", "goal_type", "target_amount_centavos", "starting_amount_centavos", "target_date", "priority", "emergency_fund_baseline_centavos", "auto_save_amount_centavos", "planned_contribution_amount_centavos", "contribution_frequency", "contribution_interval_count", "contribution_day_of_month", "contribution_second_day_of_month", "contribution_day_of_week", "custom_interval_days", "next_contribution_date", "interest_rate_bps", "notes", "emergency_fund_target_method", "essential_expense_coverage_months", "is_emergency_fund", "status", "archived_at"]);

export const SAVINGS_GOAL_ACTIVITY_FIELDS = new Set(["savings_goal_id", "transaction_id", "activity_kind", "amount_centavos", "activity_date", "notes"]);

export const SAVINGS_ALLOCATION_PREFERENCE_FIELDS = new Set(["strategy"]);

export const SAVINGS_GOAL_TYPES = ["emergency_fund", "custom"];

export const SAVINGS_GOAL_PRIORITIES = ["low", "medium", "high"];

export const SAVINGS_GOAL_CONTRIBUTION_FREQUENCIES = ["daily", "weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "yearly", "custom"];
