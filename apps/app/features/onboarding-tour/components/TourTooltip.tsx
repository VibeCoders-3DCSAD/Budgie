import { useEffect } from "react";
import { Text, View } from "react-native";
import type { RenderProps } from "react-native-spotlight-tour";
import { useToast } from "../../../components/Toast";
import { shellPalette } from "../../shell/theme";
import { TOUR_MESSAGES } from "../messages";
import { continueLater, finishTour, nextStep, previousStep, recordStep, retryStep, skipStep } from "../services/tourRunner";
import { stageNumber } from "../steps";
import { useTourStore } from "../stores/useTourStore";
import { TOUR_STAGES, type TourStepDef } from "../types";
import { TourButton } from "./TourButton";

type Props = RenderProps & { step: TourStepDef; userId: string };

// The card beside a highlighted control: where you are, what it does, and how to move on.
export function TourTooltip({ step, userId, current, isFirst, isLast }: Props) {
  const unavailable = useTourStore((state) => state.unavailableIndex === current);
  const saveFailed = useTourStore((state) => state.saveFailed);
  const { showToast } = useToast();
  useEffect(() => { if (!unavailable) void recordStep(userId, step.id); }, [unavailable, userId, step.id]);

  const later = () => { void continueLater(userId).then(() => showToast(TOUR_MESSAGES.paused)); };
  const finish = () => { void finishTour(userId).then(() => showToast(TOUR_MESSAGES.complete, "success")); };

  return (
    <View accessibilityViewIsModal style={{ width: 300, maxWidth: "100%", padding: 16, borderRadius: 18, backgroundColor: shellPalette.shell, gap: 8 }}>
      <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11.5, color: shellPalette.mut }}>{`Stage ${stageNumber(step)} of ${TOUR_STAGES.length} · ${step.stage}`}</Text>
      <Text accessibilityRole="header" style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 16, color: shellPalette.ink }}>{unavailable ? "Step unavailable" : step.title}</Text>
      <Text style={{ fontFamily: "Manrope", fontSize: 13.5, lineHeight: 19, color: shellPalette.ink2 }}>{unavailable ? TOUR_MESSAGES.targetUnavailable : step.body}</Text>
      {saveFailed ? <Text style={{ fontFamily: "Manrope", fontSize: 12, color: shellPalette.error }}>{TOUR_MESSAGES.saveFailed}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 4 }}>
        <TourButton label="Continue later" onPress={later} />
        {unavailable ? <>
          <TourButton label="Skip step" onPress={() => { void skipStep(userId); }} />
          <TourButton label="Retry" primary onPress={retryStep} />
        </> : <>
          {isFirst ? null : <TourButton label="Back" onPress={() => { void previousStep(); }} />}
          <TourButton label={isLast ? "Finish" : "Next"} primary onPress={isLast ? finish : () => { void nextStep(userId); }} />
        </>}
      </View>
    </View>
  );
}
