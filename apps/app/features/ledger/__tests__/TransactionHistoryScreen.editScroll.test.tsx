import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import TransactionHistoryScreen from "../TransactionHistoryScreen";
import { clearTransactionCache } from "../transactionCache";

const mockListTransactions = jest.fn();
const mockGetTransaction = jest.fn();
const mockShowToast = jest.fn();

jest.mock("../../../local-db/repositories/ledger/ledger", () => ({
  listTransactions: (...args: unknown[]) => mockListTransactions(...args),
  getTransactionTotals: () => Promise.resolve({ income_centavos: 0, expense_centavos: 1_000 }),
  getTransaction: (...args: unknown[]) => mockGetTransaction(...args),
  deleteTransaction: jest.fn(),
}));
jest.mock("../../../local-db/repositories/credit-cards/creditCardInstallments", () => ({ getCreditCardPurchaseMetadataForTransaction: jest.fn() }));
// Never resolves, so the category list does not update state after a test ends.
jest.mock("../../../local-db/repositories/ledger/taxonomy", () => ({ listCategories: () => new Promise(() => {}) }));
jest.mock("../../../local-db/repositories/alerts/unusualSpending", () => ({ confirmRecurringSpending: jest.fn() }));
jest.mock("../../../local-db/sync/runSync", () => ({ runSync: jest.fn() }));
jest.mock("../../../components/Toast", () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock("../../../components/KebabTooltip", () => ({ onEdit }: { onEdit: () => void }) => {
  const { Pressable: MockPressable, Text: MockText } = require("react-native");
  return <MockPressable onPress={onEdit}><MockText>Edit</MockText></MockPressable>;
});
// The row the tour points at uses the tour's menu instead; stub it the same way.
jest.mock("../../onboarding-tour/components/TourKebabMenu", () => ({
  TourKebabMenu: ({ onEdit }: { onEdit: () => void }) => {
    const { Pressable: MockPressable, Text: MockText } = require("react-native");
    return <MockPressable onPress={onEdit}><MockText>Edit</MockText></MockPressable>;
  },
}));
jest.mock("../NewTransactionScreen", () => ({ onClose }: { onClose: () => void }) => {
  const { Pressable: MockPressable, Text: MockText } = require("react-native");
  return <MockPressable onPress={onClose}><MockText>Close edit form</MockText></MockPressable>;
});

const transaction = {
  id: "tx-1",
  name: "Groceries",
  transaction_type: "expense",
  transaction_date: "2026-10-01",
  amount_centavos: 1_000,
  category_label: null,
  financial_account_name: null,
  icon_key: null,
  color_hex: null,
  created_at: "2026-10-01T00:00:00Z",
  row_id: 1,
};

describe("TransactionHistoryScreen edit scroll", () => {
  beforeEach(() => {
    clearTransactionCache();
    mockListTransactions.mockReset();
    mockListTransactions.mockResolvedValue([transaction]);
    mockGetTransaction.mockResolvedValue(transaction);
    mockShowToast.mockReset();
  });

  it("returns the list to the offset it had when Edit was opened", async () => {
    let offset = 840;
    const scrollTo = jest.fn();
    const view = render(
      <TransactionHistoryScreen userId="user-1" deviceId="device-1" accessToken="token" unusualSpending={null} onUnusualSpendingDismissed={() => {}} onNewTransaction={() => {}} getScrollOffset={() => offset} scrollTo={scrollTo} />,
    );
    await waitFor(() => expect(view.getByText("Groceries")).toBeTruthy());

    fireEvent.press(view.getByText("Edit"));
    await waitFor(() => expect(view.getByText("Close edit form")).toBeTruthy());
    // Scrolling the edit form moves the shared scroll view.
    offset = 120;

    fireEvent.press(view.getByText("Close edit form"));
    await waitFor(() => expect(view.queryByText("Close edit form")).toBeNull());
    // Restored on layout, once the shell's scroll view is tall enough again; later layouts leave it alone.
    fireEvent(view.getByText("Groceries"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 2_000 } } });
    fireEvent(view.getByText("Groceries"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 2_400 } } });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(840);
    await act(async () => {});
  });

  it("explains how to replace an uncategorized biller payment before opening the edit form", async () => {
    mockListTransactions.mockResolvedValue([{ ...transaction, is_scheduled_payment: true }]);
    const view = render(<TransactionHistoryScreen userId="user-1" deviceId="device-1" accessToken="token" unusualSpending={null} onUnusualSpendingDismissed={() => {}} onNewTransaction={() => {}} />);
    fireEvent.press(await view.findByText("Edit"));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("This transaction pays a biller or remittance. Delete it and record the payment again.", "danger"));
    expect(view.queryByText("Close edit form")).toBeNull();
  });
});
