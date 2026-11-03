import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { ArrowLeft } from "phosphor-react-native";
import { Banner, Chip, FieldError, FieldLabel, FormCard, Note, PickerField, Switch, TextField, styles as ui, v4, v4Font } from "../../components/BudgieForm";
import CategorySelectorPage from "../../components/CategorySelector";
import { LocalDbError } from "../../local-db/helpers";
import { listAccountOptions, type AccountOption } from "../../local-db/repositories/foundations/financialFoundations";
import { listScheduledPaymentRecords } from "../../local-db/repositories/scheduled-payments/scheduledPaymentRecords";
import { createScheduledPayment, getScheduledPayment, updateScheduledPayment, type ScheduledPaymentInput } from "../../local-db/repositories/scheduled-payments/scheduledPayments";
import { listSubcategories, type Subcategory } from "../../local-db/repositories/ledger/taxonomy";
import { DateField } from "../../components/DateField";
import { AccountPickerSheet } from "./components/BillerSheets";
import { FREQUENCY_LABELS, FREQUENCY_OPTIONS, MONTHS, WEEKDAYS, formatDueDate } from "./presentation";
import { localToday, nextDueDate, type ScheduledPaymentFrequency } from "./schedule";
import { parseLenientCentavos } from "../../lib/format/money";

type Props = { userId: string; deviceId: string; scheduledPaymentId?: string; onClose: () => void; onSaved: (message: string) => void };
type Field = "name" | "amount" | "account" | "dayOfWeek" | "dayOfMonth" | "secondDayOfMonth" | "month" | "startsOn" | "endsOn";

const INVALID = "Some obligation details are not valid. Correct the marked fields and try again.";

function parseDay(value: string): number | null {
  const day = Number(value);
  return value.trim() && Number.isInteger(day) ? day : null;
}

