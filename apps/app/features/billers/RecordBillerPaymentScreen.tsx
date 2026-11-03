import SavingsExpenseFundingSheet from "../ledger/components/SavingsExpenseFundingSheet";
import { getSavingsExpenseFunding, type SavingsExpenseFunding, type SavingsExpenseWithdrawal } from "../../local-db/repositories/savings/savingsExpenseFunding";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { ArrowLeft } from "phosphor-react-native";
import { Banner, Chip, FieldError, FieldLabel, FormCard, Note, PickerField, TextField, styles as ui, v4, v4Font } from "../../components/BudgieForm";
import { LocalDbError } from "../../local-db/helpers";
import { randomUUID } from "../../local-db/uuid";
import { listAccountOptions, type AccountOption } from "../../local-db/repositories/foundations/financialFoundations";
import { listPaidByOccurrence } from "../../local-db/repositories/scheduled-payments/scheduledPaymentRecords";
import { getScheduledPayment, recordScheduledPayment, type ScheduledPayment } from "../../local-db/repositories/scheduled-payments/scheduledPayments";
import { DateField } from "../../components/DateField";
import { AccountPickerSheet } from "./components/BillerSheets";
import { formatDueDate, formatPeso } from "./presentation";
import { currentOccurrence, occurrenceChoices } from "./schedule";
import { manilaToday } from "../../lib/dates";

type Props = { userId: string; deviceId: string; scheduledPaymentId: string; onClose: () => void; onRecorded: (message: string) => void };
type Field = "amount" | "paymentDate" | "account" | "occurrence";

