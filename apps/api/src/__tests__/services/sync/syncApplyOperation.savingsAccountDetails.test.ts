import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";

const queryResult = { maybeSingle: async () => ({ data: { id: "account-1" }, error: null }) };
const fourthFilter = { eq: () => queryResult };
const thirdFilter = { eq: () => fourthFilter };
const secondFilter = { eq: () => thirdFilter };
const firstFilter = { eq: () => secondFilter };
const ownedSavingsAccount = { from: () => ({ select: () => firstFilter }) };

const operation = {
  operation_id: "operation-1", entity: "savings_account_details", record_id: "account-1",
  operation_type: "create" as const, base_version: null,
  changed_fields: ["account_type", "interest_rate_bps", "minimum_balance_centavos", "planned_contribution_amount_centavos", "contribution_frequency", "next_contribution_date"],
  payload: { account_type: "personal_savings", interest_rate_bps: 425, minimum_balance_centavos: 100_00, planned_contribution_amount_centavos: 10_000, contribution_frequency: "monthly", next_contribution_date: "2026-04-30" },
};

describe("savings account detail sync validation", () => {
  it("accepts an owned Personal Savings account detail payload", async () => {
    await expect(prepareOperation(ownedSavingsAccount as never, "user-1", operation)).resolves.toMatchObject({ payload: operation.payload });
  });

  it("rejects incomplete and unknown account detail fields", async () => {
    await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload: { account_type: "high_yield_savings", base_interest_rate_bps: 300 } })).rejects.toThrow("HYSA requires");
    await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload: { ...operation.payload, raw_interest_rate: 5 } })).rejects.toThrow("raw_interest_rate is not syncable");
  });

  it("accepts daily contribution schedules", async () => {
    await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload: { ...operation.payload, contribution_frequency: "daily" } })).resolves.toMatchObject({ payload: { contribution_frequency: "daily" } });
  });

  it("accepts legacy creates without a schedule but rejects partial schedules", async () => {
    await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload: { ...operation.payload, contribution_frequency: "invalid" } })).rejects.toThrow("contribution_frequency is invalid");
    await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload: { account_type: "personal_savings", interest_rate_bps: 425, minimum_balance_centavos: 100_00 } })).resolves.toMatchObject({ payload: { account_type: "personal_savings" } });
    await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload: { account_type: "personal_savings", interest_rate_bps: 425, minimum_balance_centavos: 100_00, planned_contribution_amount_centavos: 10_000 } })).rejects.toThrow("Savings contribution schedule is incomplete");
  });

  it("allows HYSA yield inputs through the sync allowlist", async () => {
    const payload = { account_type: "high_yield_savings", base_interest_rate_bps: 300, interest_calculation_basis: "daily_ending_balance", interest_credit_frequency: "monthly", maximum_eligible_balance_centavos: 100_000_00, balance_tiers: [{ minimumBalanceCentavos: 0, maximumBalanceCentavos: 100_000_00, interestRateBps: 450 }], required_deposit_centavos: 1_000_00, required_deposit_frequency: "monthly", qualification_period: "monthly" };
    await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload })).resolves.toMatchObject({ payload });
  });

  it("allows an unknown higher-rate eligibility state", async () => {
    const payload = { account_type: "high_yield_savings", base_interest_rate_bps: 300, interest_calculation_basis: "daily_ending_balance", interest_credit_frequency: "monthly", higher_rate_eligible: null };
    await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload })).resolves.toMatchObject({ payload });
  });

  it("allows a HYSA with all optional rules and savings-plan fields unset", async () => {
    const payload = { account_type: "high_yield_savings", interest_rate_bps: null, minimum_balance_centavos: null, base_interest_rate_bps: 300, effective_interest_rate_bps: null, interest_conditions: null, higher_rate_eligible: null, boosted_interest_rate_bps: null, interest_calculation_basis: "daily_ending_balance", interest_credit_frequency: "monthly", maximum_eligible_balance_centavos: null, balance_tiers: null, required_deposit_centavos: null, required_deposit_frequency: null, required_transaction_count: null, required_transaction_period: null, direct_deposit_threshold_centavos: null, qualification_period: null, promotional_interest_rate_bps: null, promotion_start_date: null, promotion_end_date: null, principal_centavos: null, maturity_date: null, term_months: null, early_withdrawal_rule: null, planned_contribution_amount_centavos: null, contribution_frequency: null, contribution_interval_count: null, contribution_day_of_month: null, contribution_second_day_of_month: null, contribution_day_of_week: null, custom_interval_days: null, next_contribution_date: null };
    await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload })).resolves.toMatchObject({ payload });
  });
});