export default function BillerFormScreen({ userId, deviceId, scheduledPaymentId, onClose, onSaved }: Props) {
  const isEdit = Boolean(scheduledPaymentId);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [lastPosted, setLastPosted] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<ScheduledPaymentFrequency>("monthly");
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null);
  const [dayOfMonth, setDayOfMonth] = useState("");
  const [secondDayOfMonth, setSecondDayOfMonth] = useState("");
  const [month, setMonth] = useState<number | null>(null);
  const [startsOn, setStartsOn] = useState(localToday());
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [autoPost, setAutoPost] = useState(false);
  // No longer shown on the form; kept so editing preserves what older payments saved.
  const [isFamilySupport, setIsFamilySupport] = useState(false);
  const [isDependentSupport, setIsDependentSupport] = useState(false);
  const [protectedByDefault, setProtectedByDefault] = useState(true);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<"category" | "account" | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAccountOptions(userId), listSubcategories(userId, undefined, "expense"), scheduledPaymentId ? getScheduledPayment(userId, scheduledPaymentId) : null, scheduledPaymentId ? listScheduledPaymentRecords(userId, scheduledPaymentId) : []])
      .then(([loadedAccounts, loadedSubcategories, existing, records]) => {
        if (cancelled) return;
        setAccounts(loadedAccounts);
        setSubcategories(loadedSubcategories);
        if (existing) {
          setName(existing.name); setSubcategoryId(existing.subcategoryId); setAmount(String(existing.amountCentavos / 100)); setSourceAccountId(existing.sourceAccountId);
          setFrequency(existing.frequency); setDayOfWeek(existing.dueDayOfWeek); setDayOfMonth(existing.dueDayOfMonth?.toString() ?? ""); setSecondDayOfMonth(existing.dueSecondDayOfMonth?.toString() ?? "");
          setMonth(existing.dueMonth); setStartsOn(existing.startsOn); setEndsOn(existing.endsOn); setAutoPost(existing.autoPost); setIsFamilySupport(existing.isFamilySupport);
          setIsDependentSupport(existing.isDependentSupport); setProtectedByDefault(existing.protectedByDefault); setNotes(existing.notes ?? "");
          setLastPosted(records[0]?.paymentDate ?? null);
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setFormError("Your obligation data could not be loaded or saved. Try again."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [userId, scheduledPaymentId]);

  const input: ScheduledPaymentInput = useMemo(() => ({
    name, subcategoryId, sourceAccountId: sourceAccountId ?? "", amountCentavos: parseLenientCentavos(amount) ?? 0, frequency,
    dueDayOfWeek: dayOfWeek, dueDayOfMonth: parseDay(dayOfMonth), dueSecondDayOfMonth: parseDay(secondDayOfMonth), dueMonth: month,
    startsOn, endsOn: frequency === "once" ? null : endsOn, autoPost, isFamilySupport, isDependentSupport, protectedByDefault, notes,
  }), [name, subcategoryId, sourceAccountId, amount, frequency, dayOfWeek, dayOfMonth, secondDayOfMonth, month, startsOn, endsOn, autoPost, isFamilySupport, isDependentSupport, protectedByDefault, notes]);

  const nextPost = useMemo(() => {
    try { return nextDueDate(input, localToday()); } catch { return null; }
  }, [input]);

  function validate(): Partial<Record<Field, string>> {
    const next: Partial<Record<Field, string>> = {};
    const inMonth = (day: number | null) => day != null && day >= 1 && day <= 31;
    if (!name.trim()) next.name = "Name is required.";
    if (!amount.trim()) next.amount = "Amount is required.";
    else if ((parseLenientCentavos(amount) ?? 0) <= 0) next.amount = "Enter a positive amount.";
    if (!sourceAccountId) next.account = "Select the account this is paid from.";
    if ((frequency === "weekly" || frequency === "biweekly") && dayOfWeek == null) next.dayOfWeek = "Select the day of the week.";
    if (frequency !== "daily" && frequency !== "weekly" && frequency !== "biweekly" && frequency !== "once" && !inMonth(input.dueDayOfMonth)) next.dayOfMonth = "Due day must be 1-31.";
    if (frequency === "semi_monthly" && (!inMonth(input.dueSecondDayOfMonth) || input.dueSecondDayOfMonth === input.dueDayOfMonth)) next.secondDayOfMonth = "The second due day must be 1-31 and differ from the first.";
    if (frequency === "yearly" && month == null) next.month = "Select the month.";
    if (input.endsOn && input.endsOn < startsOn) next.endsOn = "The end date must be on or after the start date.";
    return next;
  }

  function clearError(field: Field) {
    if (errors[field]) setErrors(({ [field]: _cleared, ...rest }) => rest);
  }

  async function handleSave() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setFormError(INVALID); return; }
    setFormError(null);
    setSaving(true);
    try {
      if (scheduledPaymentId) await updateScheduledPayment(userId, deviceId, scheduledPaymentId, input);
      else await createScheduledPayment(userId, deviceId, input);
      onSaved("Your obligation changes were saved. Continue managing your obligations.");
    } catch (error) {
      setFormError(error instanceof LocalDbError ? error.message : "Your obligation could not be saved because some details are invalid. Correct the marked fields and try again.");
      setSaving(false);
    }
  }

  if (picker === "category") {
    return <CategorySelectorPage userId={userId} kind="expense" initialSubcategoryId={subcategoryId ?? undefined} onClose={() => setPicker(null)} onSelect={(selection) => { setSubcategoryId(selection.id); setPicker(null); }} />;
  }

  const usesWeekday = frequency === "weekly" || frequency === "biweekly";
  const usesDayOfMonth = !usesWeekday && frequency !== "daily" && frequency !== "once";
  // A payment saved with a cadence the form no longer offers keeps it selectable.
  const frequencyOptions = FREQUENCY_OPTIONS.some((option) => option.key === frequency) ? FREQUENCY_OPTIONS : [...FREQUENCY_OPTIONS, { key: frequency, label: FREQUENCY_LABELS[frequency] }];
  const accountName = accounts.find((account) => account.id === sourceAccountId)?.name;
  const categoryName = subcategories.find((subcategory) => subcategory.id === subcategoryId)?.label;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: v4.shell }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}><ArrowLeft color={v4.ink} size={20} weight="bold" /></Pressable>
        <Text style={{ flex: 1, fontFamily: v4Font, fontWeight: "800", fontSize: 16.5, color: v4.ink }}>{isEdit ? "Edit biller or remittance" : "Add biller or remittance"}</Text>
      </View>
      {loading ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={v4.brand} /></View> : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Note>Fields marked with (*) are required</Note>
          {formError ? <Banner tone="error">{formError}</Banner> : null}
          <FormCard>
            <View>
              <TextField label="Name *" value={name} onChangeText={(value) => { setName(value); clearError("name"); }} placeholder="e.g. Rent" maxLength={120} error={Boolean(errors.name)} accessibilityLabel="Name" />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </View>
            <View>
              <PickerField label="Category (optional)" value={categoryName ?? "No category"} placeholder={!categoryName} onPress={() => setPicker("category")} />
              {subcategoryId ? <Pressable onPress={() => setSubcategoryId(null)} accessibilityRole="button" hitSlop={6}><Text style={[ui.note, { color: v4.brandMid, fontWeight: "700", marginTop: 4 }]}>Remove category</Text></Pressable> : null}
            </View>
            <View>
              <TextField label="Amount *" value={amount} onChangeText={(value) => { setAmount(value); clearError("amount"); }} placeholder="0.00" suffix="₱" keyboardType="decimal-pad" error={Boolean(errors.amount)} accessibilityLabel="Amount" />
              {errors.amount ? <FieldError>{errors.amount}</FieldError> : null}
            </View>
            <View>
              <PickerField label="Pay from *" value={accountName ?? "Select account"} placeholder={!accountName} error={Boolean(errors.account)} onPress={() => setPicker("account")} />
              {errors.account ? <FieldError>{errors.account}</FieldError> : null}
            </View>
            {isEdit ? (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}><FieldLabel>Next post</FieldLabel><Text style={ui.listTitle}>{nextPost ? formatDueDate(nextPost) : "None"}</Text></View>
                <View style={{ flex: 1 }}><FieldLabel>Last posted</FieldLabel><Text style={ui.listTitle}>{lastPosted ? formatDueDate(lastPosted) : "Not yet"}</Text></View>
              </View>
            ) : null}
          </FormCard>

          <FormCard title="Schedule">
            <View>
              <FieldLabel>REPEAT</FieldLabel>
              <View style={ui.chips}>
                {frequencyOptions.map((option) => <Chip key={option.key} label={option.label} selected={frequency === option.key} onPress={() => { setFrequency(option.key); if (option.key === "once") setAutoPost(false); }} />)}
              </View>
            </View>
            {usesWeekday ? (
              <View>
                <FieldLabel>DAY OF WEEK *</FieldLabel>
                <View style={ui.chips}>{WEEKDAYS.map((label, index) => <Chip key={label} label={label} selected={dayOfWeek === index} onPress={() => { setDayOfWeek(index); clearError("dayOfWeek"); }} />)}</View>
                {errors.dayOfWeek ? <FieldError>{errors.dayOfWeek}</FieldError> : null}
              </View>
            ) : null}
            {frequency === "yearly" ? (
              <View>
                <FieldLabel>MONTH *</FieldLabel>
                <View style={ui.chips}>{MONTHS.map((label, index) => <Chip key={label} label={label} selected={month === index + 1} onPress={() => { setMonth(index + 1); clearError("month"); }} />)}</View>
                {errors.month ? <FieldError>{errors.month}</FieldError> : null}
              </View>
            ) : null}
            {usesDayOfMonth ? (
              <View>
                <TextField label={frequency === "semi_monthly" ? "First day of month *" : "Day of month *"} value={dayOfMonth} onChangeText={(value) => { setDayOfMonth(value); clearError("dayOfMonth"); }} placeholder="5" keyboardType="number-pad" maxLength={2} error={Boolean(errors.dayOfMonth)} />
                {errors.dayOfMonth ? <FieldError>{errors.dayOfMonth}</FieldError> : null}
              </View>
            ) : null}
            {frequency === "semi_monthly" ? (
              <View>
                <TextField label="Second day of month *" value={secondDayOfMonth} onChangeText={(value) => { setSecondDayOfMonth(value); clearError("secondDayOfMonth"); }} placeholder="30" keyboardType="number-pad" maxLength={2} error={Boolean(errors.secondDayOfMonth)} />
                {errors.secondDayOfMonth ? <FieldError>{errors.secondDayOfMonth}</FieldError> : null}
              </View>
            ) : null}
            <DateField label={frequency === "once" ? "Due date" : "Starts on"} value={startsOn} placeholder="Select start date" onChange={setStartsOn} />
            {frequency !== "once" ? (
              <View>
                <DateField label="Ends on (optional)" value={endsOn} placeholder="Select end date" onChange={(value) => { setEndsOn(value); clearError("endsOn"); }} error={Boolean(errors.endsOn)} />
                {errors.endsOn ? <FieldError>{errors.endsOn}</FieldError> : endsOn ? <Pressable onPress={() => setEndsOn(null)} accessibilityRole="button" hitSlop={6}><Text style={[ui.note, { color: v4.brandMid, fontWeight: "700", marginTop: 4 }]}>Remove end date</Text></Pressable> : null}
              </View>
            ) : null}
            {!isEdit && nextPost && frequency !== "once" ? <Note>Next post: {formatDueDate(nextPost)}</Note> : null}
            <Note>Payments are kept in your Financial Plan even when money is tight.</Note>
          </FormCard>

          <FormCard title="Auto-post" right={<Switch value={autoPost} onToggle={() => setAutoPost(!autoPost)} disabled={frequency === "once"} accessibilityLabel="Post automatically on the due date" />}>
            <Text style={ui.listTitle}>Post automatically on the due date</Text>
            <Note>{frequency === "once" ? "Auto-post needs a repeat. Pick a frequency to turn it on." : "Budgie records the transaction on the due date and deducts it from your budget."}</Note>
          </FormCard>

          <FormCard>
            <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Add any details" multiline maxLength={1000} />
            <Note>Optional</Note>
          </FormCard>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={onClose} disabled={saving} accessibilityRole="button" style={[ui.button, ui.buttonGhost, { flex: 1 }]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Cancel</Text></Pressable>
            <Pressable onPress={handleSave} disabled={saving} accessibilityRole="button" accessibilityState={{ disabled: saving }} style={[ui.button, { flex: 1, opacity: saving ? 0.6 : 1 }]}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={ui.buttonText}>{saving ? "Saving…" : isEdit ? "Save changes" : "Add payment"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
      <AccountPickerSheet visible={picker === "account"} accounts={accounts} selectedId={sourceAccountId} onSelect={(id) => { setSourceAccountId(id); clearError("account"); }} onClose={() => setPicker(null)} />
    </KeyboardAvoidingView>
  );
}
