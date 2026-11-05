import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import SavingsAllocationReview from "../SavingsAllocationReview";

const mockGetCurrentSavingsEnvelopeAllocation = jest.fn();

jest.mock("../../../../local-db/repositories/savings/savingsAllocationPreferences", () => ({
  getSavingsAllocationStrategy: jest.fn().mockResolvedValue("avalanche"),
  saveSavingsAllocationStrategy: jest.fn(),
}));
jest.mock("../../queries/savingsEnvelopeAllocationQueries", () => ({
  getCurrentSavingsEnvelopeAllocation: (...args: unknown[]) => mockGetCurrentSavingsEnvelopeAllocation(...args),
}));

describe("SavingsAllocationReview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentSavingsEnvelopeAllocation.mockResolvedValue(null);
  });

  it("identifies Financial Plan reservations and refreshes after sync", async () => {
    const view = render(<SavingsAllocationReview userId="user-1" deviceId="device-1" syncVersion={0} />);

    await waitFor(() => expect(view.getByText("Financial Plan for savings")).toBeTruthy());
    view.rerender(<SavingsAllocationReview userId="user-1" deviceId="device-1" syncVersion={1} />);

    await waitFor(() => expect(mockGetCurrentSavingsEnvelopeAllocation).toHaveBeenCalledTimes(2));
  });

  it("shows monthly allocations, completion status, and the budget less recorded contributions", async () => {
    mockGetCurrentSavingsEnvelopeAllocation.mockResolvedValue({ envelopeCentavos: 1_000_000, remainingToContributeCentavos: 550_000, contributions: [
      { id: "goal-1", name: "Emergency fund", dueDate: "2026-10-20", plannedCentavos: 400_000, recordedCentavos: 400_000 },
      { id: "goal-2", name: "Japan trip", dueDate: null, plannedCentavos: 600_000, recordedCentavos: 50_000 },
    ], proposals: [] });
    const view = render(<SavingsAllocationReview userId="user-1" deviceId="device-1" />);

    await waitFor(() => expect(view.getByText("Savings Budget this month")).toBeTruthy());
    expect(view.getByText("₱10,000.00")).toBeTruthy();
    expect(view.getByLabelText("Emergency fund, ₱4,000.00, Done, Due Oct 20, 2026")).toBeTruthy();
    expect(view.getByLabelText("Japan trip, ₱6,000.00, Partial, No due date")).toBeTruthy();
    expect(view.getByText("Due Oct 20, 2026")).toBeTruthy();
    expect(view.getByText("Remaining to contribute")).toBeTruthy();
    expect(view.getByText("₱5,500.00")).toBeTruthy();
    expect(view.queryByText("Savings left to contribute")).toBeNull();
    expect(view.queryByText("Shortfall")).toBeNull();
    expect(view.queryByText("Unallocated")).toBeNull();
    expect(view.getByText("₱6,000.00")).toBeTruthy();
  });

  it("keeps the surplus strategy collapsed until the user asks to change it", async () => {
    mockGetCurrentSavingsEnvelopeAllocation.mockResolvedValue({ envelopeCentavos: 0, remainingToContributeCentavos: 0, contributions: [], proposals: [] });
    const view = render(<SavingsAllocationReview userId="user-1" deviceId="device-1" />);

    await waitFor(() => expect(view.getByText("Biggest need first")).toBeTruthy());
    expect(view.queryByLabelText("Use snowball savings allocation")).toBeNull();
    fireEvent.press(view.getByLabelText("Change surplus strategy"));
    expect(view.getByLabelText("Use snowball savings allocation")).toBeTruthy();
  });

  it("uses the Philippine date at the month boundary", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-31T16:30:00Z") });
    try {
      render(<SavingsAllocationReview userId="user-1" deviceId="device-1" />);
      await waitFor(() => expect(mockGetCurrentSavingsEnvelopeAllocation).toHaveBeenCalledWith("user-1", "2026-11-01"));
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows partial for ₱6,020.41 toward ₱7,692.31 and not done for an unpaid goal", async () => {
    mockGetCurrentSavingsEnvelopeAllocation.mockResolvedValue({ envelopeCentavos: 2_053_600, remainingToContributeCentavos: 1_451_559, contributions: [
      { id: "goal-1", name: "Emergency Fund", dueDate: "2026-10-30", plannedCentavos: 769_231, recordedCentavos: 602_041 },
      { id: "rtx", name: "RTX 5090", dueDate: "2026-10-15", plannedCentavos: 1_284_369, recordedCentavos: 0 },
    ], proposals: [] });
    const view = render(<SavingsAllocationReview userId="user-1" deviceId="device-1" />);

    await waitFor(() => expect(view.getByLabelText("Emergency Fund, ₱7,692.31, Partial, Due Oct 30, 2026")).toBeTruthy());
    expect(view.getByLabelText("RTX 5090, ₱12,843.69, Not done, Due Oct 15, 2026")).toBeTruthy();
    expect(view.getByText("₱14,515.59")).toBeTruthy();
  });

  it("shows surplus no goal can take as its own row", async () => {
    mockGetCurrentSavingsEnvelopeAllocation.mockResolvedValue({ envelopeCentavos: 1_300_000, unallocatedCentavos: 800_000, remainingToContributeCentavos: 400_000, contributions: [
      { id: "goal-1", name: "Emergency fund", dueDate: null, plannedCentavos: 500_000, recordedCentavos: 100_000 },
    ], proposals: [] });
    const view = render(<SavingsAllocationReview userId="user-1" deviceId="device-1" />);

    await waitFor(() => expect(view.getByText("Not assigned to a goal")).toBeTruthy());
    expect(view.getByLabelText("Not assigned to a goal, ₱8,000.00. We suggest adding it to your other goals.")).toBeTruthy();
    expect(view.getByText("₱4,000.00")).toBeTruthy();
  });

  it("hides the unassigned row when every peso has a goal", async () => {
    mockGetCurrentSavingsEnvelopeAllocation.mockResolvedValue({ envelopeCentavos: 500_000, unallocatedCentavos: 0, remainingToContributeCentavos: 500_000, contributions: [
      { id: "goal-1", name: "Emergency fund", dueDate: null, plannedCentavos: 500_000, recordedCentavos: 0 },
    ], proposals: [] });
    const view = render(<SavingsAllocationReview userId="user-1" deviceId="device-1" />);

    await waitFor(() => expect(view.getByText("Savings Budget this month")).toBeTruthy());
    expect(view.queryByText("Not assigned to a goal")).toBeNull();
  });
});
