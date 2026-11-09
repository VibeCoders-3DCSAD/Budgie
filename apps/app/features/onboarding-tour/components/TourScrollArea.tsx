import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, type ScrollViewProps } from "react-native";

type Scroller = { getScrollY: () => number; scrollTo: (y: number) => void };

const TourScrollContext = createContext<Scroller | null>(null);

export function useTourScroller(): Scroller | null {
  return useContext(TourScrollContext);
}

// A ScrollView the tour can scroll to bring a highlighted control into view. For screens that scroll on their
// own rather than inside a shell page (which already offers this).
export function TourScrollArea({ onScroll, scrollEventThrottle, children, ...props }: ScrollViewProps) {
  const ref = useRef<ScrollView>(null);
  const y = useRef(0);
  const getScrollY = useCallback(() => y.current, []);
  const scrollTo = useCallback((next: number) => ref.current?.scrollTo({ y: next, animated: false }), []);
  const value = useMemo(() => ({ getScrollY, scrollTo }), [getScrollY, scrollTo]);
  const track = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    y.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  };
  return (
    <TourScrollContext.Provider value={value}>
      <ScrollView ref={ref} onScroll={track} scrollEventThrottle={scrollEventThrottle ?? 32} {...props}>{children}</ScrollView>
    </TourScrollContext.Provider>
  );
}
