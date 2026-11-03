import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { Banner, FieldLabel, FormCard, Note, styles as ui, v4, v4Font } from "../../components/BudgieForm";
import { useToast } from "../../components/Toast";
import { LocalDbError } from "../../local-db/helpers";
import { listFinancialAccounts } from "../../local-db/repositories/foundations/financialFoundations";
import { listScheduledPaymentRecords, settleScheduledPaymentOccurrence, type ScheduledPaymentRecord } from "../../local-db/repositories/scheduled-payments/scheduledPaymentRecords";
import { deleteScheduledPayment, deleteScheduledPaymentRecord, getScheduledPayment, setScheduledPaymentArchived, type ScheduledPayment } from "../../local-db/repositories/scheduled-payments/scheduledPayments";
import { listSubcategories } from "../../local-db/repositories/ledger/taxonomy";
import { DeleteConfirmDialog } from "./components/ScheduledPaymentActions";
import { formatDueDate, formatPeso, repeatsLabel } from "./presentation";
import { addDays, currentOccurrence, dueDatesBetween, type OccurrenceStatus } from "./schedule";
import { manilaToday } from "../../lib/dates";

const HISTORY_PAGE_SIZE = 5;

type Props = { userId: string; deviceId: string; scheduledPaymentId: string; syncVersion: number; onEdit: () => void; onRecordPayment: () => void; onDeleted: () => void; onSyncRequested: () => void };

const STATUS: Record<OccurrenceStatus, { label: string; tone: "error" | "warn" | "info"; message: string }> = {
  paid: { label: "Paid", tone: "info", message: "This obligation occurrence is fully paid. Review the payment details or continue to the next occurrence." },
  partially_paid: { label: "Partially paid", tone: "warn", message: "This obligation occurrence is partially paid. Record the remaining payment or review the details." },
  overdue: { label: "Overdue", tone: "error", message: "This obligation occurrence is overdue and remains unpaid. Record a payment or review its schedule." },
  upcoming: { label: "Due", tone: "info", message: "This obligation is included in current planning. Review its schedule or record a payment." },
};

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={{ flex: 1 }}><FieldLabel>{label}</FieldLabel><Text numberOfLines={1} style={[ui.listTitle, { fontVariant: ["tabular-nums"] }]}>{value}</Text></View>;
}

