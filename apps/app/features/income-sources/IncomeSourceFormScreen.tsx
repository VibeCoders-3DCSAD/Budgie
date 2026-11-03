import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { ArrowLeft, MagnifyingGlass, Tag } from "phosphor-react-native";
import { Banner, BottomSheet, Chip, FieldError, FieldLabel, FormCard, MonthEndNote, Note, OptionRow, PickerField, SectionLabel, TextField, styles as ui, v4, v4Font } from "../../components/BudgieForm";
import {
  createIncomeSource,
  getIncomeSource,
  incomeScheduleError,
  listAccountOptions,
  updateIncomeSource,
  type AccountOption,
  type IncomeFrequency,
} from "../../local-db/repositories/foundations/financialFoundations";
import { listSubcategories, type Subcategory } from "../../local-db/repositories/ledger/taxonomy";
import { FREQUENCIES, FREQUENCY_LABELS } from "./presentation";
import { formatPeso, parseLenientCentavos } from "../../lib/format/money";

type Props = { userId: string; deviceId: string; incomeSourceId?: string; onClose: () => void; onSaved: (message: string) => void };
type Field = "name" | "account" | "category" | "schedule" | "amount";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const ACCOUNT_KIND_LABELS: Record<string, string> = {
  cash: "Cash", bank: "Bank", e_wallet: "E-Wallet", savings: "Savings", credit_card: "Credit Card", other: "Other",
};

