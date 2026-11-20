import { useEffect } from "react";
import { Modal, Text, View } from "react-native";
import { useToast } from "../../../components/Toast";
import { shellPalette } from "../../shell/theme";
import { TOUR_MESSAGES } from "../messages";
import { preparePracticeMode } from "../services/practiceSession";
import { skipTour, startTour } from "../services/tourRunner";
import { useTourStore } from "../stores/useTourStore";
import { TourButton } from "./TourButton";

// Offered once, on the first visit after the questionnaire: Start tour or Skip for now.
export function TourOffer({ userId }: { userId: string }) {
  const visible = useTourStore((state) => state.progress?.status === "not_started" && state.phase === "idle");
  const { showToast } = useToast();
  // Builds the practice data while the offer is read, so Start only has to switch to it.
  useEffect(() => { if (visible) preparePracticeMode(userId); }, [visible, userId]);
  const start = () => { void startTour(userId, "start").then((result) => { if (result === "failed") showToast(TOUR_MESSAGES.error, "danger"); }); };
  const skip = () => { void skipTour(userId).then(() => showToast(TOUR_MESSAGES.skipped)); };
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={skip}>
      <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(11, 31, 22, 0.55)" }}>
        <View accessibilityViewIsModal style={{ padding: 20, borderRadius: 22, backgroundColor: shellPalette.shell, gap: 10 }}>
          <Text accessibilityRole="header" style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 18, color: shellPalette.ink }}>Take the tour?</Text>
          <Text style={{ fontFamily: "Manrope", fontSize: 14, lineHeight: 20, color: shellPalette.ink2 }}>{TOUR_MESSAGES.initial}</Text>
          <Text style={{ fontFamily: "Manrope", fontSize: 12.5, lineHeight: 18, color: shellPalette.mut }}>{TOUR_MESSAGES.practice}</Text>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
            <TourButton label="Skip for now" onPress={skip} />
            <TourButton label="Start tour" primary onPress={start} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
