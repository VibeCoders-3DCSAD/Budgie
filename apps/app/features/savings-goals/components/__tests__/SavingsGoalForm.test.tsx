import React from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import SavingsGoalForm from "../SavingsGoalForm";
import { LocalDbError } from "../../../../local-db/helpers";
import { getEmergencyFundBaseline } from "../../../../local-db/repositories/savings/savingsGoals";
import type { SavingsGoal } from "../../../../local-db/repositories/savings/savingsGoals";

jest.mock("../../../../local-db/repositories/savings/savingsGoalAccounts", () => ({
  listActiveSavingsGoalAccounts: jest.fn().mockResolvedValue([{ id: "account-1", name: "Main account", status: "active" }]),
  getSavingsGoalAccount: jest.fn().mockResolvedValue({ id: "account-1", name: "Main account", status: "active" }),
}));

jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");

const mockUpdate = jest.fn();
const mockCreate = jest.fn();
jest.mock("../../../../local-db/repositories/savings/savingsGoals", () => ({
  updateSavingsGoal: (...args: unknown[]) => mockUpdate(...args),
  createSavingsGoal: (...args: unknown[]) => mockCreate(...args),
  getEmergencyFundBaseline: jest.fn().mockResolvedValue(0),
}));
jest.mock("../../../../lib/dates", () => ({ ...jest.requireActual("../../../../lib/dates"), manilaToday: () => "2026-10-18" }));

const goal: SavingsGoal = {
  id: "goal-1", name: "Travel", goalType: "custom", goalCategory: "custom",
  targetAmountCentavos: 100_000, startingAmountCentavos: 0, currentAmountCentavos: 0,
  remainingAmountCentavos: 100_000, progressPercent: 0, isAchieved: false,
  contributionShortfallCentavos: 0, targetDate: "2026-12-31", priority: "medium",
  emergencyFundBaselineCentavos: null, autoSaveAmountCentavos: 5_000,
  plannedContributionAmountCentavos: 5_000, contributionFrequency: "monthly",
  contributionIntervalCount: 1, contributionDayOfMonth: 15,
  contributionSecondDayOfMonth: null, contributionDayOfWeek: null,
  customIntervalDays: null, nextContributionDate: "2026-11-15",
  interestRateBps: null, notes: null, emergencyFundTargetMethod: "fixed_amount",
  essentialExpenseCoverageMonths: null, status: "active", version: 1,
};

function selectTargetDate(view: ReturnType<typeof render>, date: Date) {
  fireEvent.press(view.getByLabelText("Target date"));
  fireEvent(view.UNSAFE_getByType(DateTimePicker), "onChange", { type: "set" }, date);
}

