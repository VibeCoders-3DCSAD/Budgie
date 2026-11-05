import { getCurrentSavingsEnvelopeAllocation } from "../savingsEnvelopeAllocationQueries";

const mockGetAcceptedFinancialPlanForPeriod = jest.fn();
const mockGetSavingsAllocationStrategy = jest.fn();
const mockListSavingsGoals = jest.fn();
const mockGetPayments = jest.fn();
const mockGetRequirements = jest.fn();

jest.mock("../../../../local-db/repositories/financial-plans/financialPlanCommitmentReview", () => ({
  getPlanCommitmentPayments: (...args: unknown[]) => mockGetPayments(...args),
}));

jest.mock("../../../../local-db/repositories/financial-plans/financialPlans", () => ({
  getAcceptedFinancialPlanForPeriod: (...args: unknown[]) => mockGetAcceptedFinancialPlanForPeriod(...args),
  getCurrentFinancialPlanPeriod: (asOfDate: string) => asOfDate.startsWith("2026-10") ? { start: "2026-10-01", end: "2026-10-31" } : null,
}));
jest.mock("../../../../local-db/repositories/savings/savingsAllocationPreferences", () => ({
  getSavingsAllocationStrategy: (...args: unknown[]) => mockGetSavingsAllocationStrategy(...args),
}));
jest.mock("../../../../local-db/repositories/savings/savingsGoals", () => ({
  listSavingsGoals: (...args: unknown[]) => mockListSavingsGoals(...args),
}));
jest.mock("../requiredSavingsContributionQueries", () => ({
  getRequiredSavingsContributionsForPeriod: (...args: unknown[]) => mockGetRequirements(...args),
}));

