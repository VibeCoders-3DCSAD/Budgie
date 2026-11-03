import { useRef } from "react";
import { TrashSimple } from "phosphor-react-native";
import { ActivityIndicator, Modal, PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import { ActionSheet } from "../../../components/ActionSheet";
import { BottomSheetSurface } from "../../../components/BottomSheetSurface";
import { shellPalette as palette } from "../../shell/theme";
import { syncIssueMessage } from "../helpers/syncIssueMessage";
import type { SyncIssues } from "../hooks/useSyncIssues";

type Props = { issues: SyncIssues; isLoggingOut: boolean; onConfirmDiscard: () => void };

function formatSyncAction(operationType: string) {
  if (operationType === "create") return "Create";
  if (operationType === "update") return "Update";
  if (operationType === "delete") return "Delete";
  return "Sync";
}

function formatSyncEntity(entity: string) {
  if (entity === "categories") return "Category";
  if (entity === "subcategories") return "Subcategory";
  return entity.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Lists changes that can never sync and lets the user retry or discard them (and finish logging out).
export function SyncIssuesSheet({ issues, isLoggingOut, onConfirmDiscard }: Props) {
  const { issues: syncIssues, total: syncIssueTotal, failedTotal: failedIssueTotal, pendingTotal: pendingIssueTotal, loading: syncIssuesLoading,
    allowDiscard: allowDiscardLogout, logoutAfterDiscard, discardConfirmVisible, setDiscardConfirmVisible } = issues;
  const closeRef = useRef(issues.close);
  closeRef.current = issues.close;
  const syncSheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 60) closeRef.current();
      },
    }),
  ).current;

  return (
    <>
      <ActionSheet visible={issues.visible} onClose={issues.close} backdropColor="rgba(0,0,0,0.38)" accessibilityLabel="Close sync details">
          <BottomSheetSurface bottomSpacing={22} style={{ backgroundColor: palette.shell, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, maxHeight: "78%" }}>
            <View {...syncSheetPanResponder.panHandlers} style={{ paddingVertical: 8, marginTop: -8, marginBottom: 10 }}>
              <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: palette.line, alignSelf: "center" }} />
            </View>
            <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 20, color: palette.ink }}>
              Unsynced changes
            </Text>
            <Text style={{ fontFamily: "Manrope", fontSize: 13, lineHeight: 19, color: palette.mut, marginTop: 6 }}>
              We are sorry, we ran into a problem and cannot sync these changes. The only option is to discard them, then recreate them if needed.
            </Text>

            <Text style={{ fontFamily: "Manrope", fontSize: 11.5, color: palette.mut, marginTop: 10 }}>
              Showing {syncIssues.length} of {syncIssueTotal} changes
            </Text>

            <ScrollView style={{ marginTop: 16 }} contentContainerStyle={{ gap: 10 }}>
              {syncIssues.length === 0 ? (
                <Text style={{ fontFamily: "Manrope", fontSize: 13, color: palette.mut }}>
                  No unsynced changes found.
                </Text>
              ) : syncIssues.map((issue) => (
                <View key={issue.operation_id} style={{ borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.card, padding: 12 }}>
                  <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13.5, color: palette.ink }}>
                    {formatSyncAction(issue.operation_type)} {issue.item_label ?? formatSyncEntity(issue.entity)} {issue.status === "failed" ? "Failed" : "Waiting"}
                  </Text>
                  <Text style={{ fontFamily: "Manrope", fontSize: 11.5, color: palette.mut, marginTop: 3 }}>
                    {issue.status === "failed" ? syncIssueMessage(issue) : "This change is waiting to sync."}
                  </Text>
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
                    {issue.status === "failed" ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Retry this change"
                        onPress={() => { issues.retryOne(issue.operation_id).catch(() => {}); }}
                        hitSlop={4}
                        style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: palette.card }}
                      >
                        <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 12, color: palette.ink2 }}>
                          Retry
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Discard this change"
                      onPress={() => { void issues.discardOne(issue.operation_id); }}
                      hitSlop={4}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: "#FFF0F2" }}
                    >
                      <TrashSimple size={12} color={palette.error} />
                      <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 12, color: palette.error }}>
                        Discard
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>

            {syncIssues.length < syncIssueTotal ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Load more unsynced changes"
                disabled={syncIssuesLoading}
                onPress={() => { issues.loadMore().catch(() => {}); }}
                style={{ minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center", marginTop: 10 }}
              >
                {syncIssuesLoading ? (
                  <ActivityIndicator color={palette.mut} />
                ) : (
                  <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13, color: palette.ink2 }}>Load more</Text>
                )}
              </Pressable>
            ) : null}

            <View style={{ gap: 10, marginTop: 18 }}>
              {allowDiscardLogout && failedIssueTotal > 0 && pendingIssueTotal === 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={logoutAfterDiscard ? "Discard failed changes and log out" : "Discard failed changes"}
                  onPress={() => setDiscardConfirmVisible(true)}
                  style={{ minHeight: 50, borderRadius: 14, borderWidth: 1.5, borderColor: "#FFCDD2", backgroundColor: "#FFF0F2", alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 14, color: palette.error }}>
                    Discard {failedIssueTotal} failed change{failedIssueTotal === 1 ? "" : "s"}{logoutAfterDiscard ? " and log out" : ""}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close sync details"
                onPress={issues.close}
                style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: palette.ink2 }}>Close</Text>
              </Pressable>
            </View>
          </BottomSheetSurface>
      </ActionSheet>

      <Modal visible={discardConfirmVisible} transparent animationType="fade" onRequestClose={() => setDiscardConfirmVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}>
          <View style={{ borderRadius: 20, backgroundColor: palette.shell, padding: 20 }}>
            <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 19, color: palette.ink }}>
              Discard failed changes?
            </Text>
            <Text style={{ fontFamily: "Manrope", fontSize: 13, lineHeight: 19, color: palette.mut, marginTop: 8 }}>
              This will discard all {failedIssueTotal} failed local change{failedIssueTotal === 1 ? "" : "s"}, not just the changes currently shown. This cannot be undone. Recreate anything you still need.
            </Text>
            <View style={{ gap: 10, marginTop: 18 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={logoutAfterDiscard ? "Confirm discard failed changes and log out" : "Confirm discard failed changes"}
                disabled={isLoggingOut}
                onPress={onConfirmDiscard}
                style={{ minHeight: 50, borderRadius: 14, backgroundColor: palette.error, alignItems: "center", justifyContent: "center" }}
              >
                {isLoggingOut ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 14, color: "#fff" }}>
                    Discard {failedIssueTotal}{logoutAfterDiscard ? " and log out" : ""}
                  </Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel discard"
                onPress={() => setDiscardConfirmVisible(false)}
                style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: palette.ink2 }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
