import { Image, Pressable, Text, View } from "react-native";
import { SafeAreaFrame } from "../../components/SafeAreaFrame";
import { dashboardColors as P } from "../dashboard/dashboardAppearance";
import type { PullProgress } from "../../local-db/sync/runSync";

const initialSyncArt = require("../../assets/initial-sync.gif");
// Matches the GIF's own backdrop so the art doesn't sit in a visible box.
export const initialSyncBackground = "#FFFFFF";

type Props = {
  progress: PullProgress;
  failed: boolean;
  onRetry: () => void;
  onSkip: () => void;
};

export function progressRatio({ received, total }: PullProgress): number {
  if (total <= 0) return 0;
  return Math.min(received / total, 1);
}

export function InitialSyncScreen({ progress, failed, onRetry, onSkip }: Props) {
  const ratio = progressRatio(progress);
  const percent = Math.round(ratio * 100);

  return (
    <SafeAreaFrame style={{ flex: 1, backgroundColor: initialSyncBackground, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Image source={initialSyncArt} accessibilityIgnoresInvertColors style={{ width: 240, height: 135 }} resizeMode="contain" />
      <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 20, color: P.ink, marginTop: 24, textAlign: "center" }}>
        {failed ? "Sync paused" : "Setting up your account"}
      </Text>
      <Text style={{ fontFamily: "Manrope", fontSize: 14, lineHeight: 21, color: P.secondary, marginTop: 6, textAlign: "center" }}>
        {failed ? "We couldn't finish bringing your data to this device." : "Bringing your data to this device."}
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        style={{ width: "100%", maxWidth: 320, height: 8, borderRadius: 4, backgroundColor: P.track, marginTop: 24, overflow: "hidden" }}
      >
        <View style={{ width: `${percent}%`, height: "100%", borderRadius: 4, backgroundColor: P.brand }} />
      </View>
      <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13, color: P.secondary, marginTop: 10 }}>
        {progress.total > 0 ? `${percent}% · ${progress.received.toLocaleString()} of ${progress.total.toLocaleString()}` : "Preparing…"}
      </Text>
      {failed ? (
        <View style={{ marginTop: 24, alignItems: "center", gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry sync" onPress={onRetry}
            style={{ backgroundColor: P.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}>
            <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 14, color: P.surface }}>Retry</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Continue without finishing sync" onPress={onSkip}>
            <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13, color: P.brand }}>Continue anyway</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaFrame>
  );
}