describe("getCurrentSavingsEnvelopeAllocation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPayments.mockResolvedValue({ paidCentavos: {}, settledKeys: [] });
    mockGetRequirements.mockResolvedValue({ contributions: [{ source: "goal", savingsId: "goal-1", configuredMinimumCentavos: 800_000, recordedContributionCentavos: 0 }] });
    mockGetSavingsAllocationStrategy.mockResolvedValue("avalanche");
    mockListSavingsGoals.mockResolvedValue([{
      id: "goal-1",
      name: "Emergency fund",
      isEmergencyFund: true,
      status: "active",
      isAchieved: false,
      targetDate: "2026-12-01",
      remainingAmountCentavos: 100_000_00,
      contributionFrequency: "monthly",
      nextContributionDate: "2026-10-20",
    }]);
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      recommendation: {
        savingsReservations: [{ savingsGoalId: "goal-1", amountCentavos: 800_000 }],
        savingsSurplusCentavos: 4_000_000,
      },
    });
  });

  it("includes Financial Plan savings surplus with goal reservations", async () => {
    const allocation = await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15");

    expect(allocation).toMatchObject({ envelopeCentavos: 4_800_000, proposals: [expect.objectContaining({ id: "goal-1", proposedTotalCentavos: 4_800_000 })] });
    expect(mockGetAcceptedFinancialPlanForPeriod).toHaveBeenCalledWith("user-1", "2026-10-01", "2026-10-31");
  });

  it("uses the selected strategy for surplus after reservations", async () => {
    mockGetSavingsAllocationStrategy.mockResolvedValue("snowball");
    mockListSavingsGoals.mockResolvedValue([
      { id: "goal-1", name: "Long-term", isEmergencyFund: false, status: "active", isAchieved: false, targetDate: null, remainingAmountCentavos: 10_000_000, contributionFrequency: "monthly", nextContributionDate: "2026-10-20" },
      { id: "goal-2", name: "Short-term", isEmergencyFund: false, status: "active", isAchieved: false, targetDate: null, remainingAmountCentavos: 5_000_000, contributionFrequency: "monthly", nextContributionDate: "2026-10-20" },
    ]);
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      recommendation: { savingsReservations: [], savingsSurplusCentavos: 4_000_000 },
    });

    const allocation = await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15");

    expect(allocation?.proposals.find((proposal) => proposal.id === "goal-2")).toMatchObject({ proposedTotalCentavos: 3_200_000 });
    expect(allocation?.proposals.find((proposal) => proposal.id === "goal-1")).toMatchObject({ proposedTotalCentavos: 800_000 });
  });

  it("reduces the amount left to contribute by contributions recorded this cycle", async () => {
    mockGetPayments.mockResolvedValue({ paidCentavos: { "savings:goal-1": 500_000 }, settledKeys: [] });
    mockGetRequirements.mockResolvedValue({ contributions: [{ source: "goal", savingsId: "goal-1", configuredMinimumCentavos: 800_000, recordedContributionCentavos: 500_000 }] });

    const allocation = await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15");

    expect(allocation).toMatchObject({ envelopeCentavos: 4_800_000, requiredCentavos: 300_000, remainingToContributeCentavos: 4_300_000, contributions: [expect.objectContaining({ plannedCentavos: 4_800_000, recordedCentavos: 500_000 })], proposals: [expect.objectContaining({ plannedTotalCentavos: 4_800_000, proposedTotalCentavos: 4_300_000 })] });
  });

  it("does not charge standalone savings account schedules against the goal budget", async () => {
    mockGetRequirements.mockResolvedValue({ contributions: [
      { source: "goal", savingsId: "goal-1", configuredMinimumCentavos: 800_000, recordedContributionCentavos: 0 },
      { source: "savings_account", savingsId: "account-1", remainingRequiredCentavos: 1_000_000 },
    ] });

    const allocation = await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15");

    expect(allocation).toMatchObject({ accountRequiredCentavos: 0, requiredCentavos: 800_000, unallocatedCentavos: 0, proposals: [expect.objectContaining({ proposedTotalCentavos: 4_800_000 })] });
  });

  it("honors saved reservations even after a goal's schedule is removed", async () => {
    const [goal] = await mockListSavingsGoals();
    mockListSavingsGoals.mockResolvedValue([{ ...goal, contributionFrequency: null, nextContributionDate: null }]);
    mockGetRequirements.mockResolvedValue({ contributions: [] });

    const allocation = await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15");

    expect(allocation?.proposals).toEqual([expect.objectContaining({ id: "goal-1", proposedTotalCentavos: 4_800_000 })]);
  });

  it("keeps a completed goal in the cycle and stops proposing paid contributions", async () => {
    const [goal] = await mockListSavingsGoals();
    mockListSavingsGoals.mockResolvedValue([{ ...goal, isAchieved: true, remainingAmountCentavos: 0 }]);
    mockGetPayments.mockResolvedValue({ paidCentavos: { "savings:goal-1": 4_800_000, "debt:loan-1": 100_000 }, settledKeys: [] });
    mockGetRequirements.mockResolvedValue({ contributions: [] });

    const allocation = await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15");

    expect(allocation).toMatchObject({ remainingToContributeCentavos: 0, contributions: [{ id: "goal-1", plannedCentavos: 4_800_000, recordedCentavos: 4_800_000 }], proposals: [expect.objectContaining({ proposedTotalCentavos: 0 })] });
    expect(mockGetPayments).toHaveBeenCalledWith("user-1", { start: "2026-10-01", end: "2026-10-31" });
  });

  it("refreshes totals from a replacement accepted plan", async () => {
    await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15");
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ periodStart: "2026-10-01", periodEnd: "2026-10-31", recommendation: { savingsReservations: [{ savingsGoalId: "goal-1", amountCentavos: 200_000 }], savingsSurplusCentavos: 100_000 } });

    const allocation = await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15");

    expect(allocation).toMatchObject({ envelopeCentavos: 300_000, remainingToContributeCentavos: 300_000, contributions: [expect.objectContaining({ plannedCentavos: 300_000 })] });
  });

  it("returns no cycle without an accepted plan", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    expect(await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15")).toBeNull();
    expect(mockGetPayments).not.toHaveBeenCalled();
  });

  it("uses the earliest saved plan due date ahead of a changed goal schedule", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ periodStart: "2026-10-01", periodEnd: "2026-10-31", recommendation: { savingsReservations: [
      { savingsGoalId: "goal-1", amountCentavos: 400_000, dueDate: "2026-10-25" },
      { savingsGoalId: "goal-1", amountCentavos: 400_000, dueDate: "2026-10-10" },
    ], savingsSurplusCentavos: 0 } });

    const allocation = await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15");

    expect(allocation?.contributions).toEqual([expect.objectContaining({ plannedCentavos: 800_000, dueDate: "2026-10-10" })]);
  });

  it("falls back to the goal schedule only within the plan's month", async () => {
    expect((await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15"))?.contributions[0]?.dueDate).toBe("2026-10-20");
    const [goal] = await mockListSavingsGoals();
    mockListSavingsGoals.mockResolvedValue([{ ...goal, nextContributionDate: "2026-11-20" }]);
    expect((await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15"))?.contributions[0]?.dueDate).toBeNull();
  });

  it("does not let extra deposits to another goal pay the RTX 5090 allocation", async () => {
    const [goal] = await mockListSavingsGoals();
    mockListSavingsGoals.mockResolvedValue([goal, { ...goal, id: "rtx", name: "RTX 5090", isEmergencyFund: false }]);
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ periodStart: "2026-10-01", periodEnd: "2026-10-31", recommendation: {
      savingsReservations: [{ savingsGoalId: "goal-1", amountCentavos: 769_231 }, { savingsGoalId: "rtx", amountCentavos: 1_284_369 }], savingsSurplusCentavos: 0,
    } });
    mockGetPayments.mockResolvedValue({ paidCentavos: { "savings:goal-1": 3_000_000, "savings:unrelated": 1_000_000 }, settledKeys: [] });

    const allocation = await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15");

    expect(allocation?.remainingToContributeCentavos).toBe(1_284_369);
    expect(allocation?.contributions.find((row) => row.id === "rtx")).toMatchObject({ plannedCentavos: 1_284_369, recordedCentavos: 0 });
  });

  it("reports surplus no goal can take on its own and keeps it out of the amount left to contribute", async () => {
    mockListSavingsGoals.mockResolvedValue([{ id: "goal-1", name: "Emergency fund", isEmergencyFund: true, status: "active", isAchieved: false, targetDate: "2026-12-01", remainingAmountCentavos: 500_000 }]);
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ periodStart: "2026-10-01", periodEnd: "2026-10-31", recommendation: { savingsReservations: [{ savingsGoalId: "goal-1", amountCentavos: 300_000 }], savingsSurplusCentavos: 1_000_000 } });
    mockGetPayments.mockResolvedValue({ paidCentavos: { "savings:goal-1": 100_000 }, settledKeys: [] });

    const allocation = await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15");

    // The goal had ₱6,000 of room this month (₱5,000 left plus the ₱1,000 already deposited) out of a ₱13,000 budget.
    expect(allocation).toMatchObject({ envelopeCentavos: 1_300_000, unallocatedCentavos: 700_000, remainingToContributeCentavos: 500_000, contributions: [expect.objectContaining({ plannedCentavos: 600_000, recordedCentavos: 100_000 })] });
  });

  it("reaches nothing left to contribute once every goal is filled, even with surplus to spare", async () => {
    mockListSavingsGoals.mockResolvedValue([{ id: "goal-1", name: "Emergency fund", isEmergencyFund: true, status: "active", isAchieved: true, targetDate: "2026-12-01", remainingAmountCentavos: 0 }]);
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ periodStart: "2026-10-01", periodEnd: "2026-10-31", recommendation: { savingsReservations: [{ savingsGoalId: "goal-1", amountCentavos: 200_000 }], savingsSurplusCentavos: 600_000 } });
    mockGetPayments.mockResolvedValue({ paidCentavos: { "savings:goal-1": 200_000 }, settledKeys: [] });

    const allocation = await getCurrentSavingsEnvelopeAllocation("user-1", "2026-10-15");

    expect(allocation).toMatchObject({ envelopeCentavos: 800_000, unallocatedCentavos: 600_000, remainingToContributeCentavos: 0 });
  });
});
