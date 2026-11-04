import { useState } from "react";
import { View } from "react-native";
import PrivacySettingsScreen from "../governance/PrivacySettingsScreen";
import { useLogout } from "../sync/SyncProvider";
import { AccountActions } from "./components/AccountActions";
import { SettingsShellSection } from "./components/SettingsShellSection";

type Props = {
  accessToken: string;
  userId: string;
  deviceId: string;
  onLock: () => void;
};

// Privacy and account settings plus the shell's own rows; sub-pages of the privacy screen hide the extras.
export default function SettingsScreen({ accessToken, userId, deviceId, onLock }: Props) {
  const { confirmLogout } = useLogout();
  const [subPage, setSubPage] = useState(false);
  return (
    <View>
      <PrivacySettingsScreen accessToken={accessToken} userId={userId} deviceId={deviceId} onBackToLogin={confirmLogout}
        onSubPageChange={setSubPage}
        beforeDangerZone={subPage ? null : <SettingsShellSection />} />
      {subPage ? null : <AccountActions onLock={onLock} />}
    </View>
  );
}
