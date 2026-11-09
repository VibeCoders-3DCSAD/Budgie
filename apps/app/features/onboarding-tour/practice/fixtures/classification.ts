import type { Classification } from "../../../dashboard/components/FinancialHealthCard";
import { ACCOUNT_IDS } from "../seed/accounts";
import { monthlySpendBySubcategory, type PracticeData } from "./practiceData";

// Andrea's Savings & Debt Profile, worked out from the practice data the way the server's rules read it.
export function practiceAssessment(data: PracticeData): Classification {
  const monthlyIncome = data.seed.income_sources.reduce((sum, source) => sum + Number(source.expected_amount_centavos) * (source.frequency === "semi_monthly" ? 2 : 1), 0);
  const monthlyDebt = data.seed.debt_accounts.reduce((sum, debt) => sum + Number(debt.minimum_payment_centavos), 0);
  const monthlyExpenses = [...monthlySpendBySubcategory(data).values()].reduce((sum, amount) => sum + amount, 0);
  const emergency = data.seed.financial_accounts.find((account) => account.id === ACCOUNT_IDS.emergency);
  const essential = data.seed.savings_goals.find((goal) => goal.is_emergency_fund)?.emergency_fund_baseline_centavos;
  const monthsCovered = Number(emergency?.current_balance_centavos ?? 0) / Math.max(1, Number(essential ?? monthlyExpenses));
  const margin = (monthlyIncome - monthlyExpenses - monthlyDebt) / 100;
  return {
    emergency_savings: { status: "SUCCESS", label: monthsCovered >= 6 ? "EMERGENCY_FUND_ADEQUATE" : "EMERGENCY_FUND_INADEQUATE", value: Math.round(monthsCovered * 10) / 10 },
    debt_burden: { status: "SUCCESS", label: monthlyDebt / monthlyIncome > 0.4 ? "FINANCIALLY_OVERBURDENED" : "NOT_OVERBURDENED", value: Math.round(monthlyDebt / monthlyIncome * 100) / 100 },
    financial_margin: { status: "SUCCESS", label: margin < 0 ? "NEGATIVE_FINANCIAL_MARGIN" : "POSITIVE_FINANCIAL_MARGIN", value: Math.round(margin) },
    credit_card_behavior: [{ status: "SUCCESS", label: "TRANSACTOR", account_id: ACCOUNT_IDS.card, source: "observed_history" }],
  };
}

// The /financial-classification/v2 body: an assessment wrapping the snapshot.
export function practiceAssessmentBody(data: PracticeData) {
  return { assessment: { id: "practice-assessment", assessed_at: `${data.today}T00:00:00.000Z`, output_snapshot: practiceAssessment(data) } };
}
