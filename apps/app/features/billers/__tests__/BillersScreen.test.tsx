import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import BillersScreen from "../BillersScreen";
import { addDays } from "../schedule";
import { manilaToday } from "../../../lib/dates";

const mockSummaries = jest.fn();
const mockRecord = jest.fn();
const mockPostDue = jest.fn();
const mockShowToast = jest.fn();
jest.mock("../../../local-db/repositories/scheduled-payments/scheduledPayments", () => ({
  listScheduledPaymentSummaries: (...args: unknown[]) => mockSummaries(...args),
  postDueScheduledPayments: (...args: unknown[]) => mockPostDue(...args),
  recordScheduledPayment: (...args: unknown[]) => mockRecord(...args),
  deleteScheduledPayment: jest.fn(),
  setScheduledPaymentAutoPost: jest.fn(),
}));
jest.mock("../../../local-db/repositories/foundations/financialFoundations", () => ({ listFinancialAccounts: async () => [{ id: "acct-bpi", name: "BPI Savings" }] }));
jest.mock("../../../local-db/repositories/ledger/taxonomy", () => ({
  listCategories: async () => [{ id: "cat-housing", label: "Housing", slug: "housing" }, { id: "cat-gov", label: "Government", slug: "government" }],
  listSubcategories: async () => [{ id: "sub-rent", label: "Rent", slug: "rent", category_id: "cat-housing" }, { id: "sub-sss", label: "SSS", slug: "sss", category_id: "cat-gov" }],
}));
jest.mock("../../../components/Toast", () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const today = manilaToday();
const base = { dueDayOfMonth: 1, dueSecondDayOfMonth: null, dueDayOfWeek: null, dueMonth: null, startsOn: "2026-01-01", endsOn: null, autoPostFrom: null, isFamilySupport: false, isDependentSupport: false, protectedByDefault: true, notes: null, status: "active", version: 1, sourceAccountId: "acct-bpi" };
const rent = { ...base, id: "rent", name: "Rent", subcategoryId: "sub-rent", amountCentavos: 1_200_000, frequency: "monthly", autoPost: true, current: { dueDate: addDays(today, 10), status: "upcoming", scheduledCentavos: 1_200_000, paidCentavos: 0, remainingCentavos: 1_200_000 } };
const sss = { ...base, id: "sss", name: "SSS contribution", subcategoryId: "sub-sss", amountCentavos: 135_000, frequency: "monthly", autoPost: false, current: { dueDate: addDays(today, 3), status: "partially_paid", scheduledCentavos: 135_000, paidCentavos: 35_000, remainingCentavos: 100_000 } };

const props = { userId: "user-1", deviceId: "device-1", syncVersion: 0, onAdd: jest.fn(), onEdit: jest.fn(), onOpen: jest.fn(), onSyncRequested: jest.fn() };

describe("BillersScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostDue.mockResolvedValue(0);
    mockSummaries.mockImplementation(async (_user: string, status = "active") => status === "active" ? [rent, sss] : []);
  });

  it("lists payments with their category and schedule, and filters to those due soon", async () => {
    const view = render(<BillersScreen {...props} />);

    expect(await view.findByText("Housing · 1st · Auto-post")).toBeTruthy();
    expect(view.getByText("Government · Partially paid")).toBeTruthy();
    expect(view.getByText("2 billers and remittances")).toBeTruthy();

    fireEvent.press(view.getByText("Due soon"));
    expect(view.queryByText("Rent")).toBeNull();
    expect(view.getByText("SSS contribution")).toBeTruthy();
  });

  it("shows the filtered empty state", async () => {
    mockSummaries.mockImplementation(async (_user: string, status = "active") => status === "active" ? [rent] : []);
    const view = render(<BillersScreen {...props} />);
    fireEvent.press(await view.findByText("Due soon"));

    expect(view.getByText("Nothing falls in the next 3 days. Tap All to see every payment.")).toBeTruthy();
  });

  it("prompts to add the first payment", async () => {
    mockSummaries.mockResolvedValue([]);
    const view = render(<BillersScreen {...props} />);
    fireEvent.press(await view.findByText("Add a biller or remittance"));

    expect(view.getByText("Add rent, a bill or a contribution. Budgie deducts it from your budget on the due date.")).toBeTruthy();
    expect(props.onAdd).toHaveBeenCalled();
  });

  it("offers a retry when payments cannot be read", async () => {
    mockSummaries.mockRejectedValueOnce(new Error("disk")).mockImplementation(async () => []);
    const view = render(<BillersScreen {...props} />);
    expect(await view.findByText("Budgie cannot read your billers and remittances.")).toBeTruthy();

    fireEvent.press(view.getByText("Try again"));
    expect(await view.findByText("No billers or remittances yet")).toBeTruthy();
  });

  it("posts the remaining amount of the current occurrence from the row menu", async () => {
    mockRecord.mockResolvedValue(undefined);
    const view = render(<BillersScreen {...props} />);
    fireEvent(await view.findByLabelText("SSS contribution"), "longPress");
    fireEvent.press(view.getByLabelText("Post now"));

    await waitFor(() => expect(mockRecord).toHaveBeenCalledWith("user-1", "device-1", expect.objectContaining({ scheduledPaymentId: "sss", occurrenceDate: addDays(today, 3), amountCentavos: 100_000, paymentDate: today, sourceAccountId: "acct-bpi" })));
    expect(mockShowToast).toHaveBeenCalledWith("₱1,000.00 recorded for SSS contribution.", "success");
  });

  it("asks for sync after auto-posting due payments", async () => {
    mockPostDue.mockResolvedValue(2);
    render(<BillersScreen {...props} />);
    await waitFor(() => expect(props.onSyncRequested).toHaveBeenCalled());
  });
});
