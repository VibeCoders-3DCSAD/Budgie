import { SEASON_PRESETS } from "@odin/spending-insights/seasons";
import type { Classification } from "../dashboard/components/FinancialHealthCard";

export type OnboardingSession = {
  id: string;
  user_id: string;
  status: "not_started" | "in_progress" | "submitted" | "abandoned" | "superseded";
  started_at: string;
  submitted_at: string | null;
  current_step_key: string | null;
  raw_answers: Record<string, unknown>;
};

export type StepKind = "card_select" | "card_multi_select" | "dropdown" | "input" | "amount_list" | "review" | "result";

export type StepOption = {
  key: string;
  label: string;
  description?: string;
};

export type StepConfig = {
  key: string;
  title: string;
  subtitle?: string;
  kind: StepKind;
  questionKey: string;
  options?: StepOption[];
  inputPlaceholder?: string;
  inputLabel?: string;
  inputSuffix?: string;
  allowUnknown?: boolean;
  amountSourceKey?: string;
  amountOptions?: StepOption[];
  visibleWhen?: { questionKey: string; value: string | readonly string[] };
};

export const EXPENSE_SEASON_OPTIONS: StepOption[] = [
  ...SEASON_PRESETS.map(({ key, label, window }) => ({ key, label, description: window })),
  { key: "none", label: "No Particular Higher-Expense Season" },
];

export const STEPS: StepConfig[] = [
  {
    key: "display_name",
    title: "What should we call you?",
    kind: "input",
    questionKey: "display_name",
    inputPlaceholder: "Your name",
  },
  {
    key: "monthly_income",
    title: "Monthly Income After Deductions",
    subtitle: "Enter your monthly income after tax, government contributions, and other non-debt deductions, but before loan or credit-card repayments.",
    kind: "input",
    questionKey: "monthly_income",
    inputLabel: "Average Monthly Income After Deductions",
    inputSuffix: "₱",
  },
  {
    key: "emergency_savings_runway",
    title: "Savings Runway",
    subtitle: "If your income stopped today, about how long could your available savings cover your essential needs?",
    kind: "card_select",
    questionKey: "emergency_savings_runway",
    options: [
      { key: "1_month", label: "1 month" },
      { key: "2_months", label: "2 months" },
      { key: "3_months", label: "3 months" },
      { key: "more_than_3_months", label: "3+ months" },
      { key: "not_sure", label: "Not sure" },
    ],
  },
  {
    key: "monthly_essential_living_costs",
    title: "Essential Living Costs",
    subtitle: "Include essentials such as food, housing, utilities, transport, medicine, and necessary care.",
    kind: "input",
    questionKey: "monthly_essential_living_costs",
    inputLabel: "Estimated Monthly Essential Costs",
    inputSuffix: "₱",
    allowUnknown: true,
  },
  {
    key: "paying_off_debt",
    title: "Current Debt",
    subtitle: "Are you currently paying off any debt?",
    kind: "card_select",
    questionKey: "paying_off_debt",
    options: [
      { key: "true", label: "Yes" },
      { key: "false", label: "No" },
    ],
  },
  {
    key: "monthly_debt_payment_percentage",
    title: "Debt Payment Percentage",
    subtitle: "What percentage of that income after deductions goes to required debt payments, including payroll-deducted loans and credit-card minimums?",
    kind: "input",
    questionKey: "monthly_debt_payment_percentage",
    inputLabel: "Percentage of Monthly Income",
    inputSuffix: "%",
    allowUnknown: true,
    visibleWhen: { questionKey: "paying_off_debt", value: "true" },
  },
  {
    key: "credit_card_payment_behavior",
    title: "Credit Card Payments",
    subtitle: "How long have you carried an unpaid credit-card balance after the due date?",
    kind: "card_select",
    questionKey: "credit_card_revolving_months",
    options: [
      { key: "no_credit_card", label: "I don't use a credit card" },
      { key: "always_before_due", label: "I always pay on or before the due date" },
      { key: "1_to_11_months", label: "1-11 months" },
      { key: "over_a_year", label: "Over a year" },
    ],
  },
  {
    key: "high_expense_seasons",
    title: "Higher-Expense Seasons",
    subtitle: "When are your expenses usually higher? Select all that apply.",
    kind: "card_multi_select",
    questionKey: "high_expense_seasons",
    options: EXPENSE_SEASON_OPTIONS,
  },
  {
    key: "low_expense_seasons",
    title: "Lower-Expense Seasons",
    subtitle: "When are your expenses usually lower? Select all that apply. Seasons you selected for higher expenses are excluded.",
    kind: "card_multi_select",
    questionKey: "low_expense_seasons",
    options: EXPENSE_SEASON_OPTIONS.map((option) => option.key === "none" ? { ...option, label: "No Particular Lower-Expense Season" } : option),
  },
  {
    key: "saving_seasons",
    title: "Savings Seasons",
    subtitle: "What seasons are more likely for you to save? Select all that apply.",
    kind: "card_multi_select",
    questionKey: "saving_seasons",
    options: EXPENSE_SEASON_OPTIONS.map((option) => option.key === "none" ? { ...option, label: "No Particular Savings Season" } : option),
  },
  {
    key: "review",
    title: "Review Your Profile",
    subtitle: "Review your answers before submitting.",
    kind: "review",
    questionKey: "_review",
  },
];

export type SubmitResult = {
  classification_available: boolean;
  assessment?: { output_snapshot?: Classification } | null;
};
