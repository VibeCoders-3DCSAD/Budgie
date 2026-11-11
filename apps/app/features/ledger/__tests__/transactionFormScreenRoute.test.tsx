jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("react-native").View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("../../auth/components/AccessProvider", () => ({ useSession: () => ({ accessToken: "token", userId: "user-1", deviceId: "device-1" }) }));
jest.mock("../services/loadTransactionForm", () => ({ loadTransactionForm: jest.fn() }));
jest.mock("../NewTransactionScreen", () => {
  const { Pressable, Text } = require("react-native");
  return function NewTransactionScreen(props: { transaction?: { id: string }; onClose: () => void; onCreated: (insight: unknown) => void }) {
    return <>
      <Text>{props.transaction ? `editing:${props.transaction.id}` : "new"}</Text>
      <Pressable accessibilityLabel="close" onPress={props.onClose} />
      <Pressable accessibilityLabel="create" onPress={() => props.onCreated({ id: "insight" })} />
    </>;
  };
});

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import TransactionFormRoute from "../../../app/(app)/(shell)/activity/new";
import { loadTransactionForm } from "../services/loadTransactionForm";
import { useTransactionFormStore } from "../stores/useTransactionFormStore";
import { ROUTES } from "../../../routes";

beforeEach(() => {
  jest.clearAllMocks();
  useTransactionFormStore.setState({ formVersion: 0, pendingUnusualSpending: null });
});

describe("/activity/new", () => {
  it("refuses malformed params without touching the database", async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ transactionId: "' OR 1=1 --" });
    const screen = render(<TransactionFormRoute />);
    await waitFor(() => expect(screen.getByText("This transaction can't be opened")).toBeTruthy());
    expect(loadTransactionForm).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("Close"));
    expect(router.back).toHaveBeenCalled();
  });

  it("refuses records the user does not own", async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ transactionId: "tx-other" });
    jest.mocked(loadTransactionForm).mockResolvedValue(null);
    const screen = render(<TransactionFormRoute />);
    await waitFor(() => expect(screen.getByText("This transaction can't be opened")).toBeTruthy());
    expect(loadTransactionForm).toHaveBeenCalledWith("user-1", { kind: "edit", transactionId: "tx-other" });
  });

  it("goes to Activity with the insight after a create", async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({});
    jest.mocked(loadTransactionForm).mockResolvedValue({});
    const screen = render(<TransactionFormRoute />);
    await waitFor(() => expect(screen.getByText("new")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("create"));
    expect(router.dismissTo).toHaveBeenCalledWith(ROUTES.activity);
    expect(useTransactionFormStore.getState()).toMatchObject({ formVersion: 1, pendingUnusualSpending: { id: "insight" } });
  });

  it("returns to the caller when an edit closes", async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ transactionId: "tx-1" });
    jest.mocked(loadTransactionForm).mockResolvedValue({ transaction: { id: "tx-1" } as never });
    const screen = render(<TransactionFormRoute />);
    await waitFor(() => expect(screen.getByText("editing:tx-1")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("close"));
    expect(router.back).toHaveBeenCalled();
    expect(useTransactionFormStore.getState().formVersion).toBe(1);
  });
});
