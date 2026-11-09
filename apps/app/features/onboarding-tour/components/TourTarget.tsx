import { cloneElement, type ReactElement, useEffect, useMemo, useRef } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { AttachStep, type ChildProps } from "react-native-spotlight-tour";
import { useOptionalShellPage } from "../../shell/components/PageScroll";
import { TOUR_STEPS } from "../steps";
import { useTourStore } from "../stores/useTourStore";
import { pressTarget, registerTarget, type TargetRect } from "../stores/useTourTargets";
import { useTourScroller } from "./TourScrollArea";

// Steps with no target, and any step whose target could not be shown, attach to the centre anchor.
export const CENTER_TARGET = "tour-center";

type Pressable = ChildProps & { onPress?: (...args: unknown[]) => void };

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
      ref.current.measureInWindow((x, y, width, height) => resolve(width || height ? { x, y, width, height } : null));
    }),
    page: page ? { getScrollY: page.getScrollY, scrollTo: page.scrollTo } : null,
  }), [id, page]);
  const unavailable = useTourStore((state) => state.unavailableIndex);
  const indexes = useMemo(() => targetIndexes(id, unavailable), [id, unavailable]);
  const onPress = children.props.onPress;
  const child = onPress ? cloneElement(children, { onPress: (...args: unknown[]) => { onPress(...args); pressTarget(id); } }) : children;
  return (
    <View ref={ref} collapsable={false} style={[{ alignSelf: fill ? "stretch" : "flex-start" }, style]}>
      <AttachStep index={indexes} fill={fill || !!style}>{child}</AttachStep>
    </View>
  );
}

export function targetIndexes(id: string, unavailable: number | null): number[] {
  const indexes = TOUR_STEPS.flatMap((step, index) => (step.target ?? CENTER_TARGET) === id ? [index] : []);
  if (id === CENTER_TARGET) return unavailable === null || indexes.includes(unavailable) ? indexes : [...indexes, unavailable];
  return indexes.filter((index) => index !== unavailable);
}
