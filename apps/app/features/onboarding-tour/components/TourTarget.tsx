import { cloneElement, type ReactElement, useEffect, useRef } from "react";
import { Platform, StatusBar, type StyleProp, View, type ViewStyle } from "react-native";
import { useOptionalShellPage } from "../../shell/components/PageScroll";
import { TOUR_STEPS } from "../steps";
import { pressTarget, registerTarget, type TargetRect } from "../stores/useTourTargets";
import { useTourScroller } from "./TourScrollArea";

// Steps with no target, and any step whose target could not be shown, attach to the centre anchor.
export const CENTER_TARGET = "tour-center";

// On Android, measureInWindow measures from just below the status bar, but the app and the tour's overlay
// draw from the top of the screen, so every highlight would sit one status bar too high. Shift them down.
export const SPOT_OFFSET_Y = Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0;

type Pressable = { onPress?: (...args: unknown[]) => void };

// Marks a control the tour can highlight. Steps refer to it by id, never by position in the step list.
// A press on it still does what it always does, and also tells a waiting tap step to move on.
export function TourTarget({ id, fill, style, children }: { id: string; fill?: boolean; style?: StyleProp<ViewStyle>; children: ReactElement<Pressable> }) {
  const ref = useRef<View>(null);
  const shellPage = useOptionalShellPage();
  const scroller = useTourScroller();
  const page = scroller ?? shellPage;
  useEffect(() => registerTarget(id, {
    measure: () => new Promise<TargetRect | null>((resolve) => {
      if (!ref.current) return resolve(null);
      ref.current.measureInWindow((x, y, width, height) => resolve(width || height ? { x, y: y + SPOT_OFFSET_Y, width, height } : null));
    }),
    page: page ? { getScrollY: page.getScrollY, scrollTo: page.scrollTo } : null,
  }), [id, page]);
  const onPress = children.props.onPress;
  const child = onPress ? cloneElement(children, { onPress: (...args: unknown[]) => { onPress(...args); pressTarget(id); } }) : children;
  return <View ref={ref} collapsable={false} style={[{ alignSelf: fill ? "stretch" : "flex-start" }, style]}>{child}</View>;
}

// The target the spotlight follows for a step: its own, or the centre when it has none or it is unavailable.
export function spotTarget(index: number, unavailable: number | null): string {
  if (index === unavailable) return CENTER_TARGET;
  return TOUR_STEPS[index]?.target ?? CENTER_TARGET;
}
