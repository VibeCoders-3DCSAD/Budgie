import { router } from "expo-router";
import { ChartLine, User } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { ROUTES } from "../../../routes";
import { dashboardColors } from "../../dashboard/dashboardAppearance";
import { shellPalette as palette } from "../theme";
import { SyncButton } from "./SyncButton";
import { TourTarget } from "../../onboarding-tour/components/TourTarget";

// Top bar on the four tab pages: profile (Settings) and sync on the left, reports on the right.
export function TopBar({ backgroundColor, divider }: { backgroundColor: string; divider: boolean }) {
  return (
    <View style={{ backgroundColor, paddingHorizontal: 18, paddingVertical: 10, flexDirection: "row", alignItems: "center", borderBottomWidth: divider ? 1 : 0, borderBottomColor: dashboardColors.divider }}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 11 }}>
        <TourTarget id="topbar-settings">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile and settings"
            onPress={() => router.push(ROUTES.settings)}
            style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: palette.brand, alignItems: "center", justifyContent: "center" }}
          >
            <User size={16} color="#FFFFFF" weight="bold" />
          </Pressable>
        </TourTarget>
        <TourTarget id="topbar-sync"><SyncButton /></TourTarget>
      </View>
      <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end" }}>
        <TourTarget id="topbar-reports">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Financial reports"
            onPress={() => router.push(ROUTES.financialReports)}
            hitSlop={8}
          >
            <ChartLine size={20} color={palette.ink} />
          </Pressable>
        </TourTarget>
      </View>
    </View>
  );
}
