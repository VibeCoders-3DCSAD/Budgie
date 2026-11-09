import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { Hub } from "../helpers/shellNavigation";
import { CONTENT_GUTTER, shellPalette as palette } from "../theme";
import { useShellPage } from "./PageScroll";
import { TourTarget } from "../../onboarding-tour/components/TourTarget";

export function HubTitle({ title }: { title: string }) {
  return (
    <Text style={{ marginTop: 6, fontFamily: "Manrope", fontSize: 22, fontWeight: "800", letterSpacing: -0.22, color: palette.ink }}>
      {title}
    </Text>
  );
}

// Segments replace each other rather than stacking up history; Back leaves the hub.
export function HubSegments({ hub, pathname }: { hub: Hub; pathname: string }) {
  const { scrollTo } = useShellPage();
  return (
    // Bleeds into the content gutters so scrolled content never shows beside the pinned row.
    <View style={{ backgroundColor: palette.shell, marginHorizontal: -CONTENT_GUTTER, paddingHorizontal: CONTENT_GUTTER, paddingTop: 12, marginBottom: 16 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.line }}>
        {hub.segments.map((segment) => {
          const selected = pathname === segment.href;
          return (
            <TourTarget key={segment.href} id={`hub-${String(segment.href)}`} style={{ flex: 1 }}>
            <Pressable
              accessibilityRole="tab"
              accessibilityLabel={segment.label.replace("\n", " ")}
              accessibilityState={{ selected }}
              onPress={() => {
                scrollTo(0);
                if (!selected) router.replace(segment.href);
              }}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: selected ? palette.brand : "transparent" }}
            >
              <Text style={{ fontFamily: "Manrope", fontSize: 13, fontWeight: selected ? "700" : "600", color: selected ? palette.brand : palette.mut, textAlign: "center" }}>
                {segment.label}
              </Text>
            </Pressable>
            </TourTarget>
          );
        })}
      </View>
    </View>
  );
}