it("accepts savings with no interest rate or minimum balance", async () => {
  await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, changed_fields: ["account_type"], payload: { account_type: "personal_savings" } })).resolves.toMatchObject({ payload: { account_type: "personal_savings" } });
});

it("normalizes overlapping reference settings and allows explicitly clearing them", async () => {
  const reference = { balanceBasis: "average_daily_balance", method: "compound", rateStructure: "tiered", notes: "  Bank conditions apply  " };
  const update = { ...operation, operation_type: "update" as const, base_version: 1, changed_fields: ["interest_reference"], payload: { interest_reference: reference } };
  await expect(prepareOperation(ownedSavingsAccount as never, "user-1", update)).resolves.toMatchObject({ payload: { interest_reference: { ...reference, notes: "Bank conditions apply" } } });
  await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...update, payload: { interest_reference: null } })).resolves.toMatchObject({ payload: { interest_reference: null } });
});

it.each([[], "compound", { method: "invalid" }, { method: 1 }, { account_id: "other-account" }, { notes: "x".repeat(1001) }])("rejects invalid interest reference %j", async (interest_reference) => {
  await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload: { ...operation.payload, interest_reference } })).rejects.toThrow();
});

it("accepts a scheduled savings credit contract and rejects malformed schedules", async () => {
  const interest_reference = { balanceBasis: "daily_balance", method: "compound", rateStructure: "fixed", notes: null,
    schedule: { startsOn: "2026-10-21", frequency: "monthly", withholdingTaxBps: 2000, tiers: [] } };
  await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload: { ...operation.payload, interest_reference } })).resolves.toMatchObject({ payload: { interest_reference } });
  for (const schedule of [{ ...interest_reference.schedule, startsOn: "2026-02-30" }, { ...interest_reference.schedule, frequency: "hourly" }, { ...interest_reference.schedule, withholdingTaxBps: -1 }, { ...interest_reference.schedule, userId: "other" }]) {
    await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload: { ...operation.payload, interest_reference: { ...interest_reference, schedule } } })).rejects.toThrow();
  }
});

it("validates the fixed interest form configuration before sync", async () => {
  const configuration = {
    version: 1, calculationFrequency: "daily", creditFrequency: "custom", creditIntervalDays: 14,
    postingMode: "period_end", postingDay: null, postingDate: null, startsOn: "2026-01-01", startingBalanceCentavos: 10000,
    averagingPeriod: "calendar_month", averagingIntervalDays: null, minimumQualifyingBalanceCentavos: null,
    maximumInterestBearingBalanceCentavos: null, dayCountBasis: "actual_365", taxEnabled: true, withholdingTaxBps: 2000,
    autoProject: false, stoppingPolicy: "preserve", showBreakdown: true, rateHistory: [{ effectiveOn: "2026-01-01", rateBps: 425 }],
  };
  const interest_reference = { balanceBasis: "daily_balance", method: "compound", rateStructure: "fixed", notes: null, configuration };
  await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload: { ...operation.payload, interest_reference } })).resolves.toMatchObject({ payload: { interest_reference } });
  await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload: { ...operation.payload, interest_reference: { ...interest_reference, configuration: { ...configuration, autoProject: true } } } })).resolves.toMatchObject({ payload: { interest_reference: { configuration: { autoProject: false } } } });
  for (const changes of [{ withholdingTaxBps: 10001 }, { creditIntervalDays: 0 }, { user_id: "other-user" }, { taxEnabled: "yes" }]) {
    await expect(prepareOperation(ownedSavingsAccount as never, "user-1", { ...operation, payload: { ...operation.payload, interest_reference: { ...interest_reference, configuration: { ...configuration, ...changes } } } })).rejects.toThrow();
  }
});
