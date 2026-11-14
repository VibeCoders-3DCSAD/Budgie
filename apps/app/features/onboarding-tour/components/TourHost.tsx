import { type ReactNode, useContext, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { SpotlightTourContext, SpotlightTourProvider, type SpotlightTour, type TourStep } from "react-native-spotlight-tour";
import { attachTourHandle, notifyTargetPress, notifyTourEvent, prepareStep } from "../services/tourRunner";
import { readTourProgress } from "../services/tourProgress";
import { TOUR_STEPS } from "../steps";
import { resetTourStore, useTourStore } from "../stores/useTourStore";
import { sameRect, setTargetPressListener, setTourEventListener, targetHandle, type TargetRect } from "../stores/useTourTargets";
import { CENTER_TARGET, SPOT_OFFSET_Y, spotTarget, TourTarget } from "./TourTarget";
import { TapHint } from "./TapHint";
import { TourOffer } from "./TourOffer";
import { TourPreparing } from "./TourPreparing";
import { TourTooltip } from "./TourTooltip";

// Hosts the guided tour around the signed-in screens. It sits outside the screen stack, so it survives the
// stack reloading onto practice data.
export function TourHost({ userId, children }: { userId: string; children: ReactNode }) {
  const tour = useRef<SpotlightTour>(null);
  useEffect(() => attachTourHandle(() => tour.current), []);
  useEffect(() => {
    setTargetPressListener(notifyTargetPress);
    setTourEventListener(notifyTourEvent);
    return () => { setTargetPressListener(null); setTourEventListener(null); };
  }, []);
  useEffect(() => {
    let active = true;
    readTourProgress(userId)
      .then((progress) => { if (active) useTourStore.setState({ progress }); })
      .catch(() => { if (active) useTourStore.setState({ loadFailed: true }); });
    return () => { active = false; resetTourStore(); };
  }, [userId]);

  const steps = useMemo((): TourStep[] => TOUR_STEPS.map((step, index) => ({
    before: () => prepareStep(step, index),
    render: (props) => <TourTooltip {...props} step={step} userId={userId} />,
  })), [userId]);

  return (
    <SpotlightTourProvider ref={tour} steps={steps} overlayColor="#0B1F16" overlayOpacity={0.6} motion="fade"
      shape={{ type: "rectangle", padding: 13 }} placement="bottom" offset={12} shift={TOOLTIP_SHIFT} flip>
      {children}
      <CenterAnchor />
      <SpotFollower />
      <TapHint />
      <TourOffer userId={userId} />
      <TourPreparing />
    </SpotlightTourProvider>
  );
}

// Keeps the tooltip on screen. When a tall target leaves no room above or below, it slides over the target
// rather than off the top, clear of the status bar.
const TOOLTIP_SHIFT = { crossAxis: true, padding: { top: SPOT_OFFSET_Y + 8, bottom: 16, left: 16, right: 16 } };

// A point in the middle of the screen for steps with nothing to highlight.
function CenterAnchor() {
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: "40%", left: "50%" }}>
      <TourTarget id={CENTER_TARGET}><View style={{ width: 1, height: 1 }} /></TourTarget>
    </View>
  );
}

const REMEASURE_MS = 250;

// Keeps the spotlight on the current step's target. It measures the target on the screen in front (a hidden
// screen underneath can carry the same target), and keeps measuring while the step is up, since the screen
// may still be sliding in, scrolling, or loading when the step starts.
function SpotFollower() {
  const { current, changeSpot } = useContext(SpotlightTourContext);
  const unavailable = useTourStore((state) => state.unavailableIndex);
  useEffect(() => {
    if (current === undefined) return;
    const target = spotTarget(current, unavailable);
    let shown: TargetRect | null = null;
    let active = true;
    const measure = () => void targetHandle(target)?.measure().then((rect) => {
      if (!active || !rect || sameRect(shown, rect)) return;
      shown = rect;
      changeSpot(rect);
    });
    measure();
    const timer = setInterval(measure, REMEASURE_MS);
    return () => { active = false; clearInterval(timer); };
  }, [current, unavailable, changeSpot]);
  return null;
}
