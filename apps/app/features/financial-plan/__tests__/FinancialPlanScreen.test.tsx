import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import FinancialPlanScreen from "../FinancialPlanScreen";

const mockListPlanRecommendations = jest.fn();
const noRecommendations = { subcategoryIds: [], categoryIds: [], historySubcategoryIds: [], historyCategoryIds: [], seasonal: false, expectedSpend: { subcategories: {}, categories: {} } };
const mockCreateFinancialPlan = jest.fn();
const mockGetAcceptedFinancialPlanForPeriod = jest.fn();
const mockGetFinancialPlanLabels = jest.fn();
const mockGetFinancialPlanSpending = jest.fn();
const mockDeleteFinancialPlan = jest.fn();
const mockListFinancialAccounts = jest.fn();
const mockListCategories = jest.fn();
const mockListSubcategories = jest.fn();
const mockRequestFinancialPlanRecommendation = jest.fn();
const mockRequestFinancialPlanCommitments = jest.fn();
const mockRunSync = jest.fn();
const mockGetPlanCommitmentPayments = jest.fn();

jest.mock("../../../local-db/repositories/financial-plans/financialPlanCommitmentReview", () => ({
  getPlanCommitmentPayments: (...args: unknown[]) => mockGetPlanCommitmentPayments(...args),
}));

jest.mock("../../../local-db/repositories/financial-plans/financialPlans", () => ({
  createFinancialPlan: (...args: unknown[]) => mockCreateFinancialPlan(...args),
  deleteFinancialPlan: (...args: unknown[]) => mockDeleteFinancialPlan(...args),
  getAcceptedFinancialPlanForPeriod: (...args: unknown[]) => mockGetAcceptedFinancialPlanForPeriod(...args),
  getCurrentFinancialPlanPeriod: (date: string) => ({ start: `${date.slice(0, 7)}-01`, end: new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).toISOString().slice(0, 10) }),
  getFinancialPlanLabels: (...args: unknown[]) => mockGetFinancialPlanLabels(...args),
  getFinancialPlanSpending: (...args: unknown[]) => mockGetFinancialPlanSpending(...args),
}));

jest.mock("../../../local-db/repositories/forecast/forecastTransactions", () => ({
  listPlanRecommendations: (...args: unknown[]) => mockListPlanRecommendations(...args),
}));

jest.mock("../../../local-db/repositories/ledger/taxonomy", () => ({
  listCategories: (...args: unknown[]) => mockListCategories(...args),
  listSubcategories: (...args: unknown[]) => mockListSubcategories(...args),
  updateCategory: jest.fn(),
  updateSubcategory: jest.fn(),
}));

jest.mock("../../../local-db/repositories/foundations/financialFoundations", () => ({
  listFinancialAccounts: (...args: unknown[]) => mockListFinancialAccounts(...args),
}));

jest.mock("../../../local-db/sync/runSync", () => ({
  runSync: (...args: unknown[]) => mockRunSync(...args),
}));

jest.mock("../../../lib/dates", () => ({ ...jest.requireActual("../../../lib/dates"), manilaToday: () => "2026-10-15" }));

const mockRequestFinancialPlanExplanations = jest.fn();
jest.mock("../api", () => ({
  requestFinancialPlanCommitments: (...args: unknown[]) => mockRequestFinancialPlanCommitments(...args),
  requestFinancialPlanRecommendation: (...args: unknown[]) => mockRequestFinancialPlanRecommendation(...args),
  requestFinancialPlanExplanations: (...args: unknown[]) => mockRequestFinancialPlanExplanations(...args),
  requestFinancialPlanForecast: () => Promise.resolve(null),
}));

