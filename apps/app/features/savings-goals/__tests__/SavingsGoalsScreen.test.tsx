import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import SavingsGoalsScreen from "../SavingsGoalsScreen";

const mockListFinancialAccounts = jest.fn();
const mockListSavingsGoals = jest.fn();
const mockGetSavingsGoal = jest.fn();
const mockListSavingsGoalActivities = jest.fn();

jest.mock("../../../local-db/repositories/foundations/financialFoundations", () => ({
  listFinancialAccounts: (...args: unknown[]) => mockListFinancialAccounts(...args),
}));
jest.mock("../../../local-db/repositories/savings/savingsGoals", () => ({
  archiveSavingsGoal: jest.fn(),
  deleteSavingsGoal: jest.fn(),
  getSavingsGoal: (...args: unknown[]) => mockGetSavingsGoal(...args),
  listSavingsGoals: (...args: unknown[]) => mockListSavingsGoals(...args),
  restoreSavingsGoal: jest.fn(),
}));
jest.mock("../../../local-db/repositories/savings/savingsGoalActivities", () => ({ listSavingsGoalActivities: (...args: unknown[]) => mockListSavingsGoalActivities(...args) }));
jest.mock("../../../local-db/repositories/savings/savingsAccountDetails", () => ({
  getSavingsAccountDetails: jest.fn(),
  listScheduledSavingsAccounts: jest.fn().mockResolvedValue([{
    accountId: "savings-1",
    name: "Maribank HYSA",
    plannedContributionAmountCentavos: 500_000,
    contributionFrequency: "monthly",
    contributionIntervalCount: 1,
    contributionDayOfMonth: null,
    contributionSecondDayOfMonth: null,
    contributionDayOfWeek: null,
    customIntervalDays: null,
    nextContributionDate: "2026-10-14",
  }]),
}));
jest.mock("../../../local-db/repositories/ledger/ledger", () => ({ listSavingsAccountMovements: jest.fn() }));
jest.mock("../forecast/components/SavingsForecastSection", () => ({ SavingsForecastSection: () => null }));
jest.mock("../components/SavingsAllocationReview", () => () => null);

const goal = {
  id: "goal-1",
  name: "Japan trip",
  linkedAccountId: null,
  linkedAccountName: null,
  isEmergencyFund: false,
  targetAmountCentavos: 6_000_000,
  startingAmountCentavos: 0,
  currentAmountCentavos: 1_850_000,
  remainingAmountCentavos: 4_150_000,
  progressPercent: 31,
  isAchieved: false,
  contributionShortfallCentavos: 110_000,
  targetDate: "2027-04-01",
  priority: "medium",
  emergencyFundBaselineCentavos: null,
  autoSaveAmountCentavos: 0,
  plannedContributionAmountCentavos: 0,
  contributionFrequency: null,
  contributionIntervalCount: null,
  contributionDayOfMonth: null,
  contributionSecondDayOfMonth: null,
  contributionDayOfWeek: null,
  customIntervalDays: null,
  nextContributionDate: null,
  interestRateBps: null,
  notes: null,
  emergencyFundTargetMethod: "manual",
  essentialExpenseCoverageMonths: null,
  status: "active",
  version: 1,
};

describe("SavingsGoalsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListSavingsGoals.mockResolvedValue([]);
    mockListFinancialAccounts.mockResolvedValue([{
      id: "savings-1",
      name: "Maribank HYSA",
      kind: "savings",
      status: "active",
      openingBalanceCentavos: 550_000,
      currentBalanceCentavos: 550_000,
      includeInDashboardBalance: true,
      institutionName: "Maribank",
      openedOn: null,
      archivedAt: null,
      sortOrder: 0,
      savingsAccountType: "high_yield_savings",
      creditCardDetails: null,
    }]);
  });

  it("shows one Savings Goals overview without separate savings accounts", async () => {
    const view = render(<SavingsGoalsScreen userId="user-1" deviceId="device-1" />);

    await waitFor(() => expect(view.getByText("No savings goals yet")).toBeTruthy());
    expect(view.queryByText("Savings accounts")).toBeNull();
    expect(view.queryByText("Goal savings")).toBeNull();
    expect(view.queryByText("Maribank HYSA")).toBeNull();
    expect(mockListFinancialAccounts).not.toHaveBeenCalled();
    expect(mockListSavingsGoals).toHaveBeenCalledWith("user-1", "active");

  });

  it("opens a savable goal form from the Goals page", async () => {
    const view = render(<SavingsGoalsScreen userId="user-1" deviceId="device-1" />);
    await waitFor(() => expect(view.getByLabelText("Add savings goal")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Add savings goal"));
    expect(view.getByLabelText("Goal name")).toBeTruthy();
    expect(view.getByLabelText("Save savings goal")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Cancel"));
    expect(view.getByText("No savings goals yet")).toBeTruthy();
  });

  it("keeps archived savings goals accessible in the same screen", async () => {
    const view = render(<SavingsGoalsScreen userId="user-1" deviceId="device-1" />);
    await waitFor(() => expect(view.getByLabelText("Archived goals")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Archived goals"));
    await waitFor(() => expect(mockListSavingsGoals).toHaveBeenCalledWith("user-1", "archived"));
    expect(view.getByText("No archived savings goals yet.")).toBeTruthy();
    expect(view.queryByLabelText("Add savings goal")).toBeNull();
    fireEvent.press(view.getByLabelText("Active goals"));
    await waitFor(() => expect(view.getByLabelText("Add savings goal")).toBeTruthy());
  });

  it("shows a loading error on the unified overview", async () => {
    mockListSavingsGoals.mockRejectedValueOnce(new Error("unavailable"));
    const view = render(<SavingsGoalsScreen userId="user-1" deviceId="device-1" />);
    await waitFor(() => expect(view.getByText("Your savings goals could not be loaded. Please try again.")).toBeTruthy());
  });

  it("summarizes saved money and opens a goal with its actions in one place", async () => {
    mockListSavingsGoals.mockResolvedValue([goal]);
    mockGetSavingsGoal.mockResolvedValue(goal);
    mockListSavingsGoalActivities.mockResolvedValue([]);
    const onRecordActivity = jest.fn();
    const view = render(<SavingsGoalsScreen userId="user-1" deviceId="device-1" onRecordActivity={onRecordActivity} />);

    await waitFor(() => expect(view.getByText("SAVED ACROSS 1 GOAL")).toBeTruthy());
    expect(view.getByText("₱60,000.00 target")).toBeTruthy();
    expect(view.getByText("Behind")).toBeTruthy();
    expect(view.queryByLabelText("Withdraw")).toBeNull();

    fireEvent.press(view.getByLabelText("Open Japan trip"));
    await waitFor(() => expect(view.getByLabelText("Add money")).toBeTruthy());
    expect(mockGetSavingsGoal).toHaveBeenCalledWith("user-1", "goal-1");
    expect(view.getByText("₱41,500.00 to go")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Add money"));
    expect(onRecordActivity).toHaveBeenCalledWith("goal-1", "contribution", undefined);

    fireEvent.press(view.getByLabelText("Back to goals"));
    await waitFor(() => expect(view.getByText("Your goals")).toBeTruthy());
  });
});
