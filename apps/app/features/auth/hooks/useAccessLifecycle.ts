import { useEffect, useState } from "react";
import * as ScreenCapture from "expo-screen-capture";
import { AppState, Platform } from "react-native";
import { startConnectivityPolling, useConnectivityStore } from "../../../services/connectivity";
import { getOrCreateDeviceId } from "../../../local-db/deviceId";
import type { useDeepLink } from "../../../hooks/useDeepLink";
import { resetAccessClock } from "../helpers/accessClock";
import { configureGoogleSignIn } from "../services/googleSignIn";
import { useAuthStore } from "../stores/useAuthStore";

// App-wide access effects: hydrate, lock on background, re-verify online, and resolve the device id.
export function useAccessLifecycle(links: ReturnType<typeof useDeepLink>) {
  const phase = useAuthStore((state) => state.phase);
  const userId = useAuthStore((state) => state.account?.session.userId);
  const online = useConnectivityStore((state) => state.online);
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    startConnectivityPolling();
    configureGoogleSignIn();
    void useAuthStore.getState().hydrate();
    // Protect native snapshots as well as the React view during background transitions.
    if (Platform.OS === "ios") void ScreenCapture.enableAppSwitcherProtectionAsync(1).catch(() => {});
    // FLAG_SECURE blacks out scrcpy/screen recordings, so dev builds stay capturable for demos and QA.
    else if (!__DEV__) void ScreenCapture.preventScreenCaptureAsync("odin-financial-data").catch(() => {});
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void useAuthStore.getState().lock();
      else {
        // Native monotonic clocks can pause during device sleep; re-anchor before
        // checking persisted observations to avoid treating sleep as clock tampering.
        resetAccessClock();
        void useAuthStore.getState().checkAccess();
      }
    });
    const interval = setInterval(() => { void useAuthStore.getState().checkAccess(); }, 1000);
    return () => { subscription.remove(); clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (phase !== "unlocked") { setDeviceId(""); return; }
    let cancelled = false;
    getOrCreateDeviceId().then((id) => { if (!cancelled) setDeviceId(id); }).catch(() => {
      void useAuthStore.getState().lock();
    });
    return () => { cancelled = true; };
  }, [phase, userId]);

  // Coming online re-verifies with the stored refresh token, so expired offline access recovers
  // without a new sign-in. Only a refresh token the server rejects sends the user to sign in.
  useEffect(() => {
    if (online && (phase === "unlocked" || phase === "verification-required")) void useAuthStore.getState().verifyOnline();
  }, [online, phase]);

  useEffect(() => {
    if (!links.isPasswordRecovery && !links.isResolvingRecoveryToken) return;
    void useAuthStore.getState().lock().then(() => {
      useAuthStore.setState({ phase: "recovery" });
    });
  }, [links.isPasswordRecovery, links.isResolvingRecoveryToken]);

  return deviceId;
}