describe("SavingsGoalForm contribution frequency", () => {
  beforeEach(() => {
    jest.mocked(getEmergencyFundBaseline).mockReset().mockResolvedValue(0);
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ goal });
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ goal });
  });

  it("suggests six months of essentials only when checked and applies the target on request", async () => {
    jest.mocked(getEmergencyFundBaseline).mockResolvedValue(123_456);
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" onCancel={jest.fn()} onSaved={jest.fn()} />);
    fireEvent.changeText(view.getByLabelText("Target amount"), "1000");
    expect(getEmergencyFundBaseline).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText("This is my emergency fund"));
    await waitFor(() => expect(view.getByText("Suggested target: ₱7,407.36")).toBeTruthy());
    expect(getEmergencyFundBaseline).toHaveBeenCalledWith("user-1", new Date("2026-10-18T00:00:00Z"));
    expect(view.getByLabelText("Target amount").props.value).toBe("1000");
    fireEvent.press(view.getByLabelText("Use suggested target amount"));
    expect(view.getByLabelText("Target amount").props.value).toBe("7407.36");
    fireEvent.press(view.getByLabelText("This is my emergency fund"));
    expect(view.queryByLabelText("Use suggested target amount")).toBeNull();
    expect(view.getByLabelText("Target amount").props.value).toBe("7407.36");
  });

  it("allows manual targets when there are no essential expenses", async () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" onCancel={jest.fn()} onSaved={jest.fn()} />);
    fireEvent.press(view.getByLabelText("This is my emergency fund"));
    await waitFor(() => expect(view.getByText(/No essential expenses recorded/)).toBeTruthy());
    expect(view.queryByLabelText("Use suggested target amount")).toBeNull();
  });

  it("handles unavailable expense history without blocking manual entry", async () => {
    jest.mocked(getEmergencyFundBaseline).mockRejectedValue(new Error("database unavailable"));
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" onCancel={jest.fn()} onSaved={jest.fn()} />);
    fireEvent.press(view.getByLabelText("This is my emergency fund"));
    await waitFor(() => expect(view.getByText(/Unable to calculate a suggested target/)).toBeTruthy());
    fireEvent.changeText(view.getByLabelText("Target amount"), "5000");
    expect(view.getByLabelText("Target amount").props.value).toBe("5000");
  });

  it("saves a newly filled goal and notifies the screen", async () => {
    const onSaved = jest.fn();
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" onCancel={jest.fn()} onSaved={onSaved} />);
    fireEvent.changeText(view.getByLabelText("Goal name"), "Travel");
    fireEvent.changeText(view.getByLabelText("Target amount"), "1000");
    selectTargetDate(view, new Date(2026, 11, 31));
    fireEvent.press(view.getByLabelText("None"));
    fireEvent.press(view.getByLabelText("Select financial account"));
    await waitFor(() => expect(view.getByLabelText("Link Main account")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Link Main account"));
    fireEvent.press(view.getByLabelText("Save savings goal"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(goal));
    expect(mockCreate).toHaveBeenCalledWith("user-1", "device-1", expect.objectContaining({ name: "Travel", linkedAccountId: "account-1", targetAmountCentavos: 100_000, contributionFrequency: null }));
  });

  it("formats both amounts as decimals and saves their cents", async () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" goal={goal} onCancel={jest.fn()} onSaved={jest.fn()} />);
    expect(view.getByLabelText("Starting amount").props.value).toBe("0.00");
    for (const label of ["Target amount", "Starting amount"]) {
      expect(view.getByLabelText(label).props.keyboardType).toBe("decimal-pad");
    }
    fireEvent.changeText(view.getByLabelText("Target amount"), "295000.5");
    fireEvent(view.getByLabelText("Target amount"), "blur");
    expect(view.getByLabelText("Target amount").props.value).toBe("295000.50");
    fireEvent.changeText(view.getByLabelText("Starting amount"), "1234.25");
    fireEvent(view.getByLabelText("Starting amount"), "blur");
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("user-1", "device-1", "goal-1", expect.objectContaining({ targetAmountCentavos: 29_500_050, startingAmountCentavos: 123_425 })));
  });

  it("keeps the target date when the picker is dismissed", () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" goal={goal} onCancel={jest.fn()} onSaved={jest.fn()} />);
    fireEvent.press(view.getByLabelText("Target date"));
    fireEvent(view.UNSAFE_getByType(DateTimePicker), "onChange", { type: "dismissed" }, new Date(2026, 9, 21));
    expect(view.getByText("2026-12-31")).toBeTruthy();
    expect(view.UNSAFE_queryByType(DateTimePicker)).toBeNull();
  });

  it("shows a duplicate-name error when creating a goal", async () => {
    mockCreate.mockRejectedValueOnce(new LocalDbError("DUPLICATE_NAME", "duplicate"));
    const onSaved = jest.fn();
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" onCancel={jest.fn()} onSaved={onSaved} />);
    fireEvent.changeText(view.getByLabelText("Goal name"), "Travel");
    fireEvent.changeText(view.getByLabelText("Target amount"), "1000");
    selectTargetDate(view, new Date(2026, 11, 31));
    fireEvent.press(view.getByLabelText("None"));
    fireEvent.press(view.getByLabelText("Select financial account"));
    await waitFor(() => expect(view.getByLabelText("Link Main account")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Link Main account"));
    fireEvent.press(view.getByLabelText("Save savings goal"));
    await waitFor(() => expect(view.getByText("A savings goal with this name already exists. Choose a different name.")).toBeTruthy());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("explains duplicate names and clears the error when the name changes", async () => {
    mockUpdate.mockRejectedValueOnce(new LocalDbError("DUPLICATE_NAME", "duplicate"));
    const onSaved = jest.fn();
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" goal={goal} onCancel={jest.fn()} onSaved={onSaved} />);
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    await waitFor(() => expect(view.getByText("A savings goal with this name already exists. Choose a different name.")).toBeTruthy());
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.changeText(view.getByLabelText("Goal name"), "Japan trip");
    expect(view.queryByText("A savings goal with this name already exists. Choose a different name.")).toBeNull();
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(goal));
  });

  it("offers the five frequencies and saves a daily schedule", async () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" goal={goal} onCancel={jest.fn()} onSaved={jest.fn()} />);
    for (const label of ["Daily", "Weekly", "Twice a Month", "Monthly", "None"]) {
      expect(view.getByLabelText(label)).toBeTruthy();
    }
    expect(view.queryByLabelText("biweekly")).toBeNull();
    expect(view.queryByLabelText("quarterly")).toBeNull();
    expect(view.queryByLabelText("yearly")).toBeNull();
    expect(view.queryByLabelText("custom")).toBeNull();
    expect(view.queryByLabelText("Select next contribution date")).toBeNull();
    expect(view.queryByText("Next Contribution Date")).toBeNull();
    fireEvent.press(view.getByLabelText("Daily"));
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("user-1", "device-1", "goal-1", expect.objectContaining({ contributionFrequency: "daily", plannedContributionAmountCentavos: 5_000, nextContributionDate: "2026-10-18", contributionDayOfMonth: null })));
  });

  it("updates suggestions for frequency and date changes without replacing a manual amount", async () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" goal={goal} onCancel={jest.fn()} onSaved={jest.fn()} />);
    expect(view.getByText(/Suggested: ₱500.00 per contribution/)).toBeTruthy();
    fireEvent.changeText(view.getByLabelText("Planned contribution amount"), "75");
    fireEvent.press(view.getByLabelText("Daily"));
    expect(view.getByText(/Suggested: ₱13.34 per contribution/)).toBeTruthy();
    expect(view.getByLabelText("Planned contribution amount").props.value).toBe("75");
    selectTargetDate(view, new Date(2026, 9, 19));
    expect(view.getByText(/Suggested: ₱500.00 per contribution/)).toBeTruthy();
    fireEvent.press(view.getByLabelText("Use suggested amount"));
    expect(view.getByLabelText("Planned contribution amount").props.value).toBe("500");
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("user-1", "device-1", "goal-1", expect.objectContaining({ plannedContributionAmountCentavos: 50_000 })));
  });

  it("accounts for recorded activity and changes to the starting amount", () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" goal={{ ...goal, currentAmountCentavos: 40_000 }} onCancel={jest.fn()} onSaved={jest.fn()} />);
    expect(view.getByText(/Suggested: ₱300.00 per contribution/)).toBeTruthy();
    fireEvent.changeText(view.getByLabelText("Starting amount"), "200");
    expect(view.getByText(/Suggested: ₱200.00 per contribution/)).toBeTruthy();
    fireEvent.changeText(view.getByLabelText("Target amount"), "1200");
    expect(view.getByText(/Suggested: ₱300.00 per contribution/)).toBeTruthy();
    fireEvent.press(view.getByLabelText("Weekly"));
    expect(view.queryByLabelText("Use suggested amount")).toBeNull();
    fireEvent.press(view.getByLabelText("Sunday"));
    expect(view.getByLabelText("Use suggested amount")).toBeTruthy();
    fireEvent.press(view.getByLabelText("None"));
    expect(view.queryByText(/Suggested:/)).toBeNull();
  });

  it("clears the schedule when None is saved", async () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" goal={goal} onCancel={jest.fn()} onSaved={jest.fn()} />);
    fireEvent.press(view.getByLabelText("None"));
    expect(view.queryByLabelText("Planned contribution amount")).toBeNull();
    expect(view.queryByLabelText("Select next contribution date")).toBeNull();
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("user-1", "device-1", "goal-1", expect.objectContaining({ contributionFrequency: null, plannedContributionAmountCentavos: 0, autoSaveAmountCentavos: 0, nextContributionDate: null, contributionIntervalCount: null, contributionDayOfMonth: null })));
  });

  it("shows both calendar day inputs for Twice a Month", () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" goal={goal} onCancel={jest.fn()} onSaved={jest.fn()} />);
    fireEvent.press(view.getByLabelText("Twice a Month"));
    expect(view.getByText("1st day of month")).toBeTruthy();
    expect(view.getByText("2nd day of month")).toBeTruthy();
  });

  it("requires a weekly weekday and derives the occurrence from that choice", async () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" goal={goal} onCancel={jest.fn()} onSaved={jest.fn()} />);
    fireEvent.press(view.getByLabelText("Weekly"));
    for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) expect(view.getByLabelText(day)).toBeTruthy();
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    expect(view.getByText("Select a contribution day from Sunday to Saturday.")).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText("Wednesday"));
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("user-1", "device-1", "goal-1", expect.objectContaining({ contributionFrequency: "weekly", contributionDayOfWeek: 3, nextContributionDate: "2026-10-21" })));
  });

  it("requires a valid monthly date number and derives its occurrence", async () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" goal={goal} onCancel={jest.fn()} onSaved={jest.fn()} />);
    fireEvent.changeText(view.getByLabelText("Day of month"), "32");
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    expect(view.getByText("Enter a contribution date number from 1 to 31.")).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
    fireEvent.changeText(view.getByLabelText("Day of month"), "14");
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("user-1", "device-1", "goal-1", expect.objectContaining({ contributionDayOfMonth: 14, nextContributionDate: "2026-11-14" })));
  });

  it("requires two ascending date numbers for Twice a Month", async () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" goal={goal} onCancel={jest.fn()} onSaved={jest.fn()} />);
    fireEvent.press(view.getByLabelText("Twice a Month"));
    fireEvent.changeText(view.getByLabelText("First day of month"), "20");
    fireEvent.changeText(view.getByLabelText("Second day of month"), "5");
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    expect(view.getByText("Enter two date numbers from 1 to 31, with the first before the second.")).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
    fireEvent.changeText(view.getByLabelText("First day of month"), "5");
    fireEvent.changeText(view.getByLabelText("Second day of month"), "20");
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("user-1", "device-1", "goal-1", expect.objectContaining({ contributionDayOfMonth: 5, contributionSecondDayOfMonth: 20, nextContributionDate: "2026-10-20" })));
  });

  it("preserves an existing legacy cadence until explicitly changed", async () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" goal={{ ...goal, contributionFrequency: "biweekly", contributionIntervalCount: 2 }} onCancel={jest.fn()} onSaved={jest.fn()} />);
    expect(view.getByText(/Existing schedule: biweekly/)).toBeTruthy();
    fireEvent.press(view.getByLabelText("Save savings goal changes"));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("user-1", "device-1", "goal-1", expect.objectContaining({ contributionFrequency: "biweekly", contributionIntervalCount: 2 })));
  });

  it("requires an account when creating a savings goal", () => {
    const view = render(<SavingsGoalForm userId="user-1" deviceId="device-1" onCancel={jest.fn()} onSaved={jest.fn()} />);
    fireEvent.press(view.getByLabelText("Save savings goal"));
    expect(view.getByText("Select an active financial account for this savings goal.")).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

});
