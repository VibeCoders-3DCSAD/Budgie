import { useState } from "react";
import { Alert } from "react-native";
import { useToast } from "../../../components/Toast";
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "../../../lib/api";
import { authorizedFetch, authorizeLocalRequest } from "../../../lib/localAccess";
import { isOnline } from "../../../lib/network";
import { runSync } from "../../../local-db/sync/runSync";
import { useConnectivityStore } from "../../../services/connectivity";
import { clearTransactionCache } from "../../ledger/transactionCache";
import {
  countExhaustedSyncRows, countRetryableSyncRows, countUnsyncedRows, discardExhaustedSyncRows,
} from "../services/syncQueue";
import type { SyncEngine } from "./useSyncEngine";
import type { SyncIssues } from "./useSyncIssues";

// Enough to ride out a brief outage before telling the user to try again.
const LOGOUT_SYNC_ROUNDS = 3;
const LOGOUT_SYNC_RETRY_MS = 5_000;

const LOGOUT_SYNC_MESSAGES = [
  "Hold on, we're trying to sync unsynced changes",
  "Finishing up...",
  "Please wait...",
];

type Options = {
  userId: string;
  deviceId: string;
  accessToken: string;
  engine: Pick<SyncEngine, "refreshQueueCount" | "startRotatingMessages">;
  issues: SyncIssues;
  onLoggedOut: () => void;
  signOut?: () => Promise<void>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Logging out first drains the sync queue so local changes are not lost; changes that can never
// sync must be discarded from the sync-issues sheet before the logout can finish.
export function useLogoutFlow({ userId, deviceId, accessToken, engine, issues, onLoggedOut, signOut }: Options) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const online = useConnectivityStore((state) => state.online);
  const { showToast } = useToast();

  async function finishLogout() {
    if (!useConnectivityStore.getState().online) throw new Error("Connect to the internet to log out.");
    const token = await authorizeLocalRequest(userId, accessToken);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await authorizedFetch(`${API_BASE_URL}/odin/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } finally { clearTimeout(timeoutId); }

    if (!response.ok) throw new Error(`Logout failed: ${response.status}`);

    if (signOut) {
      try { await signOut(); } catch {}
    }

    clearTransactionCache();
    onLoggedOut();
  }

  async function discardFailedChanges() {
    const logoutAfterDiscard = issues.logoutAfterDiscard;
    setIsLoggingOut(true);
    try {
      if (await countRetryableSyncRows(userId, deviceId) > 0) {
        issues.setDiscardConfirmVisible(false);
        await issues.load();
        showToast(logoutAfterDiscard ? "New changes are still waiting to sync. Retry before logging out." : "New changes are still waiting to sync. Retry before discarding.");
        setIsLoggingOut(false);
        return;
      }
      await discardExhaustedSyncRows(userId, deviceId);
      await engine.refreshQueueCount();
      issues.clear();
      if (logoutAfterDiscard) {
        await finishLogout();
      } else {
        setIsLoggingOut(false);
      }
    } catch (error) {
      console.error("Discard and logout failed", error);
      showToast(logoutAfterDiscard ? "Logout failed. Please check your connection and try again." : "Discard failed. Please try again.");
      setIsLoggingOut(false);
    }
  }

  async function handleLogout() {
    if (!online) {
      showToast("Connect to the internet to log out.");
      return;
    }
    setIsLoggingOut(true);
    setLogoutError(null);
    let stopLogoutSyncMessages: (() => void) | null = null;

    try {
      if (await countUnsyncedRows(userId, deviceId) > 0) {
        if (!(await isOnline())) {
          setLogoutError("You have unsynced changes. Connect to the internet and sync before logging out so your data is not lost.");
          setIsLoggingOut(false);
          return;
        }

        stopLogoutSyncMessages = engine.startRotatingMessages(LOGOUT_SYNC_MESSAGES);

        // One sync sends the whole queue, so later rounds only matter after a failed request, which
        // leaves the queue as it was. Retry a fixed number of times instead of waiting for progress.
        for (let round = 1; round <= LOGOUT_SYNC_ROUNDS && await countRetryableSyncRows(userId, deviceId) > 0; round++) {
          if (round > 1) await sleep(LOGOUT_SYNC_RETRY_MS);
          await runSync(userId, deviceId, accessToken);
          await engine.refreshQueueCount();
        }

        const stillPending = await countUnsyncedRows(userId, deviceId);

        stopLogoutSyncMessages();
        stopLogoutSyncMessages = null;

        if (stillPending > 0) {
          if (await countExhaustedSyncRows(userId, deviceId) > 0) {
            await issues.open(true, true);
          } else {
            setLogoutError("We couldn't finish syncing your changes. Please try again before logging out.");
          }
          setIsLoggingOut(false);
          return;
        }
      }

      await finishLogout();
    } catch (error) {
      stopLogoutSyncMessages?.();
      console.error("Logout request failed", error);
      setLogoutError("Logout failed. Please check your connection and try again.");
      setIsLoggingOut(false);
    }
  }

  function confirmLogout() {
    if (!online) { showToast("Connect to the internet to log out."); return; }
    Alert.alert("Log out of Budgie?", "Your local access will be locked. Pending changes must finish syncing before you log out.",
      [{ text: "Cancel", style: "cancel" }, { text: "Log out", style: "destructive", onPress: () => { void handleLogout(); } }]);
  }

  return { online, isLoggingOut, logoutError, confirmLogout, handleLogout, discardFailedChanges };
}