function parseDayOfMonth(value: string): number | null {
  const day = Number(value);
  return value.trim() && Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

export default function IncomeSourceFormScreen({ userId, deviceId, incomeSourceId, onClose, onSaved }: Props) {
  const isEdit = Boolean(incomeSourceId);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [name, setName] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<IncomeFrequency>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState("");
  const [secondDayOfMonth, setSecondDayOfMonth] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [picker, setPicker] = useState<"account" | "category" | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [accountRows, subcategoryRows, existing] = await Promise.all([
        listAccountOptions(userId),
        listSubcategories(userId, undefined, "income"),
        incomeSourceId ? getIncomeSource(userId, incomeSourceId) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setAccounts(accountRows);
      setSubcategories(subcategoryRows);
      if (existing) {
        setName(existing.name);
        setDestinationAccountId(existing.destinationAccountId);
        setSubcategoryId(existing.subcategoryId);
        setFrequency(existing.frequency);
        setDayOfMonth(existing.paydayDayOfMonth != null ? String(existing.paydayDayOfMonth) : "");
        setSecondDayOfMonth(existing.paydaySecondDayOfMonth != null ? String(existing.paydaySecondDayOfMonth) : "");
        setDayOfWeek(existing.paydayDayOfWeek);
        setAmount(String(existing.expectedAmountCentavos / 100));
        setNotes(existing.notes ?? "");
      }
      setLoading(false);
    })().catch(() => {
      if (!cancelled) { setFormError("Your income source could not be loaded. Try again."); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [userId, incomeSourceId]);

  const schedule = {
    frequency,
    paydayDayOfMonth: parseDayOfMonth(dayOfMonth),
    paydaySecondDayOfMonth: parseDayOfMonth(secondDayOfMonth),
    paydayDayOfWeek: dayOfWeek,
  };

  function clearError(field: Field) {
    if (errors[field]) setErrors(({ [field]: _cleared, ...rest }) => rest);
  }

  async function handleSave() {
    const amountCentavos = parseLenientCentavos(amount);
    const next: Partial<Record<Field, string>> = {};
    if (!name.trim()) next.name = "Name is required.";
    if (!destinationAccountId) next.account = "Destination account is required.";
    if (!subcategoryId) next.category = "Income category is required.";
    const scheduleError = incomeScheduleError(schedule);
    if (scheduleError) next.schedule = scheduleError;
    if (amountCentavos === null || amountCentavos <= 0) next.amount = "Expected amount must be greater than zero.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0 || amountCentavos === null || !destinationAccountId || !subcategoryId) return;

    const input = { name: name.trim(), destinationAccountId, subcategoryId, expectedAmountCentavos: amountCentavos, ...schedule, notes: notes.trim() || null };
    setSaving(true);
    try {
      if (incomeSourceId) await updateIncomeSource(userId, deviceId, incomeSourceId, input);
      else await createIncomeSource(userId, deviceId, input);
      onSaved(isEdit ? "Your income source changes were saved." : "Your income source was added.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Your income source could not be saved. Try again.");
      setSaving(false);
    }
  }

  const enteredDays = frequency === "semi_monthly" ? [schedule.paydayDayOfMonth, schedule.paydaySecondDayOfMonth] : frequency === "monthly" ? [schedule.paydayDayOfMonth] : [];
  const accountName = accounts.find((account) => account.id === destinationAccountId)?.name;
  const categoryName = subcategories.find((subcategory) => subcategory.id === subcategoryId)?.label;
  const search = categorySearch.trim().toLowerCase();
  const visibleCategories = search ? subcategories.filter((subcategory) => subcategory.label.toLowerCase().includes(search)) : subcategories;
  const dayField = (label: string, value: string, setValue: (value: string) => void, placeholder: string) => (
    <TextField label={label} value={value} onChangeText={(next) => { setValue(next); clearError("schedule"); }} placeholder={placeholder} keyboardType="number-pad" maxLength={2} error={Boolean(errors.schedule) && parseDayOfMonth(value) === null} accessibilityLabel={label.replace(" *", "")} />
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: v4.shell }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}><ArrowLeft color={v4.ink} size={20} weight="bold" /></Pressable>
        <Text style={{ flex: 1, fontFamily: v4Font, fontWeight: "800", fontSize: 16.5, color: v4.ink }}>{isEdit ? "Edit income source" : "Add income source"}</Text>
      </View>
      {loading ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={v4.brand} /></View> : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Note>Fields marked with (*) are required</Note>

          <FormCard>
            <View>
              <TextField label="Name *" value={name} onChangeText={(value) => { setName(value); clearError("name"); }} placeholder={errors.name ? "Enter a name" : "e.g. Salary"} maxLength={120} icon={<Tag color={v4.mut} size={16} />} error={Boolean(errors.name)} accessibilityLabel="Name" />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </View>
            <PickerField label="Destination account *" value={accountName ?? "Select account"} placeholder={!accountName} error={Boolean(errors.account)} onPress={() => setPicker("account")} />
            {errors.account ? <Banner tone="error">{errors.account}</Banner> : null}
            <PickerField label="Income category *" value={categoryName ?? "Select category"} placeholder={!categoryName} error={Boolean(errors.category)} onPress={() => { setCategorySearch(""); setPicker("category"); }} />
            {errors.category ? <Banner tone="error">{errors.category}</Banner> : null}
          </FormCard>

          <FormCard>
            <View>
              <SectionLabel>FREQUENCY</SectionLabel>
              <View style={ui.chips}>
                {FREQUENCIES.map((option) => <Chip key={option} label={FREQUENCY_LABELS[option]} selected={frequency === option} onPress={() => { setFrequency(option); clearError("schedule"); }} />)}
              </View>
            </View>
            {frequency === "monthly" ? dayField("Payday *", dayOfMonth, setDayOfMonth, "15") : null}
            {frequency === "semi_monthly" ? (
              <>
                {dayField("Date 1 *", dayOfMonth, setDayOfMonth, "15")}
                {dayField("Date 2 *", secondDayOfMonth, setSecondDayOfMonth, "30")}
              </>
            ) : null}
            {frequency === "weekly" ? (
              <View>
                <FieldLabel>Payday *</FieldLabel>
                <View style={ui.chips}>
                  {WEEKDAYS.map((label, index) => <Chip key={label} label={label} selected={dayOfWeek === index} onPress={() => { setDayOfWeek(index); clearError("schedule"); }} />)}
                </View>
              </View>
            ) : null}
            {errors.schedule ? <FieldError>{errors.schedule}</FieldError> : null}
            <MonthEndNote days={enteredDays} />
          </FormCard>

          <FormCard>
            <View>
              <TextField label="Expected amount *" value={amount} onChangeText={(value) => { setAmount(value); clearError("amount"); }} placeholder="0.00" suffix={errors.amount ? undefined : "₱"} keyboardType="decimal-pad" error={Boolean(errors.amount)} accessibilityLabel="Expected amount" />
              {errors.amount ? <FieldError>{errors.amount}</FieldError> : null}
            </View>
            <View>
              <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Add any details" maxLength={1000} accessibilityLabel="Notes" />
              <Text style={{ fontFamily: v4Font, fontSize: 10.5, color: v4.ink2, marginTop: 4 }}>Optional</Text>
            </View>
          </FormCard>

          {formError ? <Banner tone="error">{formError}</Banner> : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={onClose} disabled={saving} accessibilityRole="button" style={[ui.button, ui.buttonGhost, { flex: 1 }, saving ? ui.dimmed : null]}>
              <Text style={[ui.buttonText, ui.buttonGhostText]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving} accessibilityRole="button" accessibilityState={{ disabled: saving }} style={[ui.button, { flex: 1 }, saving ? ui.dimmed : null]}>
              {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
              <Text style={ui.buttonText}>{saving ? "Saving…" : isEdit ? "Save changes" : "Add income source"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      <BottomSheet visible={picker === "account"} onClose={() => setPicker(null)} title="Select destination account">
        {accounts.map((account) => (
          <OptionRow key={account.id} title={account.name} subtitle={`${ACCOUNT_KIND_LABELS[account.kind] ?? account.kind} · ${formatPeso(account.currentBalanceCentavos)}`} selected={account.id === destinationAccountId} onPress={() => { setDestinationAccountId(account.id); clearError("account"); setPicker(null); }} />
        ))}
      </BottomSheet>

      <BottomSheet visible={picker === "category"} onClose={() => setPicker(null)} title="Select income category">
        <TextField label="Search" value={categorySearch} onChangeText={setCategorySearch} placeholder="Search categories" icon={<MagnifyingGlass color={v4.mut} size={16} />} accessibilityLabel="Search categories" />
        {visibleCategories.map((subcategory) => (
          <OptionRow key={subcategory.id} title={subcategory.label} subtitle="Income" selected={subcategory.id === subcategoryId} onPress={() => { setSubcategoryId(subcategory.id); clearError("category"); setPicker(null); }} />
        ))}
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}
