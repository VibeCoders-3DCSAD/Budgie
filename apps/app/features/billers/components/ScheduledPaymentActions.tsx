import { Modal, Pressable, Text, View } from "react-native";
import { BottomSheet, FieldLabel, Note, Switch, styles as ui, v4, v4Font } from "../../../components/BudgieForm";
import type { ScheduledPaymentSummary } from "../../../local-db/repositories/scheduled-payments/scheduledPayments";
import { formatDueDate, formatPeso } from "../presentation";
import { nextDueDate } from "../schedule";
import { manilaToday } from "../../../lib/dates";

function MenuRow({ label, onPress, danger = false, divider }: { label: string; onPress: () => void; danger?: boolean; divider: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[ui.listRow, { paddingHorizontal: 15 }, divider ? ui.listRowDivider : null]}>
      <Text style={[ui.listTitle, danger ? { color: v4.error } : null]}>{label}</Text>
    </Pressable>
  );
}

export function RowMenuSheet({ payment, onPostNow, onAutoPost, onEdit, onDelete, onClose }: { payment: ScheduledPaymentSummary | null; onPostNow: () => void; onAutoPost: () => void; onEdit: () => void; onDelete: () => void; onClose: () => void }) {
  const canPost = Boolean(payment?.current && payment.current.remainingCentavos > 0);
  return (
    <BottomSheet visible={payment !== null} onClose={onClose} title={payment?.name}>
      <View style={ui.list}>
        {canPost ? <MenuRow label="Post now" onPress={onPostNow} divider={false} /> : null}
        {payment?.frequency !== "once" ? <MenuRow label="Auto-post" onPress={onAutoPost} divider={canPost} /> : null}
        <MenuRow label="Edit" onPress={onEdit} divider />
        <MenuRow label="Delete" onPress={onDelete} danger divider />
      </View>
      <Pressable onPress={onClose} accessibilityRole="button" style={[ui.button, ui.buttonGhost]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Cancel</Text></Pressable>
    </BottomSheet>
  );
}

export function DeleteConfirmDialog({ name, message = "This biller or remittance will be permanently removed. Past transactions stay.", onConfirm, onCancel }: { name: string | null; message?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal visible={name !== null} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "rgba(27,28,26,0.4)", justifyContent: "center", padding: 28 }}>
        <View accessibilityRole="alert" style={{ backgroundColor: v4.surface, borderRadius: 20, padding: 20, gap: 10 }}>
          <Text style={{ fontFamily: v4Font, fontWeight: "800", fontSize: 16, color: v4.ink }}>Delete {name}?</Text>
          <Text style={ui.note}>{message}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
            <Pressable onPress={onCancel} accessibilityRole="button" style={[ui.button, ui.buttonGhost, { flex: 1 }]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Cancel</Text></Pressable>
            <Pressable onPress={onConfirm} accessibilityRole="button" style={[ui.button, ui.buttonDanger, { flex: 1 }]}><Text style={ui.buttonText}>Delete</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function AutoPostSheet({ payment, accountName, busy, onToggle, onClose }: { payment: ScheduledPaymentSummary | null; accountName: string; busy: boolean; onToggle: () => void; onClose: () => void }) {
  const nextPost = payment ? nextDueDate(payment, manilaToday()) : null;
  return (
    <BottomSheet visible={payment !== null} onClose={onClose} title={payment?.name}>
      {payment ? (
        <>
          <Text style={[ui.listTitle, { fontSize: 15 }]}>{formatPeso(payment.amountCentavos)}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Text style={ui.listTitle}>Post automatically on the due date</Text>
            <Switch value={payment.autoPost} onToggle={onToggle} disabled={busy} accessibilityLabel="Post automatically on the due date" />
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}><FieldLabel>Next post</FieldLabel><Text style={ui.listTitle}>{nextPost ? formatDueDate(nextPost) : "None"}</Text></View>
            <View style={{ flex: 1 }}><FieldLabel>Deducted from</FieldLabel><Text numberOfLines={1} style={ui.listTitle}>{accountName}</Text></View>
          </View>
          <Note>Budgie records the transaction on the due date and deducts it from your budget.</Note>
        </>
      ) : null}
    </BottomSheet>
  );
}
