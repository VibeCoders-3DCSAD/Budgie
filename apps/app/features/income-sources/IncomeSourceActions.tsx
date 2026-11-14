import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { BottomSheet, styles as ui, v4, v4Font } from "../../components/BudgieForm";
import { TourTarget } from "../onboarding-tour/components/TourTarget";

type Props = {
  name: string | null;
  confirming: boolean;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
};

export default function IncomeSourceActions({ name, confirming, busy, onClose, onEdit, onRequestDelete, onConfirmDelete }: Props) {
  return (
    <>
      {!confirming ? <BottomSheet visible={name !== null} onClose={onClose} title={name ?? undefined}>
        <TourTarget id="money-income-menu" fill>
        <View style={{ gap: 12 }}>
        <Pressable accessibilityRole="button" onPress={onEdit} style={[ui.button, ui.buttonGhost]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Edit</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onRequestDelete} style={[ui.button, { backgroundColor: "#FCEDEF" }]}><Text style={[ui.buttonText, { color: "#8A0000" }]}>Delete</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onClose} style={[ui.button, ui.buttonGhost]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Cancel</Text></Pressable>
        </View>
        </TourTarget>
      </BottomSheet> : null}
      <Modal visible={name !== null && confirming} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
        <View style={{ flex: 1, backgroundColor: "rgba(27,28,26,0.4)", justifyContent: "center", padding: 28 }}>
          <View accessibilityRole="alert" style={{ backgroundColor: v4.surface, borderRadius: 20, padding: 20, gap: 10 }}>
            <Text style={{ fontFamily: v4Font, fontWeight: "800", fontSize: 16, color: v4.ink }}>Delete {name}?</Text>
            <Text style={ui.note}>This income source will be permanently removed. Past transactions stay. This cannot be undone.</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={[ui.button, ui.buttonGhost, { flex: 1 }, busy ? ui.dimmed : null]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Confirm delete" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onConfirmDelete} style={[ui.button, ui.buttonDanger, { flex: 1 }, busy ? ui.dimmed : null]}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
                <Text style={ui.buttonText}>{busy ? "Deleting…" : "Delete"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
