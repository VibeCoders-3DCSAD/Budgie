import { useState } from "react";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

// How close to the bottom counts as having read to the end.
const END_THRESHOLD = 24;

// Tracks whether a ScrollView has been read to the end; text that fits without scrolling counts as read.
export function useReadToEnd() {
  const [reachedEnd, setReachedEnd] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const fitsWithoutScroll = viewportHeight > 0 && contentHeight > 0 && contentHeight <= viewportHeight + END_THRESHOLD;

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (reachedEnd) return;
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - END_THRESHOLD) setReachedEnd(true);
  }

  return {
    readToEnd: reachedEnd || fitsWithoutScroll,
    scrollProps: {
      onScroll,
      scrollEventThrottle: 16,
      onLayout: (event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height),
      onContentSizeChange: (_width: number, height: number) => setContentHeight(height),
    },
  };
}
