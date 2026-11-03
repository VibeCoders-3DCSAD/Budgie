import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { DeviceEventEmitter, KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import IncomeSourceFormScreen from "../IncomeSourceFormScreen";

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockGet = jest.fn();
jest.mock("../../../local-db/repositories/foundations/financialFoundations", () => {
  const actual = jest.requireActual("../../../local-db/repositories/foundations/financialFoundations");
  return {
    incomeScheduleError: actual.incomeScheduleError,
    createIncomeSource: (...args: unknown[]) => mockCreate(...args),
    updateIncomeSource: (...args: unknown[]) => mockUpdate(...args),
    getIncomeSource: (...args: unknown[]) => mockGet(...args),
    // listAccountOptions returns active accounts only; financialAccounts.test.ts covers that filter.
    listAccountOptions: async () => [
      { id: "acct-bpi", name: "BPI Savings", kind: "savings", currentBalanceCentavos: 4_218_000 },
    ],
  };
});
jest.mock("../../../local-db/repositories/ledger/taxonomy", () => ({
  listSubcategories: async () => [{ id: "sub-salary", label: "Salary and Wages" }, { id: "sub-business", label: "Business Income" }],
}));

const props = { userId: "user-1", deviceId: "device-1", onClose: jest.fn(), onSaved: jest.fn() };

describe("IncomeSourceFormScreen", () => {
  beforeEach(() => { mockCreate.mockReset(); mockUpdate.mockReset(); mockGet.mockReset(); props.onSaved.mockReset(); });

  it.each([undefined, "income-1"])("shrinks the Android form above the amount keyboard (source: %s)", async (incomeSourceId) => {
    mockGet.mockResolvedValue({
      id: "income-1", name: "Salary", frequency: "monthly", destinationAccountId: "acct-bpi", subcategoryId: "sub-salary",
      expectedAmountCentavos: 1_000_000, paydayDayOfMonth: 15, paydaySecondDayOfMonth: null, paydayDayOfWeek: null, notes: null,
    });
    const platform = jest.replaceProperty(Platform, "OS", "android");
    const view = render(<IncomeSourceFormScreen {...props} incomeSourceId={incomeSourceId} />);
    try {
      const amount = await view.findByLabelText("Expected amount");
      const form = view.UNSAFE_getByType(KeyboardAvoidingView).findAllByType(View)[0];
      await act(async () => {
        fireEvent(form, "layout", {
          persist: jest.fn(),
          nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 800 } },
        });
      });
      fireEvent(amount, "focus");
      await act(async () => {
        DeviceEventEmitter.emit("keyboardDidShow", {
          duration: 0,
          endCoordinates: { screenX: 0, screenY: 500, width: 375, height: 300 },
        });
      });
      expect(StyleSheet.flatten(form.props.style).height).toBe(500);
      fireEvent.changeText(amount, "12000");
      expect(view.getByLabelText("Expected amount").props.value).toBe("12000");
      await act(async () => { DeviceEventEmitter.emit("keyboardDidHide", {}); });
      expect(StyleSheet.flatten(form.props.style).height).toBeUndefined();
    } finally {
      view.unmount();
      platform.restore();
    }
  });

  it("offers only the four income frequencies", async () => {
    const view = render(<IncomeSourceFormScreen {...props} />);
    for (const label of ["Monthly", "Twice a month", "Every week", "Every day"]) expect(await view.findByText(label)).toBeTruthy();
    for (const label of ["Stable", "Variable", "Irregular", "Custom", "Every 2 weeks"]) expect(view.queryByText(label)).toBeNull();
  });

  it("asks for one payday monthly and Date 1 and Date 2 twice a month", async () => {
    const view = render(<IncomeSourceFormScreen {...props} />);
    expect(await view.findByLabelText("Payday")).toBeTruthy();
    fireEvent.press(view.getByText("Twice a month"));
    expect(view.getByLabelText("Date 1")).toBeTruthy();
    expect(view.getByLabelText("Date 2")).toBeTruthy();
    expect(view.queryByLabelText("Payday")).toBeNull();
  });

  it("marks missing fields and does not save", async () => {
    const view = render(<IncomeSourceFormScreen {...props} />);
    await view.findByText("Monthly");
    fireEvent.press(view.getAllByText("Add income source").at(-1)!);
    for (const message of ["Name is required.", "Destination account is required.", "Income category is required.", "Enter a payday from 1 to 31.", "Expected amount must be greater than zero."]) {
      expect(view.getByText(message)).toBeTruthy();
    }
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("warns about short months and rejects twice-a-month days that collide in February", async () => {
    const view = render(<IncomeSourceFormScreen {...props} />);
    fireEvent.press(await view.findByText("Twice a month"));
    fireEvent.changeText(view.getByLabelText("Date 1"), "28");
    fireEvent.changeText(view.getByLabelText("Date 2"), "31");
    expect(view.getByText(/Days 29, 30 and 31 become the 28th in February/)).toBeTruthy();
    fireEvent.press(view.getAllByText("Add income source").at(-1)!);
    expect(view.getByText(/^Date 1 must be the 27th or earlier/)).toBeTruthy();
  });

  it("saves a twice-a-month income source picked from the sheets", async () => {
    mockCreate.mockResolvedValue({});
    const view = render(<IncomeSourceFormScreen {...props} />);
    fireEvent.changeText(await view.findByLabelText("Name"), "Salary");
    fireEvent.press(view.getByLabelText("Destination account *: Select account"));
    expect(await view.findByText("BPI Savings")).toBeTruthy();
    fireEvent.press(await view.findByText("BPI Savings"));
    fireEvent.press(view.getByLabelText("Income category *: Select category"));
    fireEvent.changeText(view.getByLabelText("Search categories"), "salary");
    expect(view.queryByText("Business Income")).toBeNull();
    fireEvent.press(view.getByText("Salary and Wages"));
    fireEvent.press(view.getByText("Twice a month"));
    fireEvent.changeText(view.getByLabelText("Date 1"), "15");
    fireEvent.changeText(view.getByLabelText("Date 2"), "30");
    fireEvent.changeText(view.getByLabelText("Expected amount"), "40000");
    fireEvent.press(view.getAllByText("Add income source").at(-1)!);

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith("Your income source was added."));
    expect(mockCreate).toHaveBeenCalledWith("user-1", "device-1", {
      name: "Salary", destinationAccountId: "acct-bpi", subcategoryId: "sub-salary", expectedAmountCentavos: 4_000_000,
      frequency: "semi_monthly", paydayDayOfMonth: 15, paydaySecondDayOfMonth: 30, paydayDayOfWeek: null, notes: null,
    });
  });

  it("loads an existing source and saves edits", async () => {
    mockGet.mockResolvedValue({
      id: "income-1", name: "Salary", frequency: "weekly", destinationAccountId: "acct-bpi", subcategoryId: "sub-salary",
      expectedAmountCentavos: 1_000_000, paydayDayOfMonth: null, paydaySecondDayOfMonth: null, paydayDayOfWeek: 5, notes: null,
    });
    mockUpdate.mockResolvedValue({});
    const view = render(<IncomeSourceFormScreen {...props} incomeSourceId="income-1" />);
    expect(await view.findByText("Edit income source")).toBeTruthy();
    expect(view.getByLabelText("Fri").props.accessibilityState).toEqual({ selected: true });
    fireEvent.changeText(view.getByLabelText("Expected amount"), "12000");
    fireEvent.press(view.getByText("Save changes"));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith("Your income source changes were saved."));
    expect(mockUpdate).toHaveBeenCalledWith("user-1", "device-1", "income-1", expect.objectContaining({ expectedAmountCentavos: 1_200_000, frequency: "weekly", paydayDayOfWeek: 5 }));
  });
});
