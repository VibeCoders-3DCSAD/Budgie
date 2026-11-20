import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ROUTES } from "../../../routes";
import { SyncStatusIcon } from "../../shell/components/SyncButton";
import { shellPalette as palette } from "../../shell/theme";
import { useSync } from "../../sync/SyncProvider";
import { useTutorialEntry } from "../../onboarding-tour/hooks/useTutorialEntry";
import { TourTarget } from "../../onboarding-tour/components/TourTarget";
import { TOUR_STAGES, type TourStage } from "../../onboarding-tour/types";

const sectionLabel = { fontSize: 11, fontWeight: "700", color: palette.mut, textTransform: "uppercase", letterSpacing: 0.55, marginBottom: 9 } as const;

function syncLabel(syncing: boolean, queueCount: number) {
  if (syncing) return "Syncing...";
  if (queueCount > 0) return `${queueCount} unsynced`;
  return "Synced";
}

function ManageRow({ label, icon, divider = false, disabled = false, onPress }: { label: string; icon: "tag-outline" | "book-open-variant" | "file-document-outline" | "play-circle-outline" | "replay"; divider?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 15, paddingVertical: 14, borderTopWidth: divider ? 1 : 0, borderTopColor: palette.line, opacity: disabled ? 0.5 : 1 }}
    >
      <MaterialCommunityIcons color={palette.ink2} name={icon} size={18} />
      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "600", color: palette.ink }}>{label}</Text>
      <MaterialCommunityIcons color={palette.mut} name="chevron-right" size={20} />
    </Pressable>
  );
}

// The Manage (categories, definition of terms), Sync, and Help and About (tutorial, terms & conditions) rows Settings shows above its danger zone.
// Help and About also lets the tour be replayed from any one stage.
export function SettingsShellSection({ userId }: { userId: string }) {
  const { syncing, queueCount, syncMessage, handleSync } = useSync();
  const tutorial = useTutorialEntry(userId);
  return (
    <View>
      <Text style={sectionLabel}>Manage</Text>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: palette.line, overflow: "hidden", marginBottom: 20 }}>
        <TourTarget id="settings-categories" fill><ManageRow label="Categories" icon="tag-outline" onPress={() => router.push(ROUTES.categories)} /></TourTarget>
        <TourTarget id="settings-glossary" fill><ManageRow label="Definition of terms" icon="book-open-variant" divider onPress={() => router.push(ROUTES.glossary)} /></TourTarget>
      </View>
      <Text style={sectionLabel}>Sync</Text>
      <TourTarget id="settings-sync" fill>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: palette.line, overflow: "hidden", marginBottom: 20 }}>
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
      </TourTarget>
      <Text style={sectionLabel}>Help and About</Text>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: palette.line, overflow: "hidden" }}>
        {tutorial.canResume ? <ManageRow label="Resume tutorial" icon="play-circle-outline" disabled={tutorial.busy} onPress={tutorial.resume} /> : null}
        <TourTarget id="settings-replay" fill><ManageRow label="Replay tutorial" icon="replay" divider={tutorial.canResume} disabled={tutorial.busy} onPress={tutorial.replay} /></TourTarget>
        <StageReplayDropdown disabled={tutorial.busy} onSelect={tutorial.replayStage} />
        <TourTarget id="settings-terms" fill><ManageRow label="Terms & Conditions" icon="file-document-outline" divider onPress={() => router.push(ROUTES.terms)} /></TourTarget>
      </View>
    </View>
  );
}

// "Replay from a stage": collapsed to one row, it expands to list the tour's stages.
function StageReplayDropdown({ disabled, onSelect }: { disabled: boolean; onSelect: (stage: TourStage) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Replay from a stage"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 15, paddingVertical: 14, borderTopWidth: 1, borderTopColor: palette.line }}
      >
        <MaterialCommunityIcons color={palette.ink2} name="format-list-numbered" size={18} />
        <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "600", color: palette.ink }}>Replay from a stage</Text>
        <MaterialCommunityIcons color={palette.mut} name={open ? "chevron-up" : "chevron-down"} size={20} />
      </Pressable>
      {open ? TOUR_STAGES.map((stage) => (
        <Pressable
          key={stage}
          accessibilityRole="button"
          accessibilityLabel={`Replay from ${stage}`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onSelect(stage)}
          style={{ flexDirection: "row", alignItems: "center", paddingLeft: 45, paddingRight: 15, paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.line, opacity: disabled ? 0.5 : 1 }}
        >
          <Text style={{ flex: 1, fontSize: 13, color: palette.ink2 }}>{stage}</Text>
          <MaterialCommunityIcons color={palette.mut} name="chevron-right" size={18} />
        </Pressable>
      )) : null}
    </View>
  );
}