export default function BillerDetailScreen({ userId, deviceId, scheduledPaymentId, syncVersion, onEdit, onRecordPayment, onDeleted, onSyncRequested }: Props) {
  const { showToast } = useToast();
  const today = manilaToday();
  const [payment, setPayment] = useState<ScheduledPayment | null | undefined>(undefined);
  const [records, setRecords] = useState<ScheduledPaymentRecord[]>([]);
  const [accountName, setAccountName] = useState("—");
  const [categoryName, setCategoryName] = useState("—");
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | "settle" | null>(null);
  const [removingRecord, setRemovingRecord] = useState<ScheduledPaymentRecord | null>(null);
  const [historyShown, setHistoryShown] = useState(HISTORY_PAGE_SIZE);

  const load = useCallback(async () => {
    try {
      const [loaded, loadedRecords, accounts, subcategories] = await Promise.all([getScheduledPayment(userId, scheduledPaymentId), listScheduledPaymentRecords(userId, scheduledPaymentId), listFinancialAccounts(userId), listSubcategories(userId, undefined, "expense")]);
      setPayment(loaded);
      setRecords(loadedRecords);
      setAccountName(accounts.find((account) => account.id === loaded?.sourceAccountId)?.name ?? "—");
      setCategoryName(subcategories.find((subcategory) => subcategory.id === loaded?.subcategoryId)?.label ?? "—");
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [userId, scheduledPaymentId]);

  useEffect(() => { load(); }, [load, syncVersion]);

  const paidByDate = useMemo(() => {
    const paid = new Map<string, number>();
    for (const record of records) paid.set(record.occurrenceDate, (paid.get(record.occurrenceDate) ?? 0) + record.amountCentavos);
    return paid;
  }, [records]);
  const settledDates = useMemo(() => new Set(records.filter((record) => record.settlesOccurrence).map((record) => record.occurrenceDate)), [records]);

  async function run(action: () => Promise<unknown>, success: string, after?: () => void) {
    try {
      await action();
      showToast(success, "success");
      onSyncRequested();
      if (after) after(); else await load();
    } catch (error) {
      showToast(error instanceof LocalDbError ? error.message : "Your obligation data could not be loaded or saved. Try again.");
    }
  }

  if (failed) return <Banner tone="error">Your obligations could not be loaded. Refresh and try again.</Banner>;
  if (payment === undefined) return <View style={{ alignItems: "center", paddingVertical: 30, gap: 10 }}><ActivityIndicator color={v4.brand} /><Text style={ui.note}>Your obligations are loading. Wait a moment for the list to appear.</Text></View>;
  if (payment === null) return <Banner tone="info">This obligation is deleted and unavailable for new payments. Choose an active obligation instead.</Banner>;

  const archived = payment.status === "archived";
  const current = archived ? null : currentOccurrence(payment, payment.amountCentavos, paidByDate, today, settledDates);
  const status = current ? STATUS[current.status] : null;
  const comingUp = archived ? [] : dueDatesBetween(payment, current && current.dueDate > today ? addDays(current.dueDate, 1) : today, addDays(today, 400)).slice(0, 3);

  return (
    <View style={{ gap: 14 }}>
      <View>
        <Text style={{ fontFamily: v4Font, fontSize: 20, fontWeight: "800", color: v4.ink }}>{payment.name}</Text>
        <Text style={[ui.note, { marginTop: 4 }]}>{repeatsLabel(payment.frequency)}{payment.autoPost ? " · Auto-post on" : ""}{archived ? " · Archived" : ""}</Text>
      </View>

      {archived ? <Banner tone="warn">This obligation is archived and excluded from current planning. Restore it before managing new payments.</Banner> : null}
      {payment.autoPost ? <Banner tone="info">Future occurrences post automatically. Turn off auto-post to record them yourself; past payments and transactions stay.</Banner> : null}

      {current && status ? (
        <FormCard title={`${status.label} · ${formatDueDate(current.dueDate)}`}>
          <Banner tone={status.tone}>{status.message}</Banner>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Stat label="Scheduled" value={formatPeso(current.scheduledCentavos)} />
            <Stat label="Paid" value={formatPeso(current.paidCentavos)} />
            <Stat label="Remaining" value={formatPeso(current.remainingCentavos)} />
          </View>
          {current.remainingCentavos > 0 ? <Pressable onPress={onRecordPayment} accessibilityRole="button" style={ui.button}><Text style={ui.buttonText}>Record payment</Text></Pressable> : null}
          {current.remainingCentavos > 0 && current.paidCentavos > 0 ? <Pressable onPress={() => setConfirm("settle")} accessibilityRole="button" style={[ui.button, ui.buttonGhost]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Mark as paid</Text></Pressable> : null}
        </FormCard>
      ) : null}

      <FormCard>
        <View style={{ flexDirection: "row", gap: 12 }}><Stat label="Amount" value={formatPeso(payment.amountCentavos)} /><Stat label="Paid from" value={accountName} /></View>
        <View style={{ flexDirection: "row", gap: 12 }}><Stat label="Category" value={categoryName} /><Stat label="Starts" value={formatDueDate(payment.startsOn)} /></View>
        {[payment.isFamilySupport ? "Family support" : null, payment.isDependentSupport ? "Dependent support" : null, payment.protectedByDefault ? "Protected" : null].filter(Boolean).length ? (
          <Note>{[payment.isFamilySupport ? "Family support" : null, payment.isDependentSupport ? "Dependent support" : null, payment.protectedByDefault ? "Protected" : null].filter(Boolean).join(" · ")}</Note>
        ) : null}
        {payment.notes ? <Note>{payment.notes}</Note> : null}
      </FormCard>

      {comingUp.length ? (
        <FormCard title="Coming up">
          {comingUp.map((date) => <View key={date} style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={ui.listTitle}>{formatDueDate(date)}</Text><Text style={ui.listTitle}>{formatPeso(payment.amountCentavos)}</Text></View>)}
        </FormCard>
      ) : null}

      <FormCard title="Payment history">
        {records.length === 0 ? <Note>This obligation has no recorded payments. Record a payment when one is made.</Note> : records.slice(0, historyShown).map((record) => (
          <Pressable key={record.id} onLongPress={() => setRemovingRecord(record)} accessibilityRole="button" accessibilityLabel={`${formatPeso(record.amountCentavos)} paid ${formatDueDate(record.paymentDate)}`} accessibilityHint="Long press to delete this payment" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={ui.listTitle}>{formatDueDate(record.paymentDate)}</Text>
              <Text style={ui.listSubtitle}>For {formatDueDate(record.occurrenceDate)}{record.source === "auto" ? " · Auto-posted" : ""}{record.settlesOccurrence ? " · Settled in full" : ""}</Text>
            </View>
            <Text style={[ui.listTitle, { fontVariant: ["tabular-nums"] }]}>{formatPeso(record.amountCentavos)}</Text>
          </Pressable>
        ))}
        {records.length > historyShown ? (
          <Pressable onPress={() => setHistoryShown((shown) => shown + HISTORY_PAGE_SIZE)} accessibilityRole="button" style={[ui.button, ui.buttonGhost]}>
            <Text style={[ui.buttonText, ui.buttonGhostText]}>Show {Math.min(HISTORY_PAGE_SIZE, records.length - historyShown)} more</Text>
          </Pressable>
        ) : null}
      </FormCard>

      {!archived ? <Pressable onPress={onEdit} accessibilityRole="button" style={[ui.button, ui.buttonGhost]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Edit</Text></Pressable> : null}
      <Pressable onPress={() => archived ? run(() => setScheduledPaymentArchived(userId, deviceId, payment.id, false), `${payment.name} is active again.`) : setConfirm("archive")} accessibilityRole="button" style={[ui.button, ui.buttonGhost]}>
        <Text style={[ui.buttonText, ui.buttonGhostText]}>{archived ? "Restore" : "Archive"}</Text>
      </Pressable>
      <Pressable onPress={() => setConfirm("delete")} accessibilityRole="button" style={[ui.button, ui.buttonDanger]}><Text style={ui.buttonText}>Delete</Text></Pressable>

      <Modal visible={confirm === "archive"} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(27,28,26,0.4)", justifyContent: "center", padding: 28 }}>
          <View accessibilityRole="alert" style={{ backgroundColor: v4.surface, borderRadius: 20, padding: 20, gap: 10 }}>
            <Text style={{ fontFamily: v4Font, fontWeight: "800", fontSize: 16, color: v4.ink }}>Archive {payment.name}?</Text>
            <Text style={ui.note}>Archiving this obligation removes it from current planning but preserves its history. Cancel to keep it active or confirm archiving to continue.</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <Pressable onPress={() => setConfirm(null)} accessibilityRole="button" style={[ui.button, ui.buttonGhost, { flex: 1 }]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Cancel</Text></Pressable>
              <Pressable onPress={() => { setConfirm(null); run(() => setScheduledPaymentArchived(userId, deviceId, payment.id, true), `${payment.name} was archived.`); }} accessibilityRole="button" style={[ui.button, { flex: 1 }]}><Text style={ui.buttonText}>Archive</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={confirm === "settle" && current != null} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(27,28,26,0.4)", justifyContent: "center", padding: 28 }}>
          <View accessibilityRole="alert" style={{ backgroundColor: v4.surface, borderRadius: 20, padding: 20, gap: 10 }}>
            <Text style={{ fontFamily: v4Font, fontWeight: "800", fontSize: 16, color: v4.ink }}>Mark {current ? formatDueDate(current.dueDate) : ""} as paid?</Text>
            <Text style={ui.note}>{current ? `The ${formatPeso(current.paidCentavos)} already paid settles this occurrence, and the remaining ${formatPeso(current.remainingCentavos)} is no longer owed. Delete that payment to undo this.` : ""}</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <Pressable onPress={() => setConfirm(null)} accessibilityRole="button" style={[ui.button, ui.buttonGhost, { flex: 1 }]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Cancel</Text></Pressable>
              <Pressable onPress={() => { setConfirm(null); if (current) run(() => settleScheduledPaymentOccurrence(userId, deviceId, payment.id, current.dueDate), `${payment.name} for ${formatDueDate(current.dueDate)} is marked as paid.`); }} accessibilityRole="button" style={[ui.button, { flex: 1 }]}><Text style={ui.buttonText}>Mark as paid</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <DeleteConfirmDialog name={confirm === "delete" ? payment.name : null} onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); run(() => deleteScheduledPayment(userId, deviceId, payment.id), `${payment.name} was deleted. Past transactions stay.`, onDeleted); }} />
      <DeleteConfirmDialog name={removingRecord ? `the ${formatPeso(removingRecord.amountCentavos)} payment` : null} message="Its expense transaction is deleted too, and the amount goes back to the account it was paid from." onCancel={() => setRemovingRecord(null)} onConfirm={() => { const record = removingRecord; setRemovingRecord(null); if (record) run(() => deleteScheduledPaymentRecord(userId, deviceId, record.transactionId), "The payment and its transaction were deleted."); }} />
    </View>
  );
}
