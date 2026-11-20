import { ArrowDown } from "phosphor-react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { notifyTourLayout } from "../../onboarding-tour/stores/useTourTargets";
import { CONTENT_GUTTER, shellPalette as palette } from "../theme";

// Long pages show the scroll-to-bottom button while this much content is still below the viewport.
const SCROLL_TO_END_THRESHOLD = 400;
// Pages that register a loader (Activity) load more once the end is this close.
const LOAD_MORE_DISTANCE = 200;

export type ShellPageValue = {
  // The page owns the scroll view; these let a screen restore its place (Activity after an edit).
  getScrollY: () => number;
  scrollTo: (y: number) => void;
  // Called while the user scrolls near the end of the page; pass null to stop.
  setLoadMore: (loadMore: (() => void) | null) => void;
  // A screen with its own inner steps returns true from the intercept to swallow Back (header and Android).
  setBackIntercept: (intercept: (() => boolean) | null) => void;
  // Back as the header does it: intercept first, then history, then the page's fallback.
  goBack: () => void;
};

const ShellPageContext = createContext<ShellPageValue | null>(null);

// For components that also render outside a shell page (the tour's targets), where there is nothing to scroll.
export function useOptionalShellPage() {
  return useContext(ShellPageContext);
}

export function useShellPage() {
  const value = useContext(ShellPageContext);
  if (!value) throw new Error("useShellPage must be used inside a shell page.");
  return value;
}

type Props = {
  // Changing the key mounts a fresh scroll view, so each page starts at the top. Reusing one lets a short
  // loading state clamp the offset without a scroll event, leaving a hub's sticky segment row stuck.
  scrollKey?: string;
  // Room at the bottom for the floating tab bar.
  tabBarShown: boolean;
  showScrollToEnd?: boolean;
  // Index of the child that stays pinned while the rest scrolls (a hub's segment row).
  stickyHeaderIndex?: number;
  onScrollBeginDrag?: () => void;
  back: Pick<ShellPageValue, "setBackIntercept" | "goBack">;
  children: ReactNode;
};

export function PageScroll({ scrollKey, tabBarShown, showScrollToEnd = false, stickyHeaderIndex, onScrollBeginDrag, back, children }: Props) {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const contentHeight = useRef(0);
  const viewportHeight = useRef(0);
  const loadMoreRef = useRef<(() => void) | null>(null);
  const [scrollToEndVisible, setScrollToEndVisible] = useState(false);
  useEffect(() => { scrollY.current = 0; }, [scrollKey]);

  // Stable so screens can use them inside memoized row callbacks.
  const getScrollY = useCallback(() => scrollY.current, []);
  const scrollTo = useCallback((y: number) => scrollRef.current?.scrollTo({ y, animated: false }), []);
  const setLoadMore = useCallback((loadMore: (() => void) | null) => { loadMoreRef.current = loadMore; }, []);
  const { setBackIntercept, goBack } = back;
  const value = useMemo(() => ({ getScrollY, scrollTo, setLoadMore, setBackIntercept, goBack }), [getScrollY, scrollTo, setLoadMore, setBackIntercept, goBack]);

  // Same-value updates bail out, so this only re-renders when the button appears or disappears.
  const updateScrollToEnd = () => setScrollToEndVisible(showScrollToEnd && contentHeight.current - viewportHeight.current - scrollY.current > SCROLL_TO_END_THRESHOLD);

  return (
    <ShellPageContext.Provider value={value}>
      <ScrollView
        key={scrollKey}
        className="flex-1"
        contentContainerClassName={tabBarShown ? "pb-24" : "pb-8"}
        contentContainerStyle={{ paddingHorizontal: CONTENT_GUTTER }}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          scrollY.current = nativeEvent.contentOffset.y;
          contentHeight.current = nativeEvent.contentSize.height;
          viewportHeight.current = nativeEvent.layoutMeasurement.height;
          const distanceFromBottom = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y;
          if (distanceFromBottom < LOAD_MORE_DISTANCE) loadMoreRef.current?.();
          updateScrollToEnd();
          notifyTourLayout();
        }}
        onScrollBeginDrag={onScrollBeginDrag}
        onContentSizeChange={(_width, height) => { contentHeight.current = height; updateScrollToEnd(); notifyTourLayout(); }}
        onLayout={({ nativeEvent }) => { viewportHeight.current = nativeEvent.layout.height; updateScrollToEnd(); }}
        scrollEventThrottle={16}
        ref={scrollRef}
        stickyHeaderIndices={stickyHeaderIndex === undefined ? undefined : [stickyHeaderIndex]}
      >
        {children}
      </ScrollView>

      {scrollToEndVisible && showScrollToEnd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scroll to bottom"
          onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
          hitSlop={6}
          style={{
            position: "absolute",
            right: CONTENT_GUTTER,
            bottom: (tabBarShown ? 62 : 0) + bottomInset + 16,
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.brandMedium,
            shadowColor: "#013220",
            shadowOpacity: 0.25,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 5,
          }}
        >
          <ArrowDown size={20} color="#FFFFFF" weight="bold" />
        </Pressable>
      ) : null}
    </ShellPageContext.Provider>
  );
}
