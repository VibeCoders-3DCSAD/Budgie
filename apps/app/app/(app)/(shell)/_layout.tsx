import { Stack } from "expo-router";
import { useEffect } from "react";
import { useSession } from "../../../features/auth/components/AccessProvider";
import { signOutGoogle } from "../../../features/auth/services/googleSignIn";
import { useAuthStore } from "../../../features/auth/stores/useAuthStore";
import { useTransactionFormStore } from "../../../features/ledger/stores/useTransactionFormStore";
import { useShellChromeStore } from "../../../features/shell/stores/useShellChromeStore";
import { InitialSyncGate } from "../../../features/sync/InitialSyncGate";
import { SyncProvider } from "../../../features/sync/SyncProvider";

// A page opened by deep link still has the tabs underneath, so Back always has somewhere to go.
export const unstable_settings = { initialRouteName: "(tabs)" };

function finishLogout() {
  void useAuthStore.getState().finishLogout();
}

// The signed-in app: waits for the first sync, then runs background sync around every page.
export default function ShellLayout() {
  const { accessToken, userId, deviceId } = useSession();
  // Shell-wide UI state must not leak into the next session after a logout or lock.
  useEffect(() => () => {
    useTransactionFormStore.getState().dismissUnusualSpending();
    useShellChromeStore.getState().setActivityEditing(false);
  }, []);

  return <InitialSyncGate key={userId} accessToken={accessToken} userId={userId} deviceId={deviceId}>
    <SyncProvider userId={userId} deviceId={deviceId} accessToken={accessToken} onLoggedOut={finishLogout} signOut={signOutGoogle}>
      <Stack screenOptions={{ headerShown: false }} />
    </SyncProvider>
  </InitialSyncGate>;
}
