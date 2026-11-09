import { Stack } from "expo-router";
import { useEffect } from "react";
import { useSession } from "../../../features/auth/components/AccessProvider";
import { signOutGoogle } from "../../../features/auth/services/googleSignIn";
import { useAuthStore } from "../../../features/auth/stores/useAuthStore";
import { PracticeBanner } from "../../../features/onboarding-tour/components/PracticeBanner";
import { TourHost } from "../../../features/onboarding-tour/components/TourHost";
import { exitPracticeMode } from "../../../features/onboarding-tour/services/practiceSession";
import { resetShellState } from "../../../features/shell/helpers/resetShellState";
import { usePracticeModeStore } from "../../../services/practiceMode";
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
  // Neither the tour's practice data nor shell-wide UI state may leak into the next session after a logout or lock.
  useEffect(() => () => {
    void exitPracticeMode();
    resetShellState();
  }, []);
  // Every screen remounts on the tour's practice data, and again on the user's own when it ends.
  const practice = usePracticeModeStore((state) => state.active);

  return <InitialSyncGate key={userId} accessToken={accessToken} userId={userId} deviceId={deviceId}>
    <SyncProvider userId={userId} deviceId={deviceId} accessToken={accessToken} onLoggedOut={finishLogout} signOut={signOutGoogle}>
      <TourHost userId={userId}>
        <Stack key={practice ? "practice" : "own"} screenOptions={{ headerShown: false }} />
        <PracticeBanner />
      </TourHost>
    </SyncProvider>
  </InitialSyncGate>;
}
