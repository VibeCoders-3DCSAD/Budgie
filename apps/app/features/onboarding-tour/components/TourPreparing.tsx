import { useContext, useEffect } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { SpotlightTourContext } from "react-native-spotlight-tour";
import { shellPalette } from "../../shell/theme";
import { TOUR_MESSAGES } from "../messages";
import { cancelStart } from "../services/tourRunner";
import { useTourStore } from "../stores/useTourStore";
import { TourButton } from "./TourButton";

// Covers the gap between Start, Resume, or Replay and the first step: seeding practice data and opening the
// step's screen. It lifts once a step is on screen, as a spotlight (current) or a tap hint (tapIndex). Cancel
// backs out to the user's own data.
export function TourPreparing() {
  const { current, stop } = useContext(SpotlightTourContext);
  const preparing = useTourStore((state) => state.preparing);
  const idle = useTourStore((state) => state.phase === "idle");
  const tapIndex = useTourStore((state) => state.tapIndex);
  const shown = current !== undefined || tapIndex !== null;
  useEffect(() => {
    if (preparing && shown) useTourStore.setState({ preparing: false });
  }, [preparing, shown]);
  // A step that was already loading when Cancel was pressed still opens its spotlight afterwards; close it.
  useEffect(() => {
    if (idle && current !== undefined) stop?.();
  }, [idle, current, stop]);

  return (
    <Modal transparent animationType="fade" visible={preparing && !shown} onRequestClose={() => { void cancelStart(); }}>
      <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(11, 31, 22, 0.55)" }}>
        <View accessibilityViewIsModal accessibilityLiveRegion="polite" style={{ padding: 20, borderRadius: 22, backgroundColor: shellPalette.shell, alignItems: "center", gap: 10 }}>
          <ActivityIndicator size="large" color={shellPalette.ink} />
          <Text accessibilityRole="header" style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 16, color: shellPalette.ink, textAlign: "center" }}>{TOUR_MESSAGES.preparing}</Text>
          <Text style={{ fontFamily: "Manrope", fontSize: 13, lineHeight: 18, color: shellPalette.mut, textAlign: "center" }}>{TOUR_MESSAGES.preparingDetail}</Text>
          <TourButton label="Cancel" onPress={() => { void cancelStart(); }} />
        </View>
      </View>
    </Modal>
  );
}
