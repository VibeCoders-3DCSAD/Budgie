import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../components/Toast";
import { AppUpdatePrompts } from "../features/app-updates/AppUpdatePrompts";
import { useDeepLink } from "../hooks/useDeepLink";
import { enableDatabaseProtection } from "../local-db/databaseAccess";
import { AccessProvider } from "../features/auth/components/AccessProvider";
import PinAccessScreen from "../features/auth/components/PinAccessScreen";
import { useAccessLifecycle } from "../features/auth/hooks/useAccessLifecycle";
import { installNativeAccessGuard, useAuthStore } from "../features/auth/stores/useAuthStore";
import type { AccessPhase } from "../features/auth/types";

enableDatabaseProtection();
installNativeAccessGuard();

// PIN and loading states replace the navigator rather than being routes, so locking
// unmounts every screen holding decrypted data, as the shell did before routing.
function AccessGate({ phase, deviceId }: { phase: AccessPhase; deviceId: string }) {
  const signedOut = phase === "signed-out" || phase === "recovery";
  const unlocked = phase === "unlocked" && Boolean(deviceId);

  if (signedOut || unlocked) {
    return <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedOut}>
        <Stack.Screen name="login" />
        <Stack.Screen name="registration" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      <Stack.Protected guard={unlocked}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>;
  }

  // Unlocked but still resolving the device id counts as loading.
  if (phase === "hydrating" || phase === "unlocked") {
    return <View className="flex-1 items-center justify-center bg-card"><ActivityIndicator color="#013220" /></View>;
  }

  return <PinAccessScreen key={phase} />;
}

export default function RootLayout() {
  const phase = useAuthStore((state) => state.phase);
  const links = useDeepLink();
  const deviceId = useAccessLifecycle(links);

  return <SafeAreaProvider><ToastProvider>
    <AccessProvider value={{ deviceId, links }}><AccessGate phase={phase} deviceId={deviceId} /></AccessProvider>
    {/* Mounted above the access gate so it checks once per launch, not on every login or unlock. */}
    <AppUpdatePrompts />
    <StatusBar style="dark" />
  </ToastProvider></SafeAreaProvider>;
}
