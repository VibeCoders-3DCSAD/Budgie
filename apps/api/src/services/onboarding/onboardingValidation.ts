import { CUSTOM_EVENT_ID } from "@odin/spending-insights/seasons.js";
import { SEASON_ANSWER_KEYS, validateSeasonalAnswers } from "./seasonalAnswers.js";

const ONBOARDING_ANSWER_KEYS = new Set([
  "questionnaire_version", "monthly_income", "emergency_savings_runway", "monthly_essential_living_costs",
  "paying_off_debt", "monthly_debt_payment_percentage", "credit_card_revolving_months",
  "high_expense_seasons", "low_expense_seasons", "saving_seasons", "custom_seasonal_events",
]);

const ARRAY_ANSWER_KEYS = new Set(["high_expense_seasons", "low_expense_seasons", "saving_seasons"]);
const STRING_ANSWER_KEYS = new Set([...ONBOARDING_ANSWER_KEYS].filter((key) => !ARRAY_ANSWER_KEYS.has(key) && key !== "custom_seasonal_events"));
const ANSWER_OPTIONS: Record<string, readonly string[]> = {
  questionnaire_version: ["2"],
  emergency_savings_runway: ["1_month", "2_months", "3_months", "more_than_3_months", "not_sure"],
  paying_off_debt: ["true", "false"],
  credit_card_revolving_months: ["no_credit_card", "always_before_due", "1_to_11_months", "over_a_year"],
  high_expense_seasons: SEASON_ANSWER_KEYS,
  low_expense_seasons: SEASON_ANSWER_KEYS,
  saving_seasons: SEASON_ANSWER_KEYS,
};
const WHOLE_NUMBER_OR_NOT_SURE_KEYS = ["monthly_essential_living_costs", "monthly_debt_payment_percentage"];

const REQUIRED_SUBMIT_FIELDS = [
  "monthly_income",
  "emergency_savings_runway",
  "monthly_essential_living_costs",
  "paying_off_debt",
  "credit_card_revolving_months",
  "high_expense_seasons",
  "low_expense_seasons",
  "saving_seasons",
];

export type SubmissionError = { message: string; fields: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Whole pesos whose centavo value still fits in a safe integer.
function isWholeNumberString(value: string): boolean {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number.isSafeInteger(Number(value) * 100);
}

function isAllowedSeason(options: readonly string[], item: string): boolean {
  return options.includes(item) || (options === SEASON_ANSWER_KEYS && CUSTOM_EVENT_ID.test(item));
}

function answerValueError(key: string, value: unknown): string | null {
  if (!ONBOARDING_ANSWER_KEYS.has(key)) return `Unsupported onboarding answer: ${key}.`;
  if (ARRAY_ANSWER_KEYS.has(key) && (!Array.isArray(value) || value.some((item) => typeof item !== "string"))) {
    return `${key} must be an array of strings.`;
  }
  if (STRING_ANSWER_KEYS.has(key) && typeof value !== "string") return `${key} must be a string.`;

  const options = ANSWER_OPTIONS[key];
  if (options && typeof value === "string" && value !== "" && !options.includes(value)) return `Invalid ${key}.`;
  if (options && Array.isArray(value) && value.some((item) => !isAllowedSeason(options, item))) return `Invalid ${key}.`;

  if (typeof value !== "string" || value === "") return null;
  if (key === "monthly_income" && !isWholeNumberString(value)) return `${key} must be a non-negative whole number.`;
  if (WHOLE_NUMBER_OR_NOT_SURE_KEYS.includes(key) && value !== "not_sure" && !isWholeNumberString(value)) {
    return `${key} must be a non-negative whole number or not_sure.`;
  }
  if (key === "monthly_debt_payment_percentage" && value !== "not_sure" && Number(value) > 100) {
    return "Debt payment percentage must be between 0 and 100, or not_sure.";
  }
  return null;
}

function seasonCombinationError(answers: Record<string, unknown>): string | null {
  for (const key of ARRAY_ANSWER_KEYS) {
    const selections = answers[key];
    if (Array.isArray(selections) && selections.includes("none") && selections.length > 1) return `${key} cannot combine none with other seasons.`;
  }
  const higher = answers.high_expense_seasons;
  const lower = answers.low_expense_seasons;
  if (Array.isArray(higher) && Array.isArray(lower) && lower.some((season) => season !== "none" && higher.includes(season))) {
    return "A season cannot be selected for both higher and lower expenses.";
  }
  return null;
}

// checkReferences=false skips the custom-event check, for a partial update that may not carry the events yet.
export function validateOnboardingPayload(
  rawAnswers: unknown,
  currentStepKey: unknown,
  checkReferences = true,
): string | null {
  if (rawAnswers !== undefined && !isPlainObject(rawAnswers)) {
    return "raw_answers must be a plain object when provided.";
  }
  if (isPlainObject(rawAnswers)) {
    for (const [key, value] of Object.entries(rawAnswers)) {
      const error = answerValueError(key, value);
      if (error) return error;
    }
    const seasonalError = validateSeasonalAnswers(rawAnswers, checkReferences) ?? seasonCombinationError(rawAnswers);
    if (seasonalError) return seasonalError;
  }
  if (currentStepKey !== undefined && currentStepKey !== null && typeof currentStepKey !== "string") {
    return "current_step_key must be a string when provided.";
  }
  return null;
}

// Answers a session needs before it can be submitted.
export function onboardingSubmissionError(answers: Record<string, unknown>): SubmissionError | null {
  const missing = REQUIRED_SUBMIT_FIELDS.filter((field) => {
    const value = answers[field];
    if (ARRAY_ANSWER_KEYS.has(field)) return !Array.isArray(value) || value.length === 0;
    return typeof value !== "string" || value === "";
  });
  if (missing.length > 0) {
    return {
      message: "Onboarding questionnaire is incomplete. Please complete all required steps before submitting.",
      fields: missing,
    };
  }
  const debtPercentage = answers.monthly_debt_payment_percentage;
  if (answers.paying_off_debt === "true" && (typeof debtPercentage !== "string" || debtPercentage === "")) {
    return { message: "Enter the percentage of monthly income allocated to debt.", fields: ["monthly_debt_payment_percentage"] };
  }
  return null;
}