describe("FinancialPlanScreen", () => {
  beforeEach(() => {
    mockRequestFinancialPlanCommitments.mockReset().mockResolvedValue({ period: { start: "2026-10-01", end: "2026-10-31" }, debtReservations: [], savingsReservations: [] });
    mockListPlanRecommendations.mockResolvedValue(noRecommendations);
    mockCreateFinancialPlan.mockReset().mockResolvedValue({ id: "new-plan" });
    mockRequestFinancialPlanExplanations.mockReset().mockResolvedValue(null);
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({
      id: "plan-1",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      inputSnapshot: { forecast: { quality: "HIGH" } },
      recommendation: {
        availableFundsCentavos: 100_000,
        allocations: [{ allocationRule: "FLEXIBLE", allocatedAmountCentavos: 60_000, floorAmountCentavos: 0, categoryId: "food" }],
        debtReservations: [],
        savingsReservations: [],
      },
    });
    mockGetFinancialPlanLabels.mockResolvedValue({ categories: { food: "Food" }, subcategories: {}, debtAccounts: {}, savingsGoals: {}, creditCardStatements: {} });
    mockGetFinancialPlanSpending.mockResolvedValue({ allocationSpending: { "category:food": 0 }, spentCentavos: 0 });
    mockDeleteFinancialPlan.mockResolvedValue({});
    mockGetPlanCommitmentPayments.mockReset().mockResolvedValue({ paidCentavos: {}, settledKeys: [] });
    mockListFinancialAccounts.mockResolvedValue([]);
    mockListCategories.mockResolvedValue([]);
    mockListSubcategories.mockResolvedValue([]);
    mockRequestFinancialPlanRecommendation.mockReset();
    mockRunSync.mockResolvedValue({ successful: true });
  });

  it("shows the Essentials shortfall above Plan insights", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({
      id: "plan-1", periodStart: "2026-10-01", periodEnd: "2026-10-31",
      inputSnapshot: { restrictions: { allocations: [{ id: "food", target: "category", priorityGroup: "ESSENTIAL" }] } },
      recommendation: {
        availableFundsCentavos: 100_000,
        allocations: [{ categoryId: "food", allocationRule: "FLEXIBLE", allocatedAmountCentavos: 60_000, floorAmountCentavos: 0, forecastAmountCentavos: 80_000 }],
        debtReservations: [], savingsReservations: [],
      },
    });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByText("Essentials shortfall: ₱200.00")).toBeTruthy());
    const output = JSON.stringify(view.toJSON());
    expect(output.indexOf("Essentials shortfall:")).toBeLessThan(output.indexOf("Plan insights"));
    expect(view.getAllByText("Essentials shortfall: ₱200.00")).toHaveLength(1);
  });

  it("hides optional surplus guidance once the plan is accepted", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({
      id: "plan-1", periodStart: "2026-10-01", periodEnd: "2026-10-31",
      inputSnapshot: { forecast: { quality: "HIGH" } },
      recommendation: {
        availableFundsCentavos: 100_000,
        allocations: [{ allocationRule: "FLEXIBLE", allocatedAmountCentavos: 60_000, floorAmountCentavos: 0, categoryId: "food" }],
        debtReservations: [], savingsReservations: [],
        surplusRecommendation: { unallocatedSurplusCentavos: 40_000, assessmentStatus: "insufficient_data" },
      },
    });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Reset Financial Plan")).toBeTruthy());
    expect(view.queryByText("Optional surplus guidance")).toBeNull();
  });

  async function openRecommendationForAcceptance(explanationRequest?: unknown) {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 60_000, fixed_amount_centavos: null, always_in_budget: true }]);
    mockGetFinancialPlanLabels.mockResolvedValue({ categories: {}, subcategories: { rent: "Rent" }, debtAccounts: {}, savingsGoals: {}, creditCardStatements: {} });
    mockRequestFinancialPlanRecommendation.mockResolvedValue({ response: { ok: true }, body: { payload: {
      status: "RECOMMENDATION_READY", period: { start: "2026-10-01", end: "2026-10-31" }, inputSnapshot: {}, explanations: ["Recommendation insight."], explanationRequest,
      recommendation: { availableFundsCentavos: 100_000, allocations: [{ subcategoryId: "rent", categoryId: null, allocationRule: "MINIMUM", allocatedAmountCentavos: 60_000, floorAmountCentavos: 60_000 }], debtReservations: [], savingsReservations: [] },
    } } });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    await waitFor(() => expect(view.getByLabelText("Accept and save Financial Plan")).toBeTruthy());
    return view;
  }

  async function openCommitmentSetup(subcategories: unknown[] = [{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 20_000, fixed_amount_centavos: null }]) {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListSubcategories.mockResolvedValue(subcategories);
    mockRequestFinancialPlanCommitments.mockResolvedValue({
      period: { start: "2026-10-01", end: "2026-10-31" },
      debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 10_000, dueDate: "2026-10-20" }],
      savingsReservations: [{ savingsGoalId: "goal-1", amountCentavos: 5_000, dueDate: "2026-10-25" }],
      obligations: [{ scheduledPaymentId: "bill-1", amountCentavos: 2_000, dueDate: "2026-10-22" }],
    });
    mockRequestFinancialPlanRecommendation.mockResolvedValue({ response: { ok: true }, body: { payload: {
      status: "RECOMMENDATION_READY", period: { start: "2026-10-01", end: "2026-10-31" }, inputSnapshot: {}, explanations: [],
      recommendation: { availableFundsCentavos: 98_000, allocations: [{ subcategoryId: "rent", allocationRule: "MINIMUM", allocatedAmountCentavos: 20_000, floorAmountCentavos: 20_000 }], debtReservations: [], savingsReservations: [] },
    } } });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    fireEvent.changeText(view.getByLabelText("How much should we plan in pesos"), "1000");
    return view;
  }

  it("recommends commitments plus expected spending and starts the planning amount there", async () => {
    mockListPlanRecommendations.mockResolvedValue({ ...noRecommendations, subcategoryIds: ["groceries"], historySubcategoryIds: ["groceries"], expectedSpend: { subcategories: { groceries: 12_250, coffee: 4_000 }, categories: {} } });
    const view = await openCommitmentSetup([
      { id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 20_000, fixed_amount_centavos: null },
      { id: "groceries", category_id: null, label: "Groceries", kind: "expense", minimum_amount_centavos: null, fixed_amount_centavos: null },
      { id: "coffee", category_id: null, label: "Coffee", kind: "expense", minimum_amount_centavos: null, fixed_amount_centavos: null },
    ]);
    // Commitments ₱170.00 (debt ₱100.00, savings ₱50.00, bill ₱20.00) + rent minimum ₱200.00 + groceries ₱122.50; coffee is not selected.
    expect(view.getByText("Recommended Minimum: ₱492.50")).toBeTruthy();
    expect(view.getByText("₱170.00 commitments + ₱322.50 expected spending")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Use the recommended minimum planning amount"));
    expect(view.getByLabelText("How much should we plan in pesos").props.value).toBe("492.50");
    fireEvent.press(view.getByText("Coffee"));
    expect(view.getByText("Recommended Minimum: ₱532.50")).toBeTruthy();
  });

  it("starts the planning amount at the recommendation and flags a month that needs more than is available", async () => {
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 30_000 }]);
    mockListPlanRecommendations.mockResolvedValue({ ...noRecommendations, expectedSpend: { subcategories: {}, categories: {} } });
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 20_000, fixed_amount_centavos: null }]);
    mockRequestFinancialPlanCommitments.mockResolvedValue({ period: { start: "2026-10-01", end: "2026-10-31" }, debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 15_000, dueDate: "2026-10-20" }], savingsReservations: [], obligations: [] });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    expect(view.getByLabelText("How much should we plan in pesos").props.value).toBe("300.00");
    expect(view.getByText("Recommended Minimum: ₱300.00")).toBeTruthy();
    expect(view.getByText("Your available money is ₱50.00 short of this month's needs.")).toBeTruthy();
  });

  it.each([
    { choice: "I'll budget debt repayments manually", manual: "Debt account", due: "Savings goal", dueValue: "50.00", debtRepayments: false, savingsContributions: false, budgets: [{ key: "debt:debt-1:2026-10-20", amountCentavos: 3_000 }, { key: "savings:goal-1:2026-10-25", amountCentavos: 5_000 }] },
    { choice: "I'll budget savings manually", manual: "Savings goal", due: "Debt account", dueValue: "100.00", debtRepayments: false, savingsContributions: false, budgets: [{ key: "debt:debt-1:2026-10-20", amountCentavos: 10_000 }, { key: "savings:goal-1:2026-10-25", amountCentavos: 3_000 }] },
  ])("lists every commitment for review and starts the manual one empty: $choice", async ({ choice, manual, due, dueValue, debtRepayments, savingsContributions, budgets }) => {
    const view = await openCommitmentSetup();
    expect(view.getByLabelText(choice).props.accessibilityState.checked).toBe(false);
    fireEvent.press(view.getByLabelText(choice));
    expect(view.getByLabelText(choice).props.accessibilityState.checked).toBe(true);
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    expect(view.getByLabelText(`${manual} budget amount in pesos`).props.value).toBe("");
    expect(view.getByLabelText(`${due} budget amount in pesos`).props.value).toBe(dueValue);
    fireEvent.changeText(view.getByLabelText(`${manual} budget amount in pesos`), "30");
    expect(mockRequestFinancialPlanRecommendation).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText("Calculate Allocations"));
    fireEvent.press(view.getByLabelText("Yes, continue"));
    await waitFor(() => expect(mockRequestFinancialPlanRecommendation).toHaveBeenCalled());
    await waitFor(() => expect(view.getByText("Category Allocations")).toBeTruthy());
    expect(mockRequestFinancialPlanRecommendation.mock.calls[0][5]).toEqual({ debtRepayments, savingsContributions, scheduledPayments: false, commitmentBudgets: [...budgets, { key: "scheduled:bill-1:2026-10-22", amountCentavos: 2_000 }] });
  });

  it("generates the plan right away with every commitment at its amount due when all are included", async () => {
    const view = await openCommitmentSetup();
    expect(view.getByLabelText("I'll budget debt repayments manually").props.accessibilityState.checked).toBe(false);
    expect(view.getByLabelText("I'll budget savings manually").props.accessibilityState.checked).toBe(false);
    expect(view.getByLabelText("I'll budget billers & remittances manually").props.accessibilityState.checked).toBe(false);
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    await waitFor(() => expect(view.getByText("Category Allocations")).toBeTruthy());
    // The manual commitment step is skipped.
    expect(view.queryByText("Left for categories")).toBeNull();
    expect(mockRequestFinancialPlanRecommendation.mock.calls[0][5]).toEqual({ debtRepayments: false, savingsContributions: false, scheduledPayments: false, commitmentBudgets: [{ key: "debt:debt-1:2026-10-20", amountCentavos: 10_000 }, { key: "savings:goal-1:2026-10-25", amountCentavos: 5_000 }, { key: "scheduled:bill-1:2026-10-22", amountCentavos: 2_000 }] });
  });

  it("returns from the generated plan to setup with the planning amount kept", async () => {
    const view = await openCommitmentSetup();
    const plannedAmount = view.getByLabelText("How much should we plan in pesos").props.value;
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    expect(view.getByLabelText("Generating your Financial Plan")).toBeTruthy();
    await waitFor(() => expect(view.getByText("Category Allocations")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Back to plan setup"));
    expect(view.queryByText("Category Allocations")).toBeNull();
    expect(view.getByLabelText("How much should we plan in pesos").props.value).toBe(plannedAmount);
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    await waitFor(() => expect(mockRequestFinancialPlanRecommendation).toHaveBeenCalledTimes(2));
  });

  it("lists billers and remittances for manual budgeting when that box is ticked", async () => {
    const view = await openCommitmentSetup();
    fireEvent.press(view.getByLabelText("I'll budget billers & remittances manually"));
    expect(view.getByText("You'll set each bill and remittance on the next screen.")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    expect(view.getByLabelText("Biller or remittance budget amount in pesos").props.value).toBe("");
    fireEvent.changeText(view.getByLabelText("Biller or remittance budget amount in pesos"), "20");
    expect(view.getByText("₱830.00")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Calculate Allocations"));
    await waitFor(() => expect(view.getByText("Category Allocations")).toBeTruthy());
    expect(mockRequestFinancialPlanRecommendation.mock.calls[0][5]).toEqual({ debtRepayments: false, savingsContributions: false, scheduledPayments: false, commitmentBudgets: [{ key: "debt:debt-1:2026-10-20", amountCentavos: 10_000 }, { key: "savings:goal-1:2026-10-25", amountCentavos: 5_000 }, { key: "scheduled:bill-1:2026-10-22", amountCentavos: 2_000 }] });
  });

  it("lists every commitment when all of them are budgeted manually", async () => {
    const view = await openCommitmentSetup();
    fireEvent.press(view.getByLabelText("I'll budget savings manually"));
    fireEvent.press(view.getByLabelText("I'll budget debt repayments manually"));
    fireEvent.press(view.getByLabelText("I'll budget billers & remittances manually"));
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    expect(view.getByLabelText("Debt account budget amount in pesos").props.value).toBe("");
    expect(view.getByLabelText("Savings goal budget amount in pesos").props.value).toBe("");
    expect(view.getByLabelText("Biller or remittance budget amount in pesos").props.value).toBe("");
    expect(view.queryByText(/excluded from this plan/)).toBeNull();
    // Nothing is set aside yet, so the remaining money equals the planning amount.
    expect(view.getByText("₱1,000.00")).toBeTruthy();
    expect(view.getByText("of ₱1,000.00 planning amount")).toBeTruthy();
  });

  it("fills a manual commitment with its amount due in one tap", async () => {
    const view = await openCommitmentSetup();
    fireEvent.press(view.getByLabelText("I'll budget debt repayments manually"));
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    fireEvent.press(view.getByLabelText("Use the amount due for Debt account"));
    expect(view.getByLabelText("Debt account budget amount in pesos").props.value).toBe("100.00");
    expect(view.queryByLabelText("Use the amount due for Debt account")).toBeNull();
  });

  it("fills manual commitments with what was already paid or contributed this month", async () => {
    mockGetPlanCommitmentPayments.mockResolvedValue({ paidCentavos: { "debt:debt-1": 10_000, "savings:goal-1": 2_000, "scheduled:bill-1:2026-10-22": 2_000 }, settledKeys: ["scheduled:bill-1:2026-10-22"] });
    const paidView = await openCommitmentSetup();
    expect(mockGetPlanCommitmentPayments).toHaveBeenCalledWith("user-1", { start: "2026-10-01", end: "2026-10-31" });
    fireEvent.press(paidView.getByLabelText("I'll budget savings manually"));
    fireEvent.press(paidView.getByLabelText("I'll budget debt repayments manually"));
    fireEvent.press(paidView.getByLabelText("I'll budget billers & remittances manually"));
    fireEvent.press(paidView.getByLabelText("Continue to Plan"));
    expect(paidView.getByLabelText("Debt account budget amount in pesos").props.value).toBe("100.00");
    expect(paidView.getByLabelText("Savings goal budget amount in pesos").props.value).toBe("20.00");
    expect(paidView.getByLabelText("Biller or remittance budget amount in pesos").props.value).toBe("20.00");
    expect(paidView.getByLabelText("Savings goal: Partially paid")).toBeTruthy();
    expect(paidView.getByLabelText("Debt account: Paid")).toBeTruthy();
  });

  it("restores the amount due when a type is no longer budgeted manually", async () => {
    const view = await openCommitmentSetup();
    fireEvent.press(view.getByLabelText("I'll budget savings manually"));
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    fireEvent.changeText(view.getByLabelText("Savings goal budget amount in pesos"), "10");
    fireEvent.press(view.getByLabelText("Back to plan setup"));
    fireEvent.press(view.getByLabelText("I'll budget savings manually"));
    fireEvent.press(view.getByLabelText("I'll budget debt repayments manually"));
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    expect(view.getByLabelText("Savings goal budget amount in pesos").props.value).toBe("50.00");
    expect(view.getByLabelText("Debt account budget amount in pesos").props.value).toBe("");
  });

  it("starts the manually budgeted commitment empty and confirms amounts below what is due", async () => {
    const view = await openCommitmentSetup();
    fireEvent.press(view.getByLabelText("I'll budget debt repayments manually"));
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    expect(view.getByLabelText("Debt account budget amount in pesos").props.value).toBe("");
    expect(view.getByLabelText("Biller or remittance budget amount in pesos").props.value).toBe("20.00");
    expect(view.getByText("Amount due: ₱20.00")).toBeTruthy();
    expect(view.getByText("Due 2026-10-22")).toBeTruthy();
    expect(view.getByText("Amount due: ₱100.00")).toBeTruthy();
    expect(view.getByText("Due 2026-10-20")).toBeTruthy();
    expect(view.getByText("₱930.00")).toBeTruthy();
    expect(view.queryByText(/may result in a missed payment/)).toBeNull();
    fireEvent.press(view.getByLabelText("Calculate Allocations"));
    expect(view.getByText("Continue with lower amounts?")).toBeTruthy();
    expect(view.queryByText(/may result in a missed payment/)).toBeNull();
    expect(mockRequestFinancialPlanRecommendation).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText("Review amounts"));
    expect(view.queryByText("Continue with lower amounts?")).toBeNull();
    expect(mockRequestFinancialPlanRecommendation).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText("Calculate Allocations"));
    fireEvent.press(view.getByLabelText("Yes, continue"));
    await waitFor(() => expect(mockRequestFinancialPlanRecommendation).toHaveBeenCalled());
    expect(mockRequestFinancialPlanRecommendation.mock.calls[0][5]).toEqual({ debtRepayments: false, savingsContributions: false, scheduledPayments: false, commitmentBudgets: [{ key: "debt:debt-1:2026-10-20", amountCentavos: 0 }, { key: "savings:goal-1:2026-10-25", amountCentavos: 5_000 }, { key: "scheduled:bill-1:2026-10-22", amountCentavos: 2_000 }] });
  });

  it("allocates on the first press without warnings when every commitment is fully funded", async () => {
    const view = await openCommitmentSetup();
    fireEvent.press(view.getByLabelText("I'll budget debt repayments manually"));
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    fireEvent.changeText(view.getByLabelText("Debt account budget amount in pesos"), "100");
    fireEvent.press(view.getByLabelText("Calculate Allocations"));
    await waitFor(() => expect(mockRequestFinancialPlanRecommendation).toHaveBeenCalledTimes(1));
    expect(view.queryByText(/below their amount due/)).toBeNull();
  });

  it("prevents generation when commitments and scheduled bills exceed the planning amount", async () => {
    const view = await openCommitmentSetup();
    fireEvent.press(view.getByLabelText("I'll budget savings manually"));
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    fireEvent.changeText(view.getByLabelText("Debt account budget amount in pesos"), "990");
    expect(view.getByText("-₱10.00")).toBeTruthy();
    expect(view.getByLabelText("Calculate Allocations").props.accessibilityState.disabled).toBe(true);
    expect(mockRequestFinancialPlanRecommendation).not.toHaveBeenCalled();
  });

  it("preserves draft amounts and choices when returning to setup and retrying a failed request", async () => {
    const view = await openCommitmentSetup();
    fireEvent.press(view.getByLabelText("I'll budget savings manually"));
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    fireEvent.changeText(view.getByLabelText("Debt account budget amount in pesos"), "75.25");
    fireEvent.press(view.getByLabelText("Back to plan setup"));
    expect(view.getByLabelText("I'll budget savings manually").props.accessibilityState.checked).toBe(true);
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    expect(view.getByLabelText("Debt account budget amount in pesos").props.value).toBe("75.25");
    mockRequestFinancialPlanRecommendation.mockRejectedValueOnce(new Error("Try again."));
    fireEvent.press(view.getByLabelText("Calculate Allocations"));
    fireEvent.press(view.getByLabelText("Yes, continue"));
    await waitFor(() => expect(view.getByText("Try again.")).toBeTruthy());
    expect(view.getByLabelText("Debt account budget amount in pesos").props.value).toBe("75.25");
    fireEvent.press(view.getByLabelText("Calculate Allocations"));
    fireEvent.press(view.getByLabelText("Yes, continue"));
    await waitFor(() => expect(mockRequestFinancialPlanRecommendation).toHaveBeenCalledTimes(2));
    expect(mockRequestFinancialPlanRecommendation.mock.calls[1][5].commitmentBudgets).toEqual([{ key: "debt:debt-1:2026-10-20", amountCentavos: 7_525 }, { key: "savings:goal-1:2026-10-25", amountCentavos: 0 }, { key: "scheduled:bill-1:2026-10-22", amountCentavos: 2_000 }]);
  });

  it("loads current spending immediately after acceptance and keeps tracking insights when late AI text arrives", async () => {
    let resolveExplanations!: (value: string[]) => void;
    mockRequestFinancialPlanExplanations.mockReturnValue(new Promise<string[]>((resolve) => { resolveExplanations = resolve; }));
    mockGetFinancialPlanSpending.mockResolvedValue({ allocationSpending: { "subcategory:rent": 15_000 }, spentCentavos: 15_000 });
    const view = await openRecommendationForAcceptance({ evidence: {} });
    fireEvent.press(view.getByLabelText("Accept and save Financial Plan"));

    const summary = "You've spent ₱150.00 of your ₱600.00 category budget (25% used). ₱450.00 remaining.";
    await waitFor(() => expect(view.getByText(summary)).toBeTruthy());
    expect(mockGetFinancialPlanSpending).toHaveBeenCalledWith("user-1", "new-plan");
    expect(view.getByText("₱450.00 remaining of ₱600.00")).toBeTruthy();
    expect(view.queryByText("Recommendation insight.")).toBeNull();
    expect(view.queryByLabelText("Advanced plan settings")).toBeNull();
    await act(async () => { resolveExplanations(["Old recommendation from AI."]); });
    expect(view.getByText(summary)).toBeTruthy();
    expect(view.queryByText("Old recommendation from AI.")).toBeNull();
  });

  it("keeps a newly accepted plan saved when its spending cannot be read, without claiming zero spending", async () => {
    mockGetFinancialPlanSpending.mockRejectedValueOnce(new Error("Read unavailable"));
    const view = await openRecommendationForAcceptance();
    fireEvent.press(view.getByLabelText("Accept and save Financial Plan"));
    await waitFor(() => expect(view.getByLabelText("Reset Financial Plan")).toBeTruthy());
    expect(view.getByText("Your plan is saved. Spending insights are temporarily unavailable.")).toBeTruthy();
    expect(view.getByText("Unavailable")).toBeTruthy();
    expect(view.queryByText(/0% used/)).toBeNull();
    expect(view.queryByText("₱600.00 remaining of ₱600.00")).toBeNull();
    expect(view.queryByLabelText("Accept and save Financial Plan")).toBeNull();
  });

  it("keeps unpaid commitments and extra savings and debt amounts out of remaining money and insights", async () => {
    const saved = await mockGetAcceptedFinancialPlanForPeriod();
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ ...saved,
      inputSnapshot: { obligations: { reservations: [{ scheduledPaymentId: "bill-1", amountCentavos: 10_000, dueDate: "2026-10-20" }] } },
      recommendation: { ...saved.recommendation,
        availableFundsCentavos: 70_000,
        debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 10_000, dueDate: "2026-10-20" }],
        savingsReservations: [{ savingsGoalId: "emergency-1", amountCentavos: 10_000, dueDate: "2026-10-20" }],
        debtSurplusCentavos: 5_000, savingsSurplusCentavos: 5_000,
      },
    });
    mockGetFinancialPlanSpending.mockResolvedValue({ allocationSpending: { "category:food": 15_000 }, spentCentavos: 15_000 });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Reset Financial Plan")).toBeTruthy());
    expect(view.getByText("₱450.00")).toBeTruthy();
    expect(view.getByText("₱450.00 remains in your plan. Your budgeted commitments of ₱400.00 are already accounted for.")).toBeTruthy();
    expect(view.queryByText(/Available plan funds minus recorded category spending/)).toBeNull();
  });

  it("opens the saved Financial Plan instead of the category selector", async () => {
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);

    await waitFor(() => expect(view.getByText("Financial Plan")).toBeTruthy());

    expect(view.getByText("Food")).toBeTruthy();
    expect(view.getByText("Remaining Money in Plan")).toBeTruthy();
    // The remaining money and the plan funds breakdown match before any spending.
    expect(view.getAllByText("₱1,000.00")).toHaveLength(2);
    expect(view.getByText("₱600.00 remaining of ₱600.00")).toBeTruthy();
    expect(view.queryByLabelText("Food flexible amount in pesos")).toBeNull();
    expect(view.queryByText(/Forecast trust:/)).toBeNull();
    expect(view.queryByLabelText("Advanced plan settings")).toBeNull();
    expect(mockGetAcceptedFinancialPlanForPeriod).toHaveBeenCalledWith("user-1", "2026-10-01", "2026-10-31");
  });

  it("keeps excluded savings and debt sections hidden after reopening a saved plan", async () => {
    const savedPlan = await mockGetAcceptedFinancialPlanForPeriod();
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ ...savedPlan, inputSnapshot: {
      ...savedPlan.inputSnapshot, commitmentSelection: { debtRepayments: false, savingsContributions: false },
    } });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Reset Financial Plan")).toBeTruthy());
    expect(view.queryByText("Debt repayments")).toBeNull();
    expect(view.queryByText("Savings contributions")).toBeNull();
  });

  it("shows saved billers under Commitments and before Category Allocations without deducting them again", async () => {
    const saved = await mockGetAcceptedFinancialPlanForPeriod();
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ ...saved, inputSnapshot: { ...saved.inputSnapshot, obligations: { reservations: [
      { scheduledPaymentId: "rent", label: "Monthly rent", amountCentavos: 30_000, dueDate: "2026-10-20" },
    ] } } });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByText("Monthly rent")).toBeTruthy());
    expect(view.getByText(/Due 2026-10-20/)).toBeTruthy();
    // The row, its section total, the Commitments total, and the summary breakdown.
    expect(view.getAllByText("₱300.00")).toHaveLength(4);
    expect(view.getByText("₱1,000.00")).toBeTruthy();
    // Available funds exclude the saved bill, so the plan total adds it back.
    expect(view.getByText("₱1,300.00")).toBeTruthy();
    const text = JSON.stringify(view.toJSON());
    expect(text.indexOf("Commitments")).toBeLessThan(text.indexOf("Billers and Remittances"));
    expect(text.indexOf("Billers and Remittances")).toBeLessThan(text.indexOf("Category Allocations"));
    expect(view.queryByLabelText("Billers and Remittances surplus amount in pesos")).toBeNull();
  });

  it("shows whether each saved commitment is paid, partially paid or unpaid", async () => {
    const saved = await mockGetAcceptedFinancialPlanForPeriod();
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ ...saved,
      inputSnapshot: { ...saved.inputSnapshot, debtRequirements: { reservations: [{ debtAccountId: "loan", amountCentavos: 20_000, dueDate: "2026-10-10" }] }, obligations: {
        reservations: [{ scheduledPaymentId: "rent", label: "Monthly rent", amountCentavos: 30_000, dueDate: "2026-10-20" }, { scheduledPaymentId: "family", label: "Family remittance", amountCentavos: 5_000, dueDate: "2026-10-25" }],
        requirements: [{ scheduledPaymentId: "rent", amountCentavos: 30_000, dueDate: "2026-10-20" }, { scheduledPaymentId: "family", amountCentavos: 5_000, dueDate: "2026-10-25" }],
      } },
      recommendation: { ...saved.recommendation, debtReservations: [{ debtAccountId: "loan", label: "Car loan", amountCentavos: 10_000, dueDate: "2026-10-10" }] },
    });
    mockGetPlanCommitmentPayments.mockResolvedValue({ paidCentavos: { "scheduled:rent:2026-10-20": 30_000, "scheduled:family:2026-10-25": 1_000, "debt:loan": 10_000 }, settledKeys: ["scheduled:family:2026-10-25"] });
    mockGetFinancialPlanLabels.mockResolvedValue({ categories: { food: "Food" }, subcategories: {}, debtAccounts: { loan: "Car loan" }, savingsGoals: {}, creditCardStatements: {} });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);

    await waitFor(() => expect(view.getByLabelText("Monthly rent: Paid")).toBeTruthy());
    expect(mockGetPlanCommitmentPayments).toHaveBeenCalledWith("user-1", { start: "2026-10-01", end: "2026-10-31" });
    expect(view.getByLabelText("Car loan: Partially paid")).toBeTruthy();
    expect(view.getByText("Paid ₱100.00 of ₱200.00")).toBeTruthy();
    expect(view.getByLabelText("Family remittance: Paid")).toBeTruthy();
    expect(view.getByText("Paid ₱10.00 of ₱50.00")).toBeTruthy();
    expect(view.getByText("Debt repayments: 1 partial.")).toBeTruthy();
    expect(view.getByText("Billers & remittances: 2 paid.")).toBeTruthy();
  });

  it("keeps the saved plan open without payment statuses when payments cannot be read", async () => {
    const saved = await mockGetAcceptedFinancialPlanForPeriod();
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ ...saved, inputSnapshot: { ...saved.inputSnapshot, obligations: { reservations: [{ scheduledPaymentId: "rent", label: "Monthly rent", amountCentavos: 30_000, dueDate: "2026-10-20" }] } } });
    mockGetPlanCommitmentPayments.mockRejectedValue(new Error("db locked"));
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);

    await waitFor(() => expect(view.getByText("Monthly rent")).toBeTruthy());
    expect(view.queryByLabelText("Monthly rent: Unpaid")).toBeNull();
    expect(view.getByText("Billers & remittances: status unavailable.")).toBeTruthy();
  });

  it("shows an empty biller reservation section for a legacy saved plan", async () => {
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByText("Billers and Remittances")).toBeTruthy());
    expect(view.getByText("No saved biller or remittance reservations for this period.")).toBeTruthy();
  });

  it("recognizes a parent's subcategory spending without asking for a manual baseline", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListCategories.mockResolvedValue([{ id: "housing", label: "Housing", minimum_amount_centavos: null, fixed_amount_centavos: null }]);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: "housing", label: "Rent", kind: "expense", minimum_amount_centavos: null, fixed_amount_centavos: null }]);
    mockListPlanRecommendations.mockResolvedValue({ ...noRecommendations, subcategoryIds: ["rent"], historySubcategoryIds: ["rent"], historyCategoryIds: ["housing"] });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Include Housing in Financial Plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Include Housing in Financial Plan"));
    expect(view.queryByLabelText("One-time plan amount for Housing in pesos")).toBeNull();
    fireEvent.press(view.getByLabelText("Show subcategories for Housing"));
    expect(view.getByLabelText("Include Rent in Financial Plan").props.accessibilityState.checked).toBe(false);
  });

  it("recommends categories for the plan month from last year's seasons", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListCategories.mockResolvedValue([{ id: "misc", label: "Miscellaneous", minimum_amount_centavos: null, fixed_amount_centavos: null }]);
    mockListSubcategories.mockResolvedValue(["gifts", "tuition"].map((id) => ({ id, category_id: "misc", label: id === "gifts" ? "Gifts" : "Tuition", kind: "expense", minimum_amount_centavos: null, fixed_amount_centavos: null })));
    mockListPlanRecommendations.mockResolvedValue({ subcategoryIds: ["gifts"], categoryIds: [], historySubcategoryIds: ["gifts", "tuition"], historyCategoryIds: ["misc"], seasonal: true, expectedSpend: { subcategories: {}, categories: {} } });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Show subcategories for Miscellaneous")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Show subcategories for Miscellaneous"));
    expect(view.getByLabelText("Include Gifts in Financial Plan").props.accessibilityState.checked).toBe(true);

    expect(mockListPlanRecommendations).toHaveBeenCalledWith("user-1", "2026-10");
    expect(view.getByText("Recommended from this time last year and your past 12 months")).toBeTruthy();
    // Tuition is out of season this month, and its history means the plan needs no one-time amount for it.
    fireEvent.press(view.getByLabelText("Include Tuition in Financial Plan"));
    expect(view.queryByLabelText("One-time plan amount for Tuition in pesos")).toBeNull();
  });

  it("allows a November preview before acceptance and hides advanced settings when returning to a saved plan", async () => {
    const savedOctoberPlan = await mockGetAcceptedFinancialPlanForPeriod();
    mockGetAcceptedFinancialPlanForPeriod.mockImplementation(async (_userId: string, start: string) => start === "2026-10-01" ? savedOctoberPlan : null).mockResolvedValueOnce(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 50_000, fixed_amount_centavos: null, always_in_budget: true }]);
    mockRequestFinancialPlanRecommendation.mockResolvedValue({ response: { ok: true }, body: { payload: {
      status: "RECOMMENDATION_READY", period: { start: "2026-11-01", end: "2026-11-30" }, inputSnapshot: {}, explanations: [],
      recommendation: { availableFundsCentavos: 100_000, allocations: [{ subcategoryId: "rent", categoryId: null, allocationRule: "MINIMUM", allocatedAmountCentavos: 50_000, floorAmountCentavos: 50_000 }], debtReservations: [], savingsReservations: [] },
    } } });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Advanced plan settings"));
    fireEvent.press(view.getByLabelText("Next plan month"));
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    expect(mockGetAcceptedFinancialPlanForPeriod).toHaveBeenCalledWith("user-1", "2026-11-01", "2026-11-30");
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    await waitFor(() => expect(view.getByText("Review your plan for 2026-11-01 to 2026-11-30.")).toBeTruthy());
    // The planning amount starts at what the month needs: the rent minimum.
    expect(mockRequestFinancialPlanRecommendation).toHaveBeenCalledWith("token", ["rent"], [], 50_000, [], { debtRepayments: false, savingsContributions: false, scheduledPayments: false, commitmentBudgets: [] }, expect.anything(), "2026-11");
    expect(view.getByText(/Development preview only/)).toBeTruthy();
    expect(view.queryByLabelText("Accept and save Financial Plan")).toBeNull();
    fireEvent.press(view.getByLabelText("Advanced plan settings"));
    fireEvent.press(view.getByLabelText("Previous plan month"));
    await waitFor(() => expect(view.getByLabelText("Reset Financial Plan")).toBeTruthy());
    expect(view.queryByText(/Development preview only/)).toBeNull();
    expect(view.queryByLabelText("Advanced plan settings")).toBeNull();
  });

  it("hides advanced month settings in production builds", async () => {
    const original = __DEV__;
    Object.defineProperty(globalThis, "__DEV__", { value: false, configurable: true, writable: true });
    try {
      const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
      await waitFor(() => expect(view.getByText("Financial Plan")).toBeTruthy());
      expect(view.queryByLabelText("Advanced plan settings")).toBeNull();
    } finally {
      Object.defineProperty(globalThis, "__DEV__", { value: original, configurable: true, writable: true });
    }
  });

  it("shows the selection flow when only a previous-month plan was accepted", async () => {
    const previousPlan = await mockGetAcceptedFinancialPlanForPeriod();
    mockGetAcceptedFinancialPlanForPeriod.mockImplementation(async (_userId: string, start: string) => start === "2026-09-01" ? { ...previousPlan, periodStart: "2026-09-01", periodEnd: "2026-09-30" } : null);
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);

    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());

    expect(view.queryByText("Remaining Money in Plan")).toBeNull();
    expect(mockGetAcceptedFinancialPlanForPeriod).toHaveBeenCalledWith("user-1", "2026-10-01", "2026-10-31");
  });

  it("reduces a saved allocation after its category receives a transaction", async () => {
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByText("₱600.00 remaining of ₱600.00")).toBeTruthy());

    mockGetFinancialPlanSpending.mockResolvedValue({ allocationSpending: { "category:food": 10_000 }, spentCentavos: 10_000 });
    view.rerender(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={1} />);

    await waitFor(() => expect(view.getByText("₱500.00 remaining of ₱600.00")).toBeTruthy());
    expect(view.getByText("₱900.00")).toBeTruthy();
    expect(view.getByText("You've spent ₱100.00 of your ₱600.00 category budget (16.7% used). ₱500.00 remaining.")).toBeTruthy();
  });

  it("shows overspending as a negative remaining amount instead of zero", async () => {
    mockGetFinancialPlanSpending.mockResolvedValue({ allocationSpending: { "category:food": 75_000 }, spentCentavos: 75_000 });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);

    await waitFor(() => expect(view.getByText("-₱150.00 remaining of ₱600.00 · over budget")).toBeTruthy());
  });

  it("shows spending over the plan funds without displaying a recommendation-editing warning", async () => {
    mockGetFinancialPlanSpending.mockResolvedValue({ allocationSpending: { "category:food": 120_000 }, spentCentavos: 120_000 });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByText("You've spent ₱1,200.00 of your ₱600.00 category budget (200% used). ₱600.00 over budget.")).toBeTruthy());
    expect(view.queryByText("Reduce allocations or surplus amounts before saving this plan.")).toBeNull();
  });

  it("requires confirmation before resetting a saved Financial Plan", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Reset Financial Plan")).toBeTruthy());

    fireEvent.press(view.getByText("Reset plan"));

    expect(alert).toHaveBeenCalledWith("Reset Financial Plan?", expect.stringContaining("debt reservations"), expect.any(Array));
    alert.mockRestore();
  });

  it("opens past plans from both the saved plan and the selection flow", async () => {
    const onOpenPastPlans = jest.fn();
    const saved = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} onOpenPastPlans={onOpenPastPlans} />);
    await waitFor(() => expect(saved.getByLabelText("View past Financial Plans")).toBeTruthy());
    fireEvent.press(saved.getByText("Past plans"));
    expect(onOpenPastPlans).toHaveBeenCalledTimes(1);
    saved.unmount();

    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    const selecting = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} onOpenPastPlans={onOpenPastPlans} />);
    await waitFor(() => expect(selecting.getByLabelText("Continue to Plan")).toBeTruthy());
    fireEvent.press(selecting.getByLabelText("View past Financial Plans"));
    expect(onOpenPastPlans).toHaveBeenCalledTimes(2);
  });

  it("uses active non-savings, non-credit-card account balances as available money", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([
      { kind: "cash", status: "active", currentBalanceCentavos: 25_000 },
      { kind: "bank", status: "active", currentBalanceCentavos: 75_000 },
      { kind: "savings", status: "active", currentBalanceCentavos: 50_000 },
      { kind: "credit_card", status: "active", currentBalanceCentavos: 10_000 },
      { kind: "cash", status: "archived", currentBalanceCentavos: 40_000 },
    ]);

    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);

    await waitFor(() => expect(view.getByText("Available money: ₱1,000.00")).toBeTruthy());
    expect(mockListFinancialAccounts).toHaveBeenCalledWith("user-1");
  });

  it("lets the user enter a different planning amount and refresh an infeasible plan", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 75_000, fixed_amount_centavos: null, always_in_budget: true }]);
    mockRequestFinancialPlanRecommendation
      .mockResolvedValueOnce({ response: { ok: true }, body: { payload: {
        status: "INFEASIBLE", period: { start: "2026-11-01", end: "2026-11-30" }, inputSnapshot: {}, explanations: [],
        recommendation: { availableFundsCentavos: -25_000, shortfallCentavos: 25_000, allocations: [{ subcategoryId: "rent", categoryId: null, allocationRule: "MINIMUM", allocatedAmountCentavos: 75_000, floorAmountCentavos: 75_000, ceilingAmountCentavos: 75_000, forecastAmountCentavos: 75_000 }], debtReservations: [], savingsReservations: [] },
      } } })
      .mockResolvedValueOnce({ response: { ok: true }, body: { payload: {
        status: "RECOMMENDATION_READY", period: { start: "2026-11-01", end: "2026-11-30" }, inputSnapshot: {}, explanations: [],
        recommendation: { availableFundsCentavos: 25_000, allocations: [{ subcategoryId: "rent", categoryId: null, allocationRule: "MINIMUM", allocatedAmountCentavos: 75_000, floorAmountCentavos: 75_000, ceilingAmountCentavos: 100_000, forecastAmountCentavos: 75_000 }], debtReservations: [], savingsReservations: [] },
      } } });

    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    await waitFor(() => expect(view.getByText("Have another number in mind?")).toBeTruthy());

    fireEvent.changeText(view.getByLabelText("New planning amount in pesos"), "1000");
    fireEvent.press(view.getByLabelText("Refresh plan with new amount"));

    await waitFor(() => expect(mockRequestFinancialPlanRecommendation).toHaveBeenCalledTimes(2));
    expect(mockRequestFinancialPlanRecommendation.mock.calls[1][3]).toBe(100_000);
    expect(mockRunSync).toHaveBeenCalledWith("user-1", "device-1", "token", { pull: false });
  });

  it("shows the plan with its built-in explanations, then swaps in the AI explanations", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 75_000, fixed_amount_centavos: null, always_in_budget: true }]);
    const explanationRequest = { evidence: { planPeriodLabel: "November 2026" }, leading: [] };
    mockRequestFinancialPlanRecommendation.mockResolvedValueOnce({ response: { ok: true }, body: { payload: {
      status: "RECOMMENDATION_READY", period: { start: "2026-11-01", end: "2026-11-30" }, inputSnapshot: {}, explanations: ["Built-in explanation."], explanationRequest,
      recommendation: { availableFundsCentavos: 25_000, allocations: [{ subcategoryId: "rent", categoryId: null, allocationRule: "MINIMUM", allocatedAmountCentavos: 75_000, floorAmountCentavos: 75_000, ceilingAmountCentavos: 100_000, forecastAmountCentavos: 75_000 }], debtReservations: [], savingsReservations: [] },
    } } });
    let resolveExplanations: (value: string[]) => void = () => {};
    mockRequestFinancialPlanExplanations.mockReturnValueOnce(new Promise((resolve) => { resolveExplanations = resolve; }));

    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Continue to Plan"));

    await waitFor(() => expect(view.getByText("Built-in explanation.")).toBeTruthy());
    expect(mockRequestFinancialPlanExplanations).toHaveBeenCalledWith("token", explanationRequest);
    resolveExplanations(["AI explanation."]);
    await waitFor(() => expect(view.getByText("AI explanation.")).toBeTruthy());
    expect(view.queryByText("Built-in explanation.")).toBeNull();
  });

  it("leaves the loading state with an error when the recommendation request times out", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 75_000, fixed_amount_centavos: null, always_in_budget: true }]);
    const timeout = new Error("Aborted");
    timeout.name = "AbortError";
    mockRequestFinancialPlanRecommendation.mockRejectedValueOnce(timeout);

    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Continue to Plan"));

    await waitFor(() => expect(view.getByText("Your Financial Plan took too long to generate. Try again.")).toBeTruthy());
    expect(view.queryByText("Preparing this month's plan...")).toBeNull();
  });

  it("requires confirmation before skipping debt repayments and shows the warning", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 75_000, fixed_amount_centavos: null, always_in_budget: true }]);
    mockRequestFinancialPlanRecommendation
      .mockResolvedValueOnce({ response: { ok: true }, body: { payload: {
        status: "INFEASIBLE", period: { start: "2026-11-01", end: "2026-11-30" }, inputSnapshot: {}, explanations: [],
        recommendation: { availableFundsCentavos: -25_000, shortfallCentavos: 25_000, allocations: [], debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 10_000, dueDate: "2026-11-12" }], savingsReservations: [] },
      } } })
      .mockResolvedValueOnce({ response: { ok: true }, body: { payload: {
        status: "RECOMMENDATION_READY", period: { start: "2026-11-01", end: "2026-11-30" }, inputSnapshot: {}, explanations: [],
        recommendation: { availableFundsCentavos: 25_000, allocations: [], debtReservations: [], savingsReservations: [] },
      } } });

    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    await waitFor(() => expect(view.getByLabelText("Skip Debt Repayments")).toBeTruthy());

    fireEvent.press(view.getByLabelText("Skip Debt Repayments"));
    expect(alert).toHaveBeenCalledWith("Skip debt repayments?", expect.stringContaining("may result in missed payments"), expect.any(Array));
    const actions = alert.mock.calls[0]![2] as { onPress?: () => void }[];
    await act(async () => {
      actions[1]!.onPress?.();
    });

    await waitFor(() => expect(view.getByText("Skipped plan commitments")).toBeTruthy());
    expect(mockRequestFinancialPlanRecommendation.mock.calls[1]![5]).toEqual({ debtRepayments: true, savingsContributions: false, scheduledPayments: false, commitmentBudgets: [] });
    alert.mockRestore();
  });

  it("shows commitment due dates and lets the user budget each amount", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 75_000, fixed_amount_centavos: null, always_in_budget: true }]);
    mockRequestFinancialPlanRecommendation
      .mockResolvedValueOnce({ response: { ok: true }, body: { payload: {
        status: "RECOMMENDATION_READY", period: { start: "2026-11-01", end: "2026-11-30" }, inputSnapshot: {}, explanations: [],
        recommendation: { availableFundsCentavos: 100_000, allocations: [], debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 10_000, dueDate: "2026-11-12" }], savingsReservations: [{ savingsGoalId: "goal-1", amountCentavos: 5_000, dueDate: "2026-11-15" }] },
      } } })
      .mockResolvedValueOnce({ response: { ok: true }, body: { payload: {
        status: "RECOMMENDATION_READY", period: { start: "2026-11-01", end: "2026-11-30" }, inputSnapshot: {}, explanations: [],
        recommendation: { availableFundsCentavos: 100_000, allocations: [], debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 10_000, dueDate: "2026-11-12" }], savingsReservations: [] },
      } } });

    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());

    fireEvent.press(view.getByLabelText("Continue to Plan"));
    await waitFor(() => expect(mockRequestFinancialPlanRecommendation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.getByText("Debt repayments")).toBeTruthy());
    expect(view.queryByText(/Due 2026-11-12/)).toBeNull();
    fireEvent.press(view.getByLabelText("Show Debt repayments"));
    expect(view.getByText(/Due 2026-11-12/)).toBeTruthy();
    const debtAmount = view.getByLabelText("Debt account budget amount in pesos");
    expect(debtAmount.props.value).toBe("100.00");
    fireEvent.changeText(debtAmount, "75.00");
    expect(view.getByLabelText("Debt account budget amount in pesos").props.value).toBe("75.00");
  });

  it("defers generation until commitment amounts are reviewed and submits the user's budgets", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 20_000, fixed_amount_centavos: null }]);
    mockRequestFinancialPlanCommitments.mockResolvedValue({ period: { start: "2026-10-01", end: "2026-10-31" }, debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 10_000, dueDate: "2026-10-20" }], savingsReservations: [{ savingsGoalId: "goal-1", amountCentavos: 5_000, dueDate: "2026-10-25" }] });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    expect(view.queryByLabelText("Debt account budget amount in pesos")).toBeNull();
    fireEvent.press(view.getByLabelText("I'll budget savings manually"));
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    expect(view.getByText("Amount due: ₱100.00")).toBeTruthy();
    expect(view.queryByText("Category Allocations")).toBeNull();
    expect(mockRequestFinancialPlanRecommendation).not.toHaveBeenCalled();
    const debt = view.getByLabelText("Debt account budget amount in pesos");
    fireEvent(debt, "focus");
    fireEvent.changeText(debt, "abc");
    expect(view.getByLabelText("Calculate Allocations").props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(debt, "7");
    fireEvent.changeText(debt, "75.");
    expect(view.getByLabelText("Debt account budget amount in pesos").props.value).toBe("75.");
    fireEvent.changeText(debt, "75.25");
    expect(view.getByText("Amount due: ₱100.00")).toBeTruthy();
    expect(view.queryByText(/may result in a missed payment/)).toBeNull();
    fireEvent.press(view.getByLabelText("Calculate Allocations"));
    expect(view.getByText("Continue with lower amounts?")).toBeTruthy();
    expect(view.queryByText(/may result in a missed payment/)).toBeNull();
    expect(mockRequestFinancialPlanRecommendation).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText("Yes, continue"));
    await waitFor(() => expect(mockRequestFinancialPlanRecommendation).toHaveBeenCalled());
    expect(mockRequestFinancialPlanRecommendation.mock.calls[0][5].commitmentBudgets).toEqual([{ key: "debt:debt-1:2026-10-20", amountCentavos: 7_525 }, { key: "savings:goal-1:2026-10-25", amountCentavos: 0 }]);
  });

  it("recalculates remaining funds and prevents saving an increased commitment above the budget", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 20_000, fixed_amount_centavos: null }]);
    mockRequestFinancialPlanRecommendation.mockResolvedValue({ response: { ok: true }, body: { payload: {
      status: "RECOMMENDATION_READY", period: { start: "2026-10-01", end: "2026-10-31" }, inputSnapshot: { debtRequirements: { reservations: [{ debtAccountId: "debt-1", amountCentavos: 10_000, dueDate: "2026-10-20" }] } }, explanations: [],
      recommendation: { availableFundsCentavos: 90_000, allocations: [{ categoryId: "food", allocationRule: "FLEXIBLE", floorAmountCentavos: 0, allocatedAmountCentavos: 80_000 }], debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 10_000, dueDate: "2026-10-20" }], savingsReservations: [] },
    } } });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    await waitFor(() => expect(view.getByText("Remaining Money in Plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Show Debt repayments"));
    fireEvent.changeText(view.getByLabelText("Debt account budget amount in pesos"), "300");
    expect(view.getByText("-₱100.00")).toBeTruthy();
    expect(view.getByLabelText("Accept and save Financial Plan").props.accessibilityState.disabled).toBe(true);
    expect(view.getByText("Amount due: ₱100.00")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Calculate Allocations"));
    await waitFor(() => expect(mockRequestFinancialPlanRecommendation).toHaveBeenCalledTimes(2));
    expect(mockRequestFinancialPlanRecommendation.mock.calls[1][5].commitmentBudgets).toEqual([{ key: "debt:debt-1:2026-10-20", amountCentavos: 30_000 }]);
  });

  it("blocks acceptance while a category amount draft is invalid", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListCategories.mockResolvedValue([{ id: "food", label: "Food", slug: "food", kind: "expense", minimum_amount_centavos: 20_000, fixed_amount_centavos: null }]);
    mockListSubcategories.mockResolvedValue([]);
    mockRequestFinancialPlanRecommendation.mockResolvedValue({ response: { ok: true }, body: { payload: {
      status: "RECOMMENDATION_READY", period: { start: "2026-10-01", end: "2026-10-31" }, inputSnapshot: {}, explanations: [],
      recommendation: { availableFundsCentavos: 100_000, allocations: [{ categoryId: "food", allocationRule: "FLEXIBLE", floorAmountCentavos: 0, allocatedAmountCentavos: 80_000 }], debtReservations: [], savingsReservations: [] },
    } } });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    await waitFor(() => expect(view.getByLabelText("Food flexible amount in pesos")).toBeTruthy());
    fireEvent.changeText(view.getByLabelText("Food flexible amount in pesos"), "invalid");
    expect(view.getByLabelText("Accept and save Financial Plan").props.accessibilityState.disabled).toBe(true);
    fireEvent.press(view.getByLabelText("Accept and save Financial Plan"));
    expect(mockCreateFinancialPlan).not.toHaveBeenCalled();
    fireEvent.changeText(view.getByLabelText("Food flexible amount in pesos"), "800");
    expect(view.getByLabelText("Accept and save Financial Plan").props.accessibilityState.disabled).toBe(false);
  });

  it("lets the user edit a biller after allocation and warns before accepting an underfunded bill", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 20_000, fixed_amount_centavos: null }]);
    const bill = { scheduledPaymentId: "bill-1", label: "Electricity", amountCentavos: 2_000, dueDate: "2026-10-22" };
    mockRequestFinancialPlanRecommendation.mockResolvedValue({ response: { ok: true }, body: { payload: {
      status: "RECOMMENDATION_READY", period: { start: "2026-10-01", end: "2026-10-31" }, inputSnapshot: { plannedAmountCentavos: 100_000, obligations: { reservations: [bill], requirements: [bill] } }, explanations: [],
      recommendation: { availableFundsCentavos: 98_000, allocations: [{ subcategoryId: "rent", allocationRule: "MINIMUM", floorAmountCentavos: 20_000, allocatedAmountCentavos: 20_000 }], debtReservations: [], savingsReservations: [] },
    } } });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    await waitFor(() => expect(view.getByText("Remaining Money in Plan")).toBeTruthy());
    expect(view.getByText("₱780.00")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Show Billers and Remittances"));
    fireEvent.changeText(view.getByLabelText("Electricity budget amount in pesos"), "5");
    expect(view.getByText("₱795.00")).toBeTruthy();
    expect(view.queryByText(/may result in a missed payment/)).toBeNull();
    fireEvent.press(view.getByLabelText("Accept and save Financial Plan"));
    expect(view.getByText("Continue with lower amounts?")).toBeTruthy();
    expect(view.queryByText(/may result in a missed payment/)).toBeNull();
    expect(mockCreateFinancialPlan).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText("Yes, continue"));
    await waitFor(() => expect(mockCreateFinancialPlan).toHaveBeenCalled());
    expect(mockCreateFinancialPlan.mock.calls[0][2]).toMatchObject({ inputSnapshot: { obligations: { reservations: [{ ...bill, amountCentavos: 500 }], requirements: [bill] } }, recommendation: { availableFundsCentavos: 99_500 } });
  });

  it("retains original amounts due when reopening a plan with a smaller budget", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue({ id: "plan-1", periodStart: "2026-10-01", periodEnd: "2026-10-31", inputSnapshot: { debtRequirements: { reservations: [{ debtAccountId: "debt-1", amountCentavos: 10_000, dueDate: "2026-10-20" }] } }, recommendation: { availableFundsCentavos: 92_500, allocations: [], debtReservations: [{ debtAccountId: "debt-1", amountCentavos: 7_500, dueDate: "2026-10-20" }], savingsReservations: [] } });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByText("Amount due: ₱100.00")).toBeTruthy());
    expect(view.getAllByText("₱75.00").length).toBeGreaterThan(0);
    expect(view.queryByLabelText("Debt account budget amount in pesos")).toBeNull();
  });

  it("lets the user reduce a commitment to resolve an infeasible plan", async () => {
    mockGetAcceptedFinancialPlanForPeriod.mockResolvedValue(null);
    mockListFinancialAccounts.mockResolvedValue([{ kind: "cash", status: "active", currentBalanceCentavos: 100_000 }]);
    mockListSubcategories.mockResolvedValue([{ id: "rent", category_id: null, label: "Rent", kind: "expense", minimum_amount_centavos: 75_000, fixed_amount_centavos: null }]);
    const due = { debtAccountId: "loan", amountCentavos: 50_000, dueDate: "2026-10-20" };
    mockRequestFinancialPlanRecommendation.mockResolvedValue({ response: { ok: true }, body: { payload: { status: "INFEASIBLE", period: { start: "2026-10-01", end: "2026-10-31" }, inputSnapshot: { debtRequirements: { reservations: [due] } }, explanations: [], recommendation: { availableFundsCentavos: 50_000, requiredFundsCentavos: 125_000, shortfallCentavos: 25_000, allocations: [{ subcategoryId: "rent", allocationRule: "MINIMUM", floorAmountCentavos: 75_000, allocatedAmountCentavos: 75_000 }], debtReservations: [due], savingsReservations: [] } } } });
    const view = render(<FinancialPlanScreen userId="user-1" deviceId="device-1" accessToken="token" syncVersion={0} />);
    await waitFor(() => expect(view.getByLabelText("Continue to Plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Continue to Plan"));
    await waitFor(() => expect(view.getByText("This plan cannot cover all requirements")).toBeTruthy());
    fireEvent.changeText(view.getByLabelText("Debt account budget amount in pesos"), "250");
    expect(view.queryByText("This plan cannot cover all requirements")).toBeNull();
    expect(view.getByText("Amount due: ₱500.00")).toBeTruthy();
    expect(view.queryByText(/may result in a missed payment/)).toBeNull();
    fireEvent.press(view.getByLabelText("Accept and save Financial Plan"));
    expect(view.getByText("Continue with lower amounts?")).toBeTruthy();
    expect(view.queryByText(/may result in a missed payment/)).toBeNull();
    expect(mockCreateFinancialPlan).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText("Yes, continue"));
    await waitFor(() => expect(mockCreateFinancialPlan).toHaveBeenCalled());
    expect(mockRequestFinancialPlanRecommendation).toHaveBeenCalledTimes(1);
    expect(mockCreateFinancialPlan.mock.calls[0][2]).toMatchObject({ inputSnapshot: { debtRequirements: { reservations: [due] } }, recommendation: { availableFundsCentavos: 75_000 }, debtReservations: [{ ...due, amountCentavos: 25_000 }] });
  });
});
