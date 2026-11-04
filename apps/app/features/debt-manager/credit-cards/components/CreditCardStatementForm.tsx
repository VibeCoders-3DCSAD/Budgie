import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { createCreditCardStatement } from "../../../../local-db/repositories/credit-cards/creditCardStatements";
import { BottomSheetSurface } from "../../../../components/BottomSheetSurface";
import { ActionSheet } from "../../../../components/ActionSheet";
import { parseExactCentavos } from "../../../../lib/format/money";
import { formatDeviceDate } from "../../../../lib/dates";
import { WithTermInfo } from "../../../../components/TermInfo";

const P = {
  shell: "#fcf8f0",
  brand: "#013220",
  ink: "#1B1C1A",
  muted: "#6B7A6F",
  line: "#EAEAE6",
  card: "#F1F0EB",
  error: "#D9001F",
  white: "#FFFFFF",
} as const;

type Props = {
  userId: string;
  deviceId: string;
  cycleId: string;
  cycleCutoffDate: string;
  today: string;
  onSaved: () => Promise<void>;
  onCancel: () => void;
};

function dateFromIso(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

export default function CreditCardStatementForm({ userId, deviceId, cycleId, cycleCutoffDate, today, onSaved, onCancel }: Props) {
  const [statementDate, setStatementDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [balance, setBalance] = useState("");
  const [minimumDue, setMinimumDue] = useState("");
  const [financeCharge, setFinanceCharge] = useState("");
  const [picker, setPicker] = useState<"statement" | "due" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);

  const selectDate = (kind: "statement" | "due") => (_event: DateTimePickerEvent, date?: Date) => {
    if (!date) return;
    if (kind === "statement") {
      const value = formatDeviceDate(date);
      if (value < cycleCutoffDate || value > today) return;
      setStatementDate(value);
    }
    else setDueDate(formatDeviceDate(date));
    setInvalidFields((fields) => fields.filter((field) => field !== kind));
    setError(null);
    if (Platform.OS !== "ios") setPicker(null);
  };

  const selectedDate = picker === "statement" ? statementDate : dueDate;

  async function submit() {
    const statementBalance = parseExactCentavos(balance);
    const minimum = parseExactCentavos(minimumDue);
    const finance = financeCharge.trim() === "" ? 0 : parseExactCentavos(financeCharge);
    const invalid = [
      !statementDate || statementDate < cycleCutoffDate || statementDate > today ? "statement" : null,
      !dueDate ? "due" : null,
      statementBalance === null ? "balance" : null,
      minimum === null || minimum > (statementBalance ?? 0) ? "minimum" : null,
      finance === null ? "finance" : null,
    ].filter((field): field is string => field !== null);
    if (invalid.length > 0) {
      setInvalidFields(invalid);
      setError("Some statement details are not valid. Check the highlighted fields and try again.");
      return;
    }
    setSaving(true);
    setNotice("Your statement is being recorded. Please wait before trying again.");
    setError(null);
    try {
      await createCreditCardStatement(userId, deviceId, {
        cycle_id: cycleId, statement_date: statementDate!, due_date: dueDate!,
        statement_balance_centavos: statementBalance!, minimum_due_centavos: minimum!,
        finance_charge_centavos: finance!,
      });
      await onSaved();
      setRecorded(true);
      setNotice("Your statement was recorded. Review the payment requirement before continuing.");
    } catch {
      setNotice(null);
      setError("Your statement could not be recorded. Check the details and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: P.line, backgroundColor: P.card }}>
      <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 14, color: P.ink }}>Record statement</Text>
      <Text style={{ fontFamily: "Manrope", fontSize: 11.5, color: P.muted, marginTop: 4, marginBottom: 14 }}>Use the amounts and dates shown on your card issuer's statement.</Text>

      <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11.5, color: P.ink, marginBottom: 6 }}>Statement date</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Select statement date" onPress={() => setPicker("statement")} style={{ minHeight: 46, borderWidth: 1, borderColor: invalidFields.includes("statement") ? P.error : P.line, backgroundColor: P.shell, borderRadius: 10, paddingHorizontal: 12, justifyContent: "center" }}>
        <Text style={{ fontFamily: "Manrope", fontSize: 14, color: statementDate ? P.ink : P.muted }}>{statementDate ?? "Select a date"}</Text>
      </Pressable>
      <Text style={{ fontFamily: "Manrope", fontSize: 11, color: P.muted, marginTop: 4 }}>On or after {cycleCutoffDate} and no later than {today}.</Text>
      {invalidFields.includes("statement") ? <Text style={{ fontFamily: "Manrope", fontSize: 11, color: P.error, marginTop: 4 }}>{!statementDate ? "Statement date is required." : "Choose a statement date on or after the billing-cycle cutoff and no later than today."}</Text> : null}

      <WithTermInfo term="statement-balance" style={{ marginTop: 12, marginBottom: 6 }}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11.5, color: P.ink }}>Statement balance</Text></WithTermInfo>
      <TextInput value={balance} onChangeText={(value) => { setBalance(value); setInvalidFields((fields) => fields.filter((field) => field !== "balance")); setError(null); }} keyboardType="decimal-pad" placeholder="Enter statement balance" placeholderTextColor={P.muted} style={{ height: 46, borderWidth: 1, borderColor: invalidFields.includes("balance") ? P.error : P.line, color: P.ink, backgroundColor: P.shell, paddingHorizontal: 12, borderRadius: 10, fontFamily: "Manrope", fontSize: 14 }} />

      <WithTermInfo term="minimum-amount-due" style={{ marginTop: 12, marginBottom: 6 }}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11.5, color: P.ink }}>Minimum amount due</Text></WithTermInfo>
      <TextInput value={minimumDue} onChangeText={(value) => { setMinimumDue(value); setInvalidFields((fields) => fields.filter((field) => field !== "minimum")); setError(null); }} keyboardType="decimal-pad" placeholder="Enter minimum amount due" placeholderTextColor={P.muted} style={{ height: 46, borderWidth: 1, borderColor: invalidFields.includes("minimum") ? P.error : P.line, color: P.ink, backgroundColor: P.shell, paddingHorizontal: 12, borderRadius: 10, fontFamily: "Manrope", fontSize: 14 }} />

      <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11.5, color: P.ink, marginTop: 12, marginBottom: 6 }}>Finance charges or interest</Text>
      <TextInput value={financeCharge} onChangeText={(value) => { setFinanceCharge(value); setInvalidFields((fields) => fields.filter((field) => field !== "finance")); setError(null); }} keyboardType="decimal-pad" placeholder="Enter amount, or leave blank" placeholderTextColor={P.muted} style={{ height: 46, borderWidth: 1, borderColor: invalidFields.includes("finance") ? P.error : P.line, color: P.ink, backgroundColor: P.shell, paddingHorizontal: 12, borderRadius: 10, fontFamily: "Manrope", fontSize: 14 }} />

      <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11.5, color: P.ink, marginTop: 12, marginBottom: 6 }}>Payment due date</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Select due date" onPress={() => setPicker("due")} style={{ minHeight: 46, borderWidth: 1, borderColor: invalidFields.includes("due") ? P.error : P.line, backgroundColor: P.shell, borderRadius: 10, paddingHorizontal: 12, justifyContent: "center" }}>
        <Text style={{ fontFamily: "Manrope", fontSize: 14, color: dueDate ? P.ink : P.muted }}>{dueDate ?? "Select a date"}</Text>
      </Pressable>
      {invalidFields.includes("due") ? <Text style={{ fontFamily: "Manrope", fontSize: 11, color: P.error, marginTop: 4 }}>Due date is required.</Text> : null}

      {picker && Platform.OS !== "ios" ? <DateTimePicker value={dateFromIso(selectedDate ?? today)} mode="date" minimumDate={picker === "statement" ? dateFromIso(cycleCutoffDate) : undefined} maximumDate={picker === "statement" ? dateFromIso(today) : undefined} onChange={selectDate(picker)} /> : null}
      {Platform.OS === "ios" ? (
        <ActionSheet visible={picker !== null} onClose={() => setPicker(null)} backdropColor="rgba(0, 0, 0, 0.35)">
          {picker ? <Pressable onPress={() => {}}>
              <BottomSheetSurface bottomSpacing={28} style={{ backgroundColor: P.shell, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Cancel date selection" onPress={() => setPicker(null)}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: P.muted }}>Cancel</Text></Pressable>
                  <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 14, color: P.ink }}>{picker === "statement" ? "Statement date" : "Payment due date"}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Confirm date selection" onPress={() => setPicker(null)}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: P.brand }}>Done</Text></Pressable>
                </View>
                 <DateTimePicker value={dateFromIso(selectedDate ?? today)} mode="date" display="spinner" minimumDate={picker === "statement" ? dateFromIso(cycleCutoffDate) : undefined} maximumDate={picker === "statement" ? dateFromIso(today) : undefined} onChange={selectDate(picker)} />
              </BottomSheetSurface>
          </Pressable> : null}
        </ActionSheet>
      ) : null}
      {error ? <Text style={{ fontFamily: "Manrope", fontSize: 12, color: P.error, marginTop: 12 }}>{error}</Text> : null}
      {notice ? <Text style={{ fontFamily: "Manrope", fontSize: 12, color: P.muted, marginTop: 12 }}>{notice}</Text> : null}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <Pressable accessibilityRole="button" onPress={onCancel} disabled={saving} style={{ flex: 1, height: 46, borderWidth: 1, borderColor: P.line, borderRadius: 10, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13, color: P.ink }}>Cancel</Text></Pressable>
         <Pressable accessibilityRole="button" disabled={saving || recorded} onPress={() => { submit().catch(() => {}); }} style={{ flex: 1, height: 46, backgroundColor: P.brand, borderRadius: 10, alignItems: "center", justifyContent: "center", opacity: saving || recorded ? 0.6 : 1 }}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13, color: P.white }}>{saving ? "Saving..." : recorded ? "Saved" : "Record statement"}</Text></Pressable>
      </View>
    </View>
  );
}
