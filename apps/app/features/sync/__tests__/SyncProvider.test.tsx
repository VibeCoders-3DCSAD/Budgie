jest.mock("phosphor-react-native", () => {
  const Stub = () => null;
  return new Proxy({ __esModule: true }, { get: (_target, key) => (key === "__esModule" ? true : Stub) });
});
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../../components/ActionSheet", () => ({
  ActionSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? children : null),
}));
jest.mock("../../../components/BottomSheetSurface", () => ({ BottomSheetSurface: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("../../../components/Toast", () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock("../../../services/connectivity", () => {
  const state = { online: true };
  const useConnectivityStore = (select: (value: typeof state) => unknown) => select(state);
  useConnectivityStore.getState = () => state;
  return { useConnectivityStore };
});
jest.mock("../../../lib/api", () => ({ API_BASE_URL: "http://test", REQUEST_TIMEOUT_MS: 1000 }));
jest.mock("../../../lib/localAccess", () => ({ authorizedFetch: jest.fn(), authorizeLocalRequest: jest.fn() }));
jest.mock("../../../lib/network", () => ({ isOnline: jest.fn(async () => true) }));
jest.mock("../../../local-db/client", () => ({ initDatabase: jest.fn(async () => ({})) }));
jest.mock("../../../local-db/helpers", () => ({ cleanupDiscardedSyncRows: jest.fn(async () => {}) }));
jest.mock("../../../local-db/sync/runSync", () => ({ runSync: jest.fn(async () => ({ pulled: 0, pushed: 1, errors: 0, hasMore: false })) }));
jest.mock("../../../local-db/repositories/scheduled-payments/scheduledPayments", () => ({ postDueScheduledPayments: jest.fn(async () => {}) }));
jest.mock("../../../local-db/repositories/foundations/recurringIncome", () => ({ postDueRecurringIncome: jest.fn(async () => {}) }));
jest.mock("../../ledger/transactionCache", () => ({ clearTransactionCache: jest.fn() }));
jest.mock("../services/devTools", () => ({ installSyncDevTools: jest.fn() }));
jest.mock("../services/syncQueue", () => ({
  countQueuedSyncRows: jest.fn(async () => 0),
  countUnsyncedRows: jest.fn(async () => 0),
  countRetryableSyncRows: jest.fn(async () => 0),
  countExhaustedSyncRows: jest.fn(async () => 0),
  loadSyncIssuesPage: jest.fn(async () => ({ rows: [], total: 0, failedTotal: 0, pendingTotal: 0 })),
  discardSyncIssue: jest.fn(), retrySyncIssue: jest.fn(), discardExhaustedSyncRows: jest.fn(),
}));

import React from "react";
import { Pressable, Text } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { postDueRecurringIncome } from "../../../local-db/repositories/foundations/recurringIncome";
import { postDueScheduledPayments } from "../../../local-db/repositories/scheduled-payments/scheduledPayments";
import { runSync } from "../../../local-db/sync/runSync";
import { countExhaustedSyncRows, countRetryableSyncRows, countUnsyncedRows, loadSyncIssuesPage } from "../services/syncQueue";
import { SyncProvider, useLogout, useSync } from "../SyncProvider";

function Probe() {
  const { syncVersion, handleSync } = useSync();
  return <Pressable accessibilityLabel="sync" onPress={() => { void handleSync(); }}><Text>{`version:${syncVersion}`}</Text></Pressable>;
}

function LogoutProbe() {
  const { handleLogout, logoutError } = useLogout();
  return <Pressable accessibilityLabel="logout" onPress={() => { void handleLogout(); }}><Text>{logoutError ?? "no-error"}</Text></Pressable>;
}

function renderProvider() {
  return render(<SyncProvider userId="user-1" deviceId="device-1" accessToken="token" onLoggedOut={jest.fn()}><Probe /><LogoutProbe /></SyncProvider>);
}

beforeEach(() => jest.clearAllMocks());

describe("SyncProvider", () => {
  it("posts due payments and paydays before the first sync, then bumps syncVersion", async () => {
    const order: string[] = [];
    jest.mocked(postDueScheduledPayments).mockImplementation(async () => { order.push("bills"); return undefined as never; });
    jest.mocked(postDueRecurringIncome).mockImplementation(async () => { order.push("income"); return undefined as never; });
    jest.mocked(runSync).mockImplementation(async () => { order.push("sync"); return { pulled: 0, pushed: 1, errors: 0, hasMore: false } as never; });
    const screen = renderProvider();
    await waitFor(() => expect(screen.getByText("version:1")).toBeTruthy());
    expect(order.slice(0, 3)).toEqual(["bills", "income", "sync"]);
    expect(runSync).toHaveBeenCalledWith("user-1", "device-1", "token");
    screen.unmount();
  });

  it("opens the sync-issues sheet instead of syncing when changes ran out of attempts", async () => {
    const screen = renderProvider();
    await waitFor(() => expect(runSync).toHaveBeenCalledTimes(1));
    jest.mocked(countExhaustedSyncRows).mockResolvedValue(2);
    jest.mocked(loadSyncIssuesPage).mockResolvedValue({
      rows: [{ operation_id: "op-1", entity: "categories", operation_type: "update", record_id: "c", failure_message: "Rejected", status: "failed", attempts: 3, created_at: "", item_label: "Food" }],
      total: 2, failedTotal: 2, pendingTotal: 0,
    });
    fireEvent.press(screen.getByLabelText("sync"));
    await waitFor(() => expect(screen.getByText("Unsynced changes")).toBeTruthy());
    expect(screen.getByText("Update Food Failed")).toBeTruthy();
    expect(screen.getByLabelText("Discard failed changes")).toBeTruthy();
    expect(runSync).toHaveBeenCalledTimes(1);
    screen.unmount();
  });

  it("retries a failed logout sync a fixed number of times even when the queue does not change", async () => {
    jest.useFakeTimers();
    try {
      const screen = renderProvider();
      await waitFor(() => expect(runSync).toHaveBeenCalledTimes(1));
      jest.mocked(runSync).mockClear();
      // A network failure leaves the queue exactly as it was.
      jest.mocked(countUnsyncedRows).mockResolvedValue(1);
      jest.mocked(countRetryableSyncRows).mockResolvedValue(1);
      jest.mocked(countExhaustedSyncRows).mockResolvedValue(0);

      fireEvent.press(screen.getByLabelText("logout"));
      await waitFor(() => expect(screen.getByText("We couldn't finish syncing your changes. Please try again before logging out.")).toBeTruthy(), { timeout: 15_000 });

      expect(runSync).toHaveBeenCalledTimes(3);
      screen.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
