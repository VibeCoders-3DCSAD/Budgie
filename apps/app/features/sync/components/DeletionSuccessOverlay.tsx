import { CheckCircle } from "phosphor-react-native";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { shellPalette as palette } from "../../shell/theme";
import { ActionButton, Illustration, SummaryRow, formatShortDate, privacyTones } from "../../governance/components/governanceUi";

type Props = { scheduledDate: string; onBackToLogin: () => void };

// Covers the whole shell after an account deletion request; the only way out is logging out.
export function DeletionSuccessOverlay({ scheduledDate, onBackToLogin }: Props) {
  return (
    <SafeAreaView style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: palette.shell }}>
      <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: "center", gap: 11 }}>
        <Illustration icon={CheckCircle} title="Deletion requested">
          Your account is scheduled for deletion. You have{" "}
          <Text style={{ fontWeight: "700", color: privacyTones.ink }}>30 days</Text>
          {" "}to cancel by logging back in. After that, all data is permanently erased.
        </Illustration>
        <SummaryRow label="Scheduled deletion" value={formatShortDate(scheduledDate)} />
        <View style={{ marginTop: 12 }}>
          <ActionButton label="Back to login" onPress={onBackToLogin} />
        </View>
      </View>
    </SafeAreaView>
  );
}