export default function RecordBillerPaymentScreen({ userId, deviceId, scheduledPaymentId, onClose, onRecorded }: Props) {
  const today = manilaToday();
  const [payment, setPayment] = useState<ScheduledPayment | null>(null);
  const [paid, setPaid] = useState<Map<string, number>>(new Map());
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [occurrence, setOccurrence] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<string | null>(today);
  const [sourceAccountId, setSourceAccountId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingsFunding, setSavingsFunding] = useState<SavingsExpenseFunding | null>(null);
  const [pickingAccount, setPickingAccount] = useState(false);
  // One id per form keeps a double tap or retry from recording the payment twice.
  const recordId = useRef(randomUUID());
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getScheduledPayment(userId, scheduledPaymentId), listPaidByOccurrence(userId), listAccountOptions(userId)])
      .then(([loaded, paidByPayment, loadedAccounts]) => {
        if (cancelled) return;
        if (!loaded || loaded.status !== "active") { setLoadError("This obligation is no longer available for payments. Choose an active obligation instead."); return; }
        const paidByDate = paidByPayment.get(loaded.id) ?? new Map<string, number>();
        const current = currentOccurrence(loaded, loaded.amountCentavos, paidByDate, today);
        setPayment(loaded);
        setPaid(paidByDate);
        setAccounts(loadedAccounts);
        setSourceAccountId(loaded.sourceAccountId);
        setOccurrence(current?.dueDate ?? null);
        setAmount(current ? String(current.remainingCentavos / 100) : "");
      })
      .catch(() => { if (!cancelled) setLoadError("Your obligation data could not be loaded or saved. Try again."); });
    return () => { cancelled = true; };
  }, [userId, scheduledPaymentId, today]);

  function remainingFor(dueDate: string): number {
    return Math.max((payment?.amountCentavos ?? 0) - (paid.get(dueDate) ?? 0), 0);
  }

  function clearError(field: Field) {
    if (errors[field]) setErrors(({ [field]: _cleared, ...rest }) => rest);
  }

  async function handleSave(savingsGoalWithdrawals?: SavingsExpenseWithdrawal[]) {
    if (!payment || inFlight.current) return;
    const centavos = Math.round(Number(amount.replace(/,/g, "")) * 100);
    const next: Partial<Record<Field, string>> = {};
    if (!amount.trim() || !Number.isFinite(centavos) || centavos <= 0) next.amount = "Enter a positive payment amount.";
    if (!paymentDate) next.paymentDate = "Select a payment date.";
    if (!sourceAccountId) next.account = "Select a source account.";
    if (!occurrence) next.occurrence = "Select the obligation period this pays.";
    setErrors(next);
    if (Object.keys(next).length) { setFormError("Some obligation details are not valid. Correct the marked fields and try again."); return; }
    setFormError(null);
    setSaving(true);
    inFlight.current = true;
    try {
      if (!savingsGoalWithdrawals) {
        const funding = await getSavingsExpenseFunding(userId, sourceAccountId!, centavos);
        if (funding.requiredWithdrawalCentavos > 0) {
          setSavingsFunding(funding); setSaving(false); inFlight.current = false; return;
        }
      }
      await recordScheduledPayment(userId, deviceId, { savingsGoalWithdrawals, id: recordId.current, scheduledPaymentId: payment.id, occurrenceDate: occurrence!, amountCentavos: centavos, paymentDate: paymentDate!, sourceAccountId: sourceAccountId!, notes });
      onRecorded(`${formatPeso(centavos)} recorded for ${payment.name}.`);
    } catch (error) {
      setFormError(error instanceof LocalDbError ? error.message : "Your obligation data could not be loaded or saved. Try again.");
      setSaving(false);
      inFlight.current = false;
    }
  }

  const choices = payment ? occurrenceChoices(payment, payment.amountCentavos, paid, today) : [];
  const accountName = accounts.find((account) => account.id === sourceAccountId)?.name;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: v4.shell }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}><ArrowLeft color={v4.ink} size={20} weight="bold" /></Pressable>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: v4Font, fontWeight: "800", fontSize: 16.5, color: v4.ink }}>{payment ? `Pay ${payment.name}` : "Record payment"}</Text>
      </View>
      {loadError ? <View style={{ padding: 16 }}><Banner tone="error">{loadError}</Banner></View> : !payment ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={v4.brand} /></View> : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {formError ? <Banner tone="error">{formError}</Banner> : saving ? <Banner tone="info">Your related transaction is being created. Wait for the link to finish before leaving this screen.</Banner> : null}
          <FormCard title="Obligation period">
            {choices.length === 0 ? <Note>No eligible category, obligation, or account is available. Add or choose a different option.</Note> : (
              <View style={ui.chips}>
                {choices.map((date) => (
                  <Chip key={date} label={formatDueDate(date)} selected={occurrence === date} accessibilityLabel={`Pay the ${formatDueDate(date)} occurrence`} onPress={() => { setOccurrence(date); setAmount(String(remainingFor(date) / 100)); clearError("occurrence"); clearError("amount"); }} />
                ))}
              </View>
            )}
            {occurrence ? <Note>{formatPeso(remainingFor(occurrence))} of {formatPeso(payment.amountCentavos)} remaining for this period.</Note> : null}
            {errors.occurrence ? <FieldError>{errors.occurrence}</FieldError> : null}
          </FormCard>
          <FormCard>
            <View>
              <TextField label="Payment amount *" value={amount} onChangeText={(value) => { setAmount(value); clearError("amount"); }} placeholder="Enter payment amount" suffix="₱" keyboardType="decimal-pad" error={Boolean(errors.amount)} accessibilityLabel="Payment amount" />
              {errors.amount ? <FieldError>{errors.amount}</FieldError> : null}
            </View>
            <View>
              <DateField label="Payment date *" value={paymentDate} placeholder="Select payment date" onChange={(value) => { setPaymentDate(value); clearError("paymentDate"); }} error={Boolean(errors.paymentDate)} />
              {errors.paymentDate ? <FieldError>{errors.paymentDate}</FieldError> : null}
            </View>
            <View>
              <PickerField label="Source account *" value={accountName ?? "Select source account"} placeholder={!accountName} error={Boolean(errors.account)} onPress={() => setPickingAccount(true)} />
              {errors.account ? <FieldError>{errors.account}</FieldError> : null}
            </View>
            <TextField label="Payment notes" value={notes} onChangeText={setNotes} placeholder="Add payment notes" multiline maxLength={1000} />
          </FormCard>
          <View>
            <FieldLabel>Related expense transaction</FieldLabel>
            <Note>Recording this payment also records it as an expense from the source account.</Note>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={onClose} disabled={saving} accessibilityRole="button" style={[ui.button, ui.buttonGhost, { flex: 1 }]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Cancel</Text></Pressable>
            <Pressable onPress={() => { void handleSave(); }} disabled={saving} accessibilityRole="button" accessibilityState={{ disabled: saving }} style={[ui.button, { flex: 1, opacity: saving ? 0.6 : 1 }]}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={ui.buttonText}>{saving ? "Saving…" : "Record payment"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
      <SavingsExpenseFundingSheet funding={savingsFunding} onCancel={() => setSavingsFunding(null)} onConfirm={(withdrawals) => { setSavingsFunding(null); void handleSave(withdrawals); }} />
      <AccountPickerSheet visible={pickingAccount} accounts={accounts} selectedId={sourceAccountId} onSelect={(id) => { setSourceAccountId(id); clearError("account"); }} onClose={() => setPickingAccount(false)} />
    </KeyboardAvoidingView>
  );
}
