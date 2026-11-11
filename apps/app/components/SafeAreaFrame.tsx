import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets, type Edge } from "react-native-safe-area-context";

type Props = {
  style?: StyleProp<ViewStyle>;
  className?: string;
  edges?: readonly Edge[];
  children?: ReactNode;
};

const ALL_EDGES: readonly Edge[] = ["top", "right", "bottom", "left"];

// Pads by the safe-area insets from the first frame. The native SafeAreaView applies its
// padding a layout pass late on Android, so content flashed under the status bar first.
export function SafeAreaFrame({ style, className, edges = ALL_EDGES, children }: Props) {
  const insets = useSafeAreaInsets();
  // Like the native view, the insets add to any padding the caller already set.
  const own = StyleSheet.flatten(style) ?? {};
  const base = (side: unknown, axis: unknown) =>
    Number(side ?? axis ?? own.padding ?? 0) || 0;
  const padding = {
    paddingTop: base(own.paddingTop, own.paddingVertical) + (edges.includes("top") ? insets.top : 0),
    paddingRight: base(own.paddingRight, own.paddingHorizontal) + (edges.includes("right") ? insets.right : 0),
    paddingBottom: base(own.paddingBottom, own.paddingVertical) + (edges.includes("bottom") ? insets.bottom : 0),
    paddingLeft: base(own.paddingLeft, own.paddingHorizontal) + (edges.includes("left") ? insets.left : 0),
  };
  return <View style={[style, padding]} className={className}>{children}</View>;
}
