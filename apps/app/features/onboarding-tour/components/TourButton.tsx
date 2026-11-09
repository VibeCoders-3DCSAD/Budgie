import { Pressable, Text } from "react-native";
import { shellPalette } from "../../shell/theme";

// One tooltip action. Primary is filled; the rest are quiet text buttons.
export function TourButton({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={{ minHeight: 40, paddingHorizontal: primary ? 16 : 10, borderRadius: 12, justifyContent: "center", backgroundColor: primary ? shellPalette.brand : "transparent" }}>
      <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13.5, color: primary ? shellPalette.shell : shellPalette.brandMedium }}>{label}</Text>
    </Pressable>
  );
}
