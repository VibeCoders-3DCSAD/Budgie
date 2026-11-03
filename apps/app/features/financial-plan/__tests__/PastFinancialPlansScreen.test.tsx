import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import PastFinancialPlansScreen from "../PastFinancialPlansScreen";

const mockListCompletedFinancialPlans = jest.fn();

jest.mock("../../../local-db/repositories/financial-plans/financialPlans", () => ({
  listCompletedFinancialPlans: (...args: unknown[]) => mockListCompletedFinancialPlans(...args),
}));

jest.mock("../../../lib/dates", () => ({ ...jest.requireActual("../../../lib/dates"), manilaToday: () => "2026-11-15" }));

const plans = [
  { id: "plan-oct", periodStart: "2026-10-01", periodEnd: "2026-10-31", availableFundsCentavos: 100_000, shortfallCentavos: null, plannedTotalCentavos: 90_000 },
  { id: "plan-sep", periodStart: "2026-09-01", periodEnd: "2026-09-30", availableFundsCentavos: 80_000, shortfallCentavos: 5_000, plannedTotalCentavos: 85_000 },
];

describe("PastFinancialPlansScreen", () => {
  beforeEach(() => mockListCompletedFinancialPlans.mockReset());

  it("renders completed plan summaries in the order returned", async () => {
    mockListCompletedFinancialPlans.mockResolvedValue(plans);
    const view = render(<PastFinancialPlansScreen userId="user-1" onOpenPlan={jest.fn()} />);

    await waitFor(() => expect(view.getByText("October 2026")).toBeTruthy());
    const months = view.getAllByText(/^(October|September) 2026$/).map((node) => node.props.children);
    expect(months).toEqual(["October 2026", "September 2026"]);
    expect(view.getByText("₱900.00")).toBeTruthy();
    expect(view.getByText("₱850.00")).toBeTruthy();
    expect(view.getByText("Shortfall ₱50.00")).toBeTruthy();
    expect(view.getAllByText(/^Shortfall/)).toHaveLength(1);
    expect(mockListCompletedFinancialPlans).toHaveBeenCalledWith("user-1", "2026-11-15");
  });

  it("shows an empty state when there are no completed plans", async () => {
    mockListCompletedFinancialPlans.mockResolvedValue([]);
    const view = render(<PastFinancialPlansScreen userId="user-1" onOpenPlan={jest.fn()} />);

    await waitFor(() => expect(view.getByText("No completed plans yet")).toBeTruthy());
  });

  it("shows an error state when plans cannot be loaded", async () => {
    mockListCompletedFinancialPlans.mockRejectedValue(new Error("db locked"));
    const view = render(<PastFinancialPlansScreen userId="user-1" onOpenPlan={jest.fn()} />);

    await waitFor(() => expect(view.getByText("Past plans unavailable")).toBeTruthy());
    expect(view.queryByText("db locked")).toBeNull();
  });

  it("opens a plan when its row is tapped", async () => {
    mockListCompletedFinancialPlans.mockResolvedValue(plans);
    const onOpenPlan = jest.fn();
    const view = render(<PastFinancialPlansScreen userId="user-1" onOpenPlan={onOpenPlan} />);

    await waitFor(() => expect(view.getByLabelText("Open September 2026 plan")).toBeTruthy());
    fireEvent.press(view.getByLabelText("Open September 2026 plan"));
    expect(onOpenPlan).toHaveBeenCalledWith("plan-sep");
  });
});
