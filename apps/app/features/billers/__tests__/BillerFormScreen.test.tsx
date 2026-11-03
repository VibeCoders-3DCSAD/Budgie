import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import BillerFormScreen from "../BillerFormScreen";

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockGet = jest.fn();
jest.mock("../../../local-db/repositories/scheduled-payments/scheduledPayments", () => ({
  createScheduledPayment: (...args: unknown[]) => mockCreate(...args),
  updateScheduledPayment: (...args: unknown[]) => mockUpdate(...args),
  getScheduledPayment: (...args: unknown[]) => mockGet(...args),
}));
jest.mock("../../../local-db/repositories/scheduled-payments/scheduledPaymentRecords", () => ({ listScheduledPaymentRecords: async () => [] }));
jest.mock("../../../local-db/repositories/foundations/financialFoundations", () => ({
  listAccountOptions: async () => [{ id: "acct-bpi", name: "BPI Savings", kind: "bank", currentBalanceCentavos: 100_000 }],
}));
jest.mock("../../../local-db/repositories/ledger/taxonomy", () => ({
  listSubcategories: async () => [{ id: "sub-electricity", label: "Electricity", category_id: "cat-bills" }],
  listCategories: async () => [],
}));

const props = { userId: "user-1", deviceId: "device-1", onClose: jest.fn(), onSaved: jest.fn() };

describe("BillerFormScreen", () => {
  beforeEach(() => { mockCreate.mockReset(); mockUpdate.mockReset(); mockGet.mockReset(); });

  it("marks every missing required field and does not save", async () => {
    const view = render(<BillerFormScreen {...props} />);
    fireEvent.press(await view.findByText("Add payment"));

    expect(view.getByText("Some obligation details are not valid. Correct the marked fields and try again.")).toBeTruthy();
    for (const message of ["Name is required.", "Amount is required.", "Select the account this is paid from.", "Due day must be 1-31."]) {
      expect(view.getByText(message)).toBeTruthy();
    }
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("offers the savings goal cadences and no planning toggles", async () => {
    const view = render(<BillerFormScreen {...props} />);
    for (const label of ["Daily", "Weekly", "Twice a month", "Monthly", "Yearly", "None"]) expect(await view.findByText(label)).toBeTruthy();
    for (const label of ["Every 2 weeks", "Quarterly", "Family support", "Dependent support", "Protected"]) expect(view.queryByText(label)).toBeNull();
    expect(view.getByText("Payments are kept in your Financial Plan even when money is tight.")).toBeTruthy();
  });

  it("clears a field's error once it is corrected and keeps the other entries", async () => {
    const view = render(<BillerFormScreen {...props} />);
    fireEvent.changeText(await view.findByLabelText("Amount"), "1699");
    fireEvent.press(view.getByText("Add payment"));
    fireEvent.changeText(view.getByLabelText("Name"), "Globe fiber");

    expect(view.queryByText("Name is required.")).toBeNull();
    expect(view.getByLabelText("Amount").props.value).toBe("1699");
  });

  it("turns auto-post off and disables it for a one-time payment", async () => {
    const view = render(<BillerFormScreen {...props} />);
    fireEvent.press(await view.findByLabelText("Post automatically on the due date"));
    fireEvent.press(view.getByText("None"));

    expect(view.getByLabelText("Post automatically on the due date").props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(view.getByText("Auto-post needs a repeat. Pick a frequency to turn it on.")).toBeTruthy();
  });

  it("saves edits to an existing scheduled payment", async () => {
    mockGet.mockResolvedValue({
      id: "payment-1", name: "Meralco", subcategoryId: "sub-electricity", sourceAccountId: "acct-bpi", amountCentavos: 234_000, frequency: "monthly",
      dueDayOfMonth: 5, dueSecondDayOfMonth: null, dueDayOfWeek: null, dueMonth: null, startsOn: "2026-09-01", endsOn: null, autoPost: true,
      autoPostFrom: "2026-09-01", isFamilySupport: false, isDependentSupport: false, protectedByDefault: true, notes: null, status: "active", version: 1,
    });
    mockUpdate.mockResolvedValue({});
    const view = render(<BillerFormScreen {...props} scheduledPaymentId="payment-1" />);
    fireEvent.changeText(await view.findByLabelText("Amount"), "2480");
    fireEvent.press(view.getByText("Save changes"));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith("user-1", "device-1", "payment-1", expect.objectContaining({ name: "Meralco", amountCentavos: 248_000, dueDayOfMonth: 5, autoPost: true })));
    expect(props.onSaved).toHaveBeenCalled();
  });
});
