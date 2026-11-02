jest.mock("../../../lib/mlClient.js", () => ({ classifyFinancialCondition: jest.fn() }));

import { classifyFinancialCondition } from "../../../lib/mlClient.js";
import { createFinancialConditionAssessment, createOnboardingFinancialConditionAssessment } from "../../../services/classification/financialConditionAssessmentService.js";

const mockClassify = classifyFinancialCondition as jest.Mock;

const answers = {
  monthly_income: "50000",
  monthly_essential_living_costs: "30000",
  paying_off_debt: "false",
};

async function submittedInput(cardAnswers: Record<string, string>) {
  mockClassify.mockResolvedValue({ ok: false, reason: "not_configured" });
  await createOnboardingFinancialConditionAssessment("user-1", { ...answers, ...cardAnswers }, {} as never);
  return mockClassify.mock.calls[0]![1] as Record<string, unknown>;
}

describe("onboarding financial condition assessment", () => {
  beforeEach(() => mockClassify.mockReset());
  it.each(["no_credit_card", "always_before_due", "1_to_11_months", "over_a_year"])("preserves the %s response without inventing an exact month count", async (range) => {
    const input = await submittedInput({ credit_card_revolving_months: range });
    expect(input.self_reported_revolving_range).toBe(range);
    expect(input).not.toHaveProperty("self_reported_revolving_months");
  });

  it("uses take-home income and the declared debt percentage without deducting old amounts again", async () => {
    const input = await submittedInput({ monthly_income: "40000", paying_off_debt: "true", monthly_debt_payment_percentage: "25", emergency_savings_runway: "2_months" });
    expect(input).toMatchObject({ monthly_disposable_income: 40000, required_monthly_debt_payments: 10000, liquid_emergency_savings: 60000 });
  });

  it("preserves unknown values as missing inputs instead of zero", async () => {
    const input = await submittedInput({ paying_off_debt: "true", monthly_debt_payment_percentage: "not_sure", monthly_essential_living_costs: "not_sure", emergency_savings_runway: "not_sure" });
    expect(input).toMatchObject({ required_monthly_debt_payments: null, monthly_basic_living_costs: null, liquid_emergency_savings: null });
    expect(input).not.toHaveProperty("self_reported_revolving_range");
  });
});

describe("refreshed financial condition assessment", () => {
  function supabaseWith(rawAnswers: Record<string, string> | null) {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: rawAnswers ? { raw_answers: rawAnswers } : null, error: null }),
    };
    return {
      rpc: async () => ({ data: { credit_card_accounts: [] }, error: null }),
      from: () => query,
    } as never;
  }

  beforeEach(() => mockClassify.mockReset());
  it("preserves a duration range when refreshing the classification", async () => {
    mockClassify.mockResolvedValue({ ok: false, reason: "not_configured" });
    await createFinancialConditionAssessment("user-1", supabaseWith({ credit_card_revolving_months: "over_a_year" }));
    expect(mockClassify.mock.calls[0]![1]).toMatchObject({ credit_card_accounts: [], self_reported_revolving_range: "over_a_year" });
  });

  it("sends no self-report when onboarding was never submitted", async () => {
    mockClassify.mockResolvedValue({ ok: false, reason: "not_configured" });
    await createFinancialConditionAssessment("user-1", supabaseWith(null));
    expect(mockClassify.mock.calls[0]![1]).not.toHaveProperty("self_reported_revolving_range");
  });
});
