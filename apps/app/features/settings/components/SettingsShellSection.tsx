import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { ROUTES } from "../../../routes";
import { SyncStatusIcon } from "../../shell/components/SyncButton";
import { shellPalette as palette } from "../../shell/theme";
import { useSync } from "../../sync/SyncProvider";

const sectionLabel = { fontSize: 11, fontWeight: "700", color: palette.mut, textTransform: "uppercase", letterSpacing: 0.55, marginBottom: 9 } as const;

function syncLabel(syncing: boolean, queueCount: number) {
  if (syncing) return "Syncing...";
  if (queueCount > 0) return `${queueCount} unsynced`;
  return "Synced";
}

function ManageRow({ label, icon, divider = false, onPress }: { label: string; icon: "tag-outline" | "book-open-variant"; divider?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 15, paddingVertical: 14, borderTopWidth: divider ? 1 : 0, borderTopColor: palette.line }}
    >
      <MaterialCommunityIcons color={palette.ink2} name={icon} size={18} />
      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "600", color: palette.ink }}>{label}</Text>
      <MaterialCommunityIcons color={palette.mut} name="chevron-right" size={20} />
    </Pressable>
  );
}

// The Manage (categories, definition of terms) and Sync rows Settings shows above its danger zone.
export function SettingsShellSection() {
  const { syncing, queueCount, syncMessage, handleSync } = useSync();
  return (
    <View>
      <Text style={sectionLabel}>Manage</Text>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: palette.line, overflow: "hidden", marginBottom: 20 }}>
        <ManageRow label="Categories" icon="tag-outline" onPress={() => router.push(ROUTES.categories)} />
        <ManageRow label="Definition of terms" icon="book-open-variant" divider onPress={() => router.push(ROUTES.glossary)} />
      </View>
      <Text style={sectionLabel}>Sync</Text>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: palette.line, overflow: "hidden" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={queueCount > 0 ? "Sync unsynced changes" : "Synced"}
          disabled={syncing}
          onPress={handleSync}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 15, paddingVertical: 14 }}
        >
          <SyncStatusIcon size={18} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: palette.ink }}>
              {syncLabel(syncing, queueCount)}
            </Text>
            {syncMessage ? (
              <Text style={{ fontSize: 10.5, color: palette.mut, marginTop: 1 }}>
                {syncMessage}
              </Text>
            ) : null}
          </View>
          <MaterialCommunityIcons color={palette.mut} name="chevron-right" size={20} />
        </Pressable>
      </View>
    </View>
  );
}
