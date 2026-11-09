import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePracticeModeStore } from "../../../services/practiceMode";
import { shellPalette } from "../../shell/theme";

export const PRACTICE_BANNER_TEXT = "Tutorial data — your records are not changed";

// Floats above the tab bar while the tour shows practice data. It never takes a tap away from the screen.
const TAB_BAR_CLEARANCE = 78;

export function PracticeBanner() {
  const active = usePracticeModeStore((state) => state.active);
  const { bottom } = useSafeAreaInsets();
  if (!active) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: bottom + TAB_BAR_CLEARANCE, alignItems: "center" }}>
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={PRACTICE_BANNER_TEXT} style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: shellPalette.brand }}>
        <MaterialCommunityIcons name="school-outline" size={14} color={shellPalette.shell} />
        <Text style={{ flexShrink: 1, fontFamily: "Manrope", fontWeight: "700", fontSize: 12, color: shellPalette.shell }}>{PRACTICE_BANNER_TEXT}</Text>
      </View>
    </View>
  );
}
