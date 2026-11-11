import { CaretLeft } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";
import { shellPalette as palette } from "../theme";
import { SyncButton } from "./SyncButton";
import { TourTarget } from "../../onboarding-tour/components/TourTarget";

// Header for every page outside the tabs: back, title, sync.
export function InnerHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={{ backgroundColor: palette.shell, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={10}>
        <CaretLeft size={20} color={palette.ink2} weight="bold" />
      </Pressable>
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: "Manrope", fontSize: 16.5, fontWeight: "800", letterSpacing: -0.16, color: palette.ink }}>
        {title}
      </Text>
      <TourTarget id="header-sync"><SyncButton /></TourTarget>
    </View>
  );
}
