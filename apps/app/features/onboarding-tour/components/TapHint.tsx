import { useEffect, useState } from "react";
import { Dimensions, Text, View } from "react-native";
import { useToast } from "../../../components/Toast";
import { shellPalette } from "../../shell/theme";
import { TOUR_MESSAGES } from "../messages";
import { continueLater, previousStep, recordStep, skipStep } from "../services/tourRunner";
import { stageNumber, TOUR_STEPS } from "../steps";
import { useTourStore } from "../stores/useTourStore";
import { sameRect, targetHandle, type TargetRect } from "../stores/useTourTargets";
import { TOUR_STAGES } from "../types";
import { TourButton } from "./TourButton";

const PADDING = 13;
const DIM = "rgba(11, 31, 22, 0.6)";
const REMEASURE_MS = 250;

// A tap step: the screen is dimmed except for a hole over the control, which stays live, so the user's own
// tap does the real thing. The spotlight cannot do this: its overlay is a modal that swallows every touch.
export function TapHint() {
  const index = useTourStore((state) => state.tapIndex);
  const userId = useTourStore((state) => state.userId);
  const [rect, setRect] = useState<TargetRect | null>(null);
  // The layer's own size: on Android the window height leaves out the status bar, but this layer does not.
  const [layer, setLayer] = useState(() => { const { width, height } = Dimensions.get("window"); return { width, height }; });
  const { showToast } = useToast();
  const step = index === null ? undefined : TOUR_STEPS[index];

  useEffect(() => {
    setRect(null);
    if (!step?.target) return;
    const target = step.target;
    let active = true;
    // Keeps measuring while the hint is up: the step often starts mid screen transition, so the first
    // position can be stale.
    const measure = () => void targetHandle(target)?.measure().then((measured) => {
      if (active) setRect((current) => (sameRect(current, measured) ? current : measured));
    });
    measure();
    const timer = setInterval(measure, REMEASURE_MS);
    if (userId) void recordStep(userId, step.id);
    return () => { active = false; clearInterval(timer); };
  }, [step, userId]);

  if (!step || !rect || !userId) return null;
  const { width, height } = layer;
  const hole = { top: rect.y - PADDING, left: rect.x - PADDING, right: rect.x + rect.width + PADDING, bottom: rect.y + rect.height + PADDING };
  const below = hole.bottom < height * 0.6;
  return (
    <View pointerEvents="box-none" onLayout={({ nativeEvent: { layout } }) => setLayer({ width: layout.width, height: layout.height })} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: Math.max(0, hole.top), backgroundColor: DIM }} />
      <View style={{ position: "absolute", top: hole.bottom, left: 0, right: 0, bottom: 0, backgroundColor: DIM }} />
      <View style={{ position: "absolute", top: hole.top, height: hole.bottom - hole.top, left: 0, width: Math.max(0, hole.left), backgroundColor: DIM }} />
      <View style={{ position: "absolute", top: hole.top, height: hole.bottom - hole.top, left: hole.right, width: Math.max(0, width - hole.right), backgroundColor: DIM }} />
      <View accessibilityViewIsModal={false} style={{ position: "absolute", left: 16, right: 16, ...(below ? { top: hole.bottom + 12 } : { bottom: height - hole.top + 12 }), padding: 16, borderRadius: 18, backgroundColor: shellPalette.shell, gap: 8 }}>
        <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11.5, color: shellPalette.mut }}>{`Stage ${stageNumber(step)} of ${TOUR_STAGES.length} · ${step.stage}`}</Text>
        <Text accessibilityRole="header" style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 16, color: shellPalette.ink }}>{step.title}</Text>
        <Text style={{ fontFamily: "Manrope", fontSize: 13.5, lineHeight: 19, color: shellPalette.ink2 }}>{step.body}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 4 }}>
          <TourButton label="Continue later" onPress={() => { void continueLater(userId).then(() => showToast(TOUR_MESSAGES.paused)); }} />
          {index === 0 ? null : <TourButton label="Back" onPress={() => { void previousStep(); }} />}
          <TourButton label="Skip step" onPress={() => { void skipStep(userId); }} />
        </View>
      </View>
    </View>
  );
}
