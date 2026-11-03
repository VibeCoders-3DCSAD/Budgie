import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import BillerDetailScreen from "../BillerDetailScreen";
import RecordBillerPaymentScreen from "../RecordBillerPaymentScreen";
import { addDays, localToday, previousDueDate } from "../schedule";

const mockGet = jest.fn();
const mockRecords = jest.fn();
const mockArchive = jest.fn();
const mockRecord = jest.fn();
const mockGetSavingsExpenseFunding = jest.fn();
jest.mock("../../../local-db/repositories/scheduled-payments/scheduledPayments", () => ({
  getScheduledPayment: (...args: unknown[]) => mockGet(...args),
  setScheduledPaymentArchived: (...args: unknown[]) => mockArchive(...args),
  recordScheduledPayment: (...args: unknown[]) => mockRecord(...args),
  deleteScheduledPayment: jest.fn(),
  deleteScheduledPaymentRecord: jest.fn(),
}));
jest.mock("../../../local-db/repositories/scheduled-payments/scheduledPaymentRecords", () => ({
  listScheduledPaymentRecords: (...args: unknown[]) => mockRecords(...args),
  listPaidByOccurrence: async () => new Map(),
}));
jest.mock("../../../local-db/repositories/foundations/financialFoundations", () => ({
  listFinancialAccounts: async () => [{ id: "acct-bpi", name: "BPI Debit", status: "active", currentBalanceCentavos: 0 }],
  listAccountOptions: async () => [{ id: "acct-bpi", name: "BPI Debit", kind: "bank", currentBalanceCentavos: 0 }],
}));
jest.mock("../../../local-db/repositories/ledger/taxonomy", () => ({ listSubcategories: async () => [{ id: "sub-electricity", label: "Electricity" }] }));
jest.mock("../../../local-db/repositories/savings/savingsExpenseFunding", () => ({ getSavingsExpenseFunding: (...args: unknown[]) => mockGetSavingsExpenseFunding(...args) }));
jest.mock("../../../components/Toast", () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const today = localToday();
const meralco = {
  id: "meralco", name: "Meralco", subcategoryId: "sub-electricity", sourceAccountId: "acct-bpi", amountCentavos: 248_000, frequency: "monthly",
  dueDayOfMonth: 5, dueSecondDayOfMonth: null, dueDayOfWeek: null, dueMonth: null, startsOn: addDays(today, -400), endsOn: null, autoPost: false,
  autoPostFrom: null, isFamilySupport: false, isDependentSupport: false, protectedByDefault: true, notes: null, status: "active", version: 1,
};
const lastDue = previousDueDate(meralco as never, addDays(today, -1))!;

describe("BillerDetailScreen", () => {
  const props = { userId: "user-1", deviceId: "device-1", scheduledPaymentId: "meralco", syncVersion: 0, onEdit: jest.fn(), onRecordPayment: jest.fn(), onDeleted: jest.fn(), onSyncRequested: jest.fn() };
  beforeEach(() => { jest.clearAllMocks(); mockGet.mockResolvedValue(meralco); });

  it("shows a partly paid past occurrence as overdue with what remains", async () => {
    mockRecords.mockResolvedValue([{ id: "r1", scheduledPaymentId: "meralco", transactionId: "t1", occurrenceDate: lastDue, paymentDate: lastDue, amountCentavos: 48_000, source: "manual", notes: null, version: 1 }]);
    const view = render(<BillerDetailScreen {...props} />);

    expect(await view.findByText("This obligation occurrence is overdue and remains unpaid. Record a payment or review its schedule.")).toBeTruthy();
    expect(view.getByText("₱2,000.00")).toBeTruthy();
    fireEvent.press(view.getByText("Record payment"));
    expect(props.onRecordPayment).toHaveBeenCalled();
  });

  it("shows the empty payment history and archives after confirmation", async () => {
    mockRecords.mockResolvedValue([]);
    mockArchive.mockResolvedValue(undefined);
    const view = render(<BillerDetailScreen {...props} />);

    expect(await view.findByText("This obligation has no recorded payments. Record a payment when one is made.")).toBeTruthy();
    fireEvent.press(view.getByText("Archive"));
    expect(view.getByText("Archiving this obligation removes it from current planning but preserves its history. Cancel to keep it active or confirm archiving to continue.")).toBeTruthy();
    fireEvent.press(view.getAllByText("Archive").at(-1)!);
    await waitFor(() => expect(mockArchive).toHaveBeenCalledWith("user-1", "device-1", "meralco", true));
  });

  it("shows payment history five at a time until every payment is shown", async () => {
    mockRecords.mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({ id: `r${index}`, scheduledPaymentId: "meralco", transactionId: `t${index}`, occurrenceDate: lastDue, paymentDate: addDays(lastDue, -index), amountCentavos: 1_000, source: "manual", notes: null, settlesOccurrence: false, version: 1 })));
    const view = render(<BillerDetailScreen {...props} />);

    await view.findByText("Show 5 more");
    expect(view.getAllByLabelText(/ paid /)).toHaveLength(5);
    fireEvent.press(view.getByText("Show 5 more"));
    expect(view.getAllByLabelText(/ paid /)).toHaveLength(10);
    fireEvent.press(view.getByText("Show 2 more"));
    expect(view.getAllByLabelText(/ paid /)).toHaveLength(12);
    expect(view.queryByText(/^Show \d+ more$/)).toBeNull();
  });

  it("explains that archived payments are out of planning", async () => {
    mockGet.mockResolvedValue({ ...meralco, status: "archived" });
    mockRecords.mockResolvedValue([]);
    const view = render(<BillerDetailScreen {...props} />);

    expect(await view.findByText("This obligation is archived and excluded from current planning. Restore it before managing new payments.")).toBeTruthy();
    expect(view.queryByText("Record payment")).toBeNull();
    expect(view.getByText("Restore")).toBeTruthy();
  });
});

describe("RecordBillerPaymentScreen", () => {
  const props = { userId: "user-1", deviceId: "device-1", scheduledPaymentId: "meralco", onClose: jest.fn(), onRecorded: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(meralco);
    mockGetSavingsExpenseFunding.mockResolvedValue({ accountId: "acct-bpi", unallocatedCentavos: 248_000, requiredWithdrawalCentavos: 0, existingShortfallCentavos: 0, goals: [] });
    mockRecord.mockResolvedValue(undefined);
  });

  it("defaults to the current occurrence's full amount and the pay-from account", async () => {
    const view = render(<RecordBillerPaymentScreen {...props} />);
    await view.findByText("Pay Meralco");
    fireEvent.press(view.getByText("Record payment"));

    await waitFor(() => expect(mockRecord).toHaveBeenCalledWith("user-1", "device-1", expect.objectContaining({ scheduledPaymentId: "meralco", occurrenceDate: lastDue, amountCentavos: 248_000, paymentDate: today, sourceAccountId: "acct-bpi" })));
    expect(props.onRecorded).toHaveBeenCalledWith("₱2,480.00 recorded for Meralco.");
  });

  it("requires a positive amount", async () => {
    const view = render(<RecordBillerPaymentScreen {...props} />);
    fireEvent.changeText(await view.findByLabelText("Payment amount"), "0");
    fireEvent.press(view.getByText("Record payment"));

    expect(view.getByText("Enter a positive payment amount.")).toBeTruthy();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("refuses an archived payment", async () => {
    mockGet.mockResolvedValue({ ...meralco, status: "archived" });
    const view = render(<RecordBillerPaymentScreen {...props} />);
    expect(await view.findByText("This obligation is no longer available for payments. Choose an active obligation instead.")).toBeTruthy();
  });
});
