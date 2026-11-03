import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyFinancialCondition } from "../../lib/mlClient.js";
import { resolveEmergencyFundBalance } from "../savings/emergencyFundBalance.js";
import { loggableError } from "../../lib/errorLog.js";

type FinancialConditionAssessment = {
  id: string;
  assessed_at: string;
  rule_set_version: string;
  input_snapshot: Record<string, unknown>;
  output_snapshot: Record<string, unknown>;
};

type OnboardingAnswers = Record<string, unknown>;

function wholeNumber(answers: OnboardingAnswers, key: string) {
  const value = answers[key];
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;
}

function selfReportedRevolvingRange(answers: OnboardingAnswers) {
  const value = answers.credit_card_revolving_months;
  return typeof value === "string" && ["no_credit_card", "always_before_due", "1_to_11_months", "over_a_year"].includes(value)
    ? { self_reported_revolving_range: value }
    : {};
}

function onboardingAssessmentInput(answers: OnboardingAnswers) {
  const disposableIncome = wholeNumber(answers, "monthly_income");
  const essentialCosts = wholeNumber(answers, "monthly_essential_living_costs");
  const runwayMonths: Record<string, number> = { "1_month": 1, "2_months": 2, "3_months": 3, more_than_3_months: 3 };
  const months = typeof answers.emergency_savings_runway === "string" ? runwayMonths[answers.emergency_savings_runway] : undefined;
  // The capped 3+ response is enough to evaluate the three-month threshold.
  const emergencySavings = months !== undefined && essentialCosts !== null ? months * essentialCosts : null;
  const debtPercentage = wholeNumber(answers, "monthly_debt_payment_percentage");
  const debtPayments = answers.paying_off_debt === "false" ? 0 : disposableIncome !== null && debtPercentage !== null
    ? disposableIncome * debtPercentage / 100
    : null;

  return {
    classification_as_of: new Date().toISOString().slice(0, 10),
    liquid_emergency_savings: emergencySavings,
    average_monthly_recurring_essential_expenses: essentialCosts,
    // Income is already after deductions; subtract debt only when computing margin.
    monthly_disposable_income: disposableIncome,
    required_monthly_debt_payments: debtPayments,
    monthly_basic_living_costs: essentialCosts,
    credit_card_accounts: [],
    ...selfReportedRevolvingRange(answers),
    assessment_source: "onboarding_questionnaire",
  };
}

async function saveAssessment(userId: string, input: Record<string, unknown>, supabase: SupabaseClient): Promise<FinancialConditionAssessment | null> {
  const result = await classifyFinancialCondition(userId, input);
  if (!result.ok) {
    console.error("financial classification assessment failed", { user_id: userId, stage: "classify", reason: result.reason });
    return null;
  }

  const { data: assessment, error: insertError } = await supabase
    .from("financial_condition_assessments")
    .insert({ user_id: userId, rule_set_version: result.modelVersion, input_snapshot: input, output_snapshot: result.classification })
    .select("id, assessed_at, rule_set_version, input_snapshot, output_snapshot")
    .single();
  if (insertError || !assessment) {
    console.error("financial classification assessment failed", { user_id: userId, stage: "save", error: insertError ? loggableError(insertError) : "no row returned" });
    return null;
  }
  return assessment as FinancialConditionAssessment;
}

export async function createFinancialConditionAssessment(userId: string, supabase: SupabaseClient): Promise<FinancialConditionAssessment | null> {
  const { data: input, error } = await supabase.rpc("get_financial_classification_v2_input", { p_user_id: userId });
  if (error) {
    console.error("financial classification assessment failed", { user_id: userId, stage: "input", error: loggableError(error) });
    return null;
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    console.error("financial classification assessment failed", { user_id: userId, stage: "input", error: "input is not an object" });
    return null;
  }

  const emergencyFundBalance = await resolveEmergencyFundBalance(userId, supabase);
  const classificationInput = emergencyFundBalance === null
    ? input
    : { ...input, liquid_emergency_savings: emergencyFundBalance };

  // Amounts are personal financial data; log only whether each input is present.
  console.info("financial classification inputs", {
    user_id: userId,
    has_emergency_fund: emergencyFundBalance !== null,
    has_monthly_essential_expenses: classificationInput.average_monthly_recurring_essential_expenses != null,
  });

  // The ML service uses the onboarding self-report only when no card history exists,
  // so refreshes keep a credit-card result for users without recorded statements.
  const { data: onboarding } = await supabase
    .from("onboarding_sessions")
    .select("raw_answers")
    .eq("user_id", userId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const answers = onboarding?.raw_answers && typeof onboarding.raw_answers === "object" ? onboarding.raw_answers as OnboardingAnswers : {};

  return saveAssessment(userId, { ...classificationInput, ...selfReportedRevolvingRange(answers) }, supabase);
}

export function createOnboardingFinancialConditionAssessment(userId: string, answers: OnboardingAnswers, supabase: SupabaseClient) {
  return saveAssessment(userId, onboardingAssessmentInput(answers), supabase);
}
