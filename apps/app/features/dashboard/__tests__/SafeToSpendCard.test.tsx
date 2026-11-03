import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeToSpendCard } from "../components/SafeToSpendCard";

const mockGetSafeToSpend = jest.fn();
jest.mock("../../../local-db/repositories/dashboard/safeToSpend", () => ({
  getSafeToSpend: (...args: unknown[]) => mockGetSafeToSpend(...args),
}));

const data = {
  periodEnd: "2026-10-31",
  daysLeft: 13,
  plannedCentavos: 850_000,
  spentCentavos: 580_000,
  leftCentavos: 270_000,
  dailyCentavos: 20_769,
  categories: [{ allocationId: "alloc-food", label: "Food and groceries", plannedCentavos: 400_000, spentCentavos: 380_000 }],
};

describe("SafeToSpendCard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("asks for the Manila day, even when the UTC day is still the day before", async () => {
    // 20:00 UTC on Oct 17 is already 04:00 on Oct 18 in Manila.
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] }).setSystemTime(new Date("2026-10-17T20:00:00.000Z"));
    try {
      mockGetSafeToSpend.mockResolvedValue(null);
      render(<SafeToSpendCard userId="user-1" reloadKey={0} onNavigate={jest.fn()} />);
      expect(mockGetSafeToSpend).toHaveBeenCalledWith("user-1", "2026-10-18");
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows what is left, a daily amount, and the budgets closest to their limit", async () => {
    mockGetSafeToSpend.mockResolvedValue(data);
    const onNavigate = jest.fn();
    const view = render(<SafeToSpendCard userId="user-1" reloadKey={0} onNavigate={onNavigate} />);

    await waitFor(() => expect(view.getByText("₱2,700.00 left until Oct 31")).toBeTruthy());
    expect(view.getByText("About ₱207.69 a day for 13 days.")).toBeTruthy();
    expect(view.getByText("Food and groceries")).toBeTruthy();
    expect(view.getByText("₱3,800.00 / ₱4,000.00")).toBeTruthy();
    fireEvent.press(view.getByText("View all budgets"));
    expect(onNavigate).toHaveBeenCalledWith("financial-plan");
  });

  it("says how far over budget the cycle is", async () => {
    mockGetSafeToSpend.mockResolvedValue({ ...data, leftCentavos: -50_000, dailyCentavos: 0, daysLeft: 1 });
    const view = render(<SafeToSpendCard userId="user-1" reloadKey={0} onNavigate={jest.fn()} />);

    await waitFor(() => expect(view.getByText("₱500.00 over budget")).toBeTruthy());
  });

  it("invites the user to create a plan when none covers today", async () => {
    mockGetSafeToSpend.mockResolvedValue(null);
    const onNavigate = jest.fn();
    const view = render(<SafeToSpendCard userId="user-1" reloadKey={0} onNavigate={onNavigate} />);

    await waitFor(() => expect(view.getByText("Create this month's Financial Plan to see how much you can safely spend.")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Open Financial Plan"));
    expect(onNavigate).toHaveBeenCalledWith("financial-plan");
  });
});
