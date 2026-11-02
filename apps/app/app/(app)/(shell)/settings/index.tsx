import { useSession } from "../../../../features/auth/components/AccessProvider";
import { useAuthStore } from "../../../../features/auth/stores/useAuthStore";
import SettingsScreen from "../../../../features/settings/SettingsScreen";
import { InnerPage } from "../../../../features/shell/components/InnerPage";

export default function SettingsRoute() {
  const { accessToken, userId, deviceId } = useSession();
  return <InnerPage title="Settings">
    <SettingsScreen accessToken={accessToken} userId={userId} deviceId={deviceId}
      onLock={() => { void useAuthStore.getState().lock(); }} />
  </InnerPage>;
}
