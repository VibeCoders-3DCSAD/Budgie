import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { SAVINGS_GOAL_PLACEHOLDERS, SAVINGS_GOAL_PRIORITY_LABELS, SAVINGS_GOAL_PRIORITIES, type SavingsGoalPriority, type SavingsGoalType } from "../constants";
import { LocalDbError } from "../../../local-db/helpers";
import { createSavingsGoal, updateSavingsGoal, type SavingsGoal } from "../../../local-db/repositories/savings/savingsGoals";
import RecurringScheduleFields, { type RecurringScheduleFrequency, type RecurringScheduleValue } from "../../../components/RecurringScheduleFields";
import { MonthEndNote } from "../../../components/BudgieForm";
import { manilaToday } from "../../../lib/dates";
import { deriveGoalContributionDate, GOAL_CONTRIBUTION_FREQUENCIES, type GoalContributionFrequency } from "../helpers/contributionSchedule";
import { recommendGoalContribution } from "../helpers/contributionRecommendation";
import EmergencyFundTargetSuggestion from "./EmergencyFundTargetSuggestion";
import SavingsGoalAccountSelector from "./SavingsGoalAccountSelector";
import { SavingsDate } from "./SavingsFormControls";
import { formatPeso } from "../../../lib/format/money";

const P = { card: "#F1F0EB", ink: "#1B1C1A", muted: "#6B7A6F", brand: "#013220", line: "#EAEAE6", error: "#D9001F", white: "#FFFFFF" } as const;

const CONTRIBUTION_OPTIONS: { label: string; value: GoalContributionFrequency | null }[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Twice a Month", value: "semi_monthly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
  { label: "None", value: null },
];

type Props = { userId: string; deviceId: string; goal?: SavingsGoal; initialLinkedAccountId?: string; onCancel: () => void; onSaved: (goal: SavingsGoal) => void };

function toCentavos(value: string) { const amount = Number(value.replace(/,/g, "")); return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN; }
function fromCentavos(value: number) { return String(value / 100); }

function Field({ label, value, onChangeText, placeholder, numeric, currency, invalid }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; numeric?: boolean; currency?: boolean; invalid?: boolean }) {
  return <View style={{ gap: 5 }}><Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} onBlur={currency ? () => { const centavos = toCentavos(value); if (value.trim() && Number.isSafeInteger(centavos)) onChangeText((centavos / 100).toFixed(2)); } : undefined} placeholder={placeholder} placeholderTextColor="#919A91" keyboardType={numeric ? "decimal-pad" : "default"} style={{ backgroundColor: P.white, borderColor: invalid ? P.error : P.line, borderRadius: 10, borderWidth: 1, color: P.ink, fontFamily: "Manrope", fontSize: 14, minHeight: 46, paddingHorizontal: 12 }} /></View>;
}

export default function SavingsGoalForm({ userId, deviceId, goal, initialLinkedAccountId, onCancel, onSaved }: Props) {
  const goalType: SavingsGoalType = goal?.goalType ?? "custom";
  const [name, setName] = useState(goal?.name ?? "");
  const [linkedAccountId, setLinkedAccountId] = useState(goal?.linkedAccountId ?? initialLinkedAccountId ?? null);
  const [accountInvalid, setAccountInvalid] = useState(false);
  const [target, setTarget] = useState(goal ? (goal.targetAmountCentavos / 100).toFixed(2) : "");
  const [starting, setStarting] = useState(goal ? (goal.startingAmountCentavos / 100).toFixed(2) : "0.00");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [priority, setPriority] = useState<SavingsGoalPriority>(goal?.priority ?? "high");
  const [isEmergencyFund, setIsEmergencyFund] = useState(goal?.isEmergencyFund ?? false);
  const baseline = goal?.emergencyFundBaselineCentavos ?? null;
  const [plannedContribution, setPlannedContribution] = useState(goal ? fromCentavos(goal.plannedContributionAmountCentavos) : "0");
  const [contributionFrequency, setContributionFrequency] = useState<GoalContributionFrequency | null>(goal ? goal.contributionFrequency : "monthly");
  const [contributionDay, setContributionDay] = useState(goal?.contributionDayOfMonth != null ? String(goal.contributionDayOfMonth) : (goal?.contributionFrequency === "monthly" || goal?.contributionFrequency === "yearly") && goal.nextContributionDate ? String(Number(goal.nextContributionDate.slice(8, 10))) : "");
  const goalMonth = goal?.contributionFrequency === "yearly" && goal.nextContributionDate ? Number(goal.nextContributionDate.slice(5, 7)) : null;
  const [contributionMonth, setContributionMonth] = useState<number | null>(goalMonth);
  const [contributionSecondDay, setContributionSecondDay] = useState(goal?.contributionSecondDayOfMonth != null ? String(goal.contributionSecondDayOfMonth) : "");
  const [contributionDayOfWeek, setContributionDayOfWeek] = useState<number | null>(goal?.contributionDayOfWeek ?? (goal?.contributionFrequency === "weekly" && goal.nextContributionDate ? new Date(`${goal.nextContributionDate}T00:00:00Z`).getUTCDay() : null));
  const [customIntervalDays, setCustomIntervalDays] = useState(goal?.customIntervalDays != null ? String(goal.customIntervalDays) : "");
  const [interestRate, setInterestRate] = useState(goal?.interestRateBps != null ? String(goal.interestRateBps / 100) : "");
  const [notes, setNotes] = useState(goal?.notes ?? "");
  const [duplicateName, setDuplicateName] = useState(false);
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (!goal && !linkedAccountId) { setAccountInvalid(true); setMessage("Select an active financial account for this savings goal."); return; }
    const targetAmountCentavos = toCentavos(target); const startingAmountCentavos = toCentavos(starting); const plannedContributionAmountCentavos = contributionFrequency === null ? 0 : toCentavos(plannedContribution); const interestRateBps = interestRate.trim() ? Math.round(Number(interestRate) * 100) : null;
    const contributionDayOfMonth = contributionDay.trim() ? Number(contributionDay) : null; const contributionSecondDayOfMonth = contributionSecondDay.trim() ? Number(contributionSecondDay) : null; const parsedCustomIntervalDays = customIntervalDays.trim() ? Number(customIntervalDays) : null;
    if (!name.trim() || !targetDate || !Number.isSafeInteger(targetAmountCentavos) || targetAmountCentavos <= 0 || !Number.isSafeInteger(startingAmountCentavos) || startingAmountCentavos < 0 || !Number.isSafeInteger(plannedContributionAmountCentavos) || plannedContributionAmountCentavos < 0 || (interestRateBps != null && (!Number.isSafeInteger(interestRateBps) || interestRateBps < 0))) {
      setMessage("Check the highlighted fields and try again."); return;
    }
    const timing = { contributionFrequency, contributionDayOfMonth, contributionSecondDayOfMonth, contributionDayOfWeek, contributionMonth };
    const unchangedTiming = goal && contributionFrequency === goal.contributionFrequency && contributionDayOfMonth === (goal.contributionDayOfMonth ?? ((goal.contributionFrequency === "monthly" || goal.contributionFrequency === "yearly") && goal.nextContributionDate ? Number(goal.nextContributionDate.slice(8, 10)) : null)) && contributionMonth === goalMonth && contributionSecondDayOfMonth === goal.contributionSecondDayOfMonth && contributionDayOfWeek === (goal.contributionDayOfWeek ?? (goal.contributionFrequency === "weekly" && goal.nextContributionDate ? new Date(`${goal.nextContributionDate}T00:00:00Z`).getUTCDay() : null));
    let nextContributionDate: string | null;
    try {
      // Preserve an existing schedule's history when its timing has not changed.
      const legacyFrequency = contributionFrequency !== null && !CONTRIBUTION_OPTIONS.some((option) => option.value === contributionFrequency);
      const derivedDate = legacyFrequency ? goal?.nextContributionDate ?? null : deriveGoalContributionDate(timing, manilaToday());
      nextContributionDate = contributionFrequency === null ? null : unchangedTiming && goal.nextContributionDate ? goal.nextContributionDate : derivedDate;
      if (nextContributionDate && nextContributionDate > targetDate) {
        setMessage("The selected contribution schedule has no date on or before the target date."); return;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check the contribution schedule."); return;
    }
    setSaving(true); setMessage(null);
    try {
      const input = { name, goalType, targetAmountCentavos, startingAmountCentavos, targetDate, priority, isEmergencyFund, emergencyFundBaselineCentavos: goalType === "emergency_fund" ? baseline : null, autoSaveAmountCentavos: plannedContributionAmountCentavos, plannedContributionAmountCentavos, contributionFrequency, contributionIntervalCount: contributionFrequency === null ? null : contributionFrequency === goal?.contributionFrequency ? goal.contributionIntervalCount ?? 1 : 1, contributionDayOfMonth: contributionFrequency === "semi_monthly" || contributionFrequency === "monthly" || contributionFrequency === "quarterly" ? contributionDayOfMonth : null, contributionSecondDayOfMonth: contributionFrequency === "semi_monthly" ? contributionSecondDayOfMonth : null, contributionDayOfWeek: contributionFrequency === "weekly" || contributionFrequency === "biweekly" ? contributionDayOfWeek : null, customIntervalDays: contributionFrequency === "custom" ? parsedCustomIntervalDays : null, nextContributionDate: contributionFrequency === null ? null : nextContributionDate, interestRateBps, notes };
      const accountLink = goal && linkedAccountId === (goal.linkedAccountId ?? null) ? {} : { linkedAccountId };
      const result = goal ? await updateSavingsGoal(userId, deviceId, goal.id, { ...input, ...accountLink }) : await createSavingsGoal(userId, deviceId, { ...input, linkedAccountId });
      onSaved(result.goal);
    } catch (error) {
      if (error instanceof LocalDbError && error.code === "DUPLICATE_NAME") {
        setDuplicateName(true);
        setMessage("A savings goal with this name already exists. Choose a different name.");
        return;
      }
      if (error instanceof LocalDbError && error.code === "VALIDATION_ERROR") {
        setAccountInvalid(true);
        setMessage("Check your goal details and select an active financial account.");
        return;
      }
      setMessage("Your savings information could not be saved. Check your details and try again.");
    } finally { setSaving(false); }
  }

  const invalid = Boolean(message);
  const suggestedContribution = toCentavos(starting) < 0 ? null : recommendGoalContribution({
    plannedContributionAmountCentavos: 0,
    contributionFrequency,
    contributionIntervalCount: contributionFrequency === goal?.contributionFrequency ? goal.contributionIntervalCount ?? 1 : 1,
    contributionDayOfMonth: contributionDay.trim() ? Number(contributionDay) : null,
    contributionSecondDayOfMonth: contributionSecondDay.trim() ? Number(contributionSecondDay) : null,
    contributionDayOfWeek,
    customIntervalDays: customIntervalDays.trim() ? Number(customIntervalDays) : null,
    nextContributionDate: goal?.nextContributionDate ?? null,
    contributionMonth,
  }, toCentavos(target), toCentavos(starting) + (goal ? goal.currentAmountCentavos - goal.startingAmountCentavos : 0), targetDate, manilaToday());
  const scheduleValue: RecurringScheduleValue = { frequency: contributionFrequency ?? "monthly", intervalCount: "1", dayOfMonth: contributionDay, secondDayOfMonth: contributionSecondDay, dayOfWeek: contributionDayOfWeek, monthOfYear: contributionMonth };
  return <View style={{ gap: 14 }}>
    <View><Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 20, fontWeight: "800" }}>{goal ? "Edit savings goal" : "Add savings goal"}</Text><Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12, marginTop: 3 }}>Set a target and track the amount you have already saved.</Text></View>
    <View style={{ backgroundColor: P.card, borderColor: P.line, borderRadius: 14, borderWidth: 1, gap: 14, padding: 14 }}>
      {goalType === "emergency_fund" && baseline !== null ? <View style={{ backgroundColor: "#F8EFDC", borderRadius: 10, padding: 11 }}><Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>Suggested monthly baseline: {formatPeso(baseline)}</Text><Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 11, lineHeight: 16, marginTop: 3 }}>Based on posted expenses from the six completed calendar months before today. Saving keeps this baseline without recalculating it later.</Text></View> : null}
      <Field label="Goal name" value={name} onChangeText={(value) => { setName(value); if (duplicateName) { setDuplicateName(false); setMessage(null); } }} placeholder={SAVINGS_GOAL_PLACEHOLDERS.name} invalid={duplicateName || (invalid && !name.trim())} />
      <SavingsGoalAccountSelector userId={userId} value={linkedAccountId} onChange={(id) => { setLinkedAccountId(id); setAccountInvalid(false); setMessage(null); }} invalid={accountInvalid} />
      <Field label="Target amount" value={target} onChangeText={setTarget} placeholder={SAVINGS_GOAL_PLACEHOLDERS.targetAmount} numeric currency invalid={invalid && (!Number.isSafeInteger(toCentavos(target)) || toCentavos(target) <= 0)} />
      <Field label="Starting amount" value={starting} onChangeText={setStarting} placeholder={SAVINGS_GOAL_PLACEHOLDERS.startingAmount} numeric currency invalid={invalid && (!Number.isSafeInteger(toCentavos(starting)) || toCentavos(starting) < 0)} />
      <Pressable accessibilityRole="checkbox" accessibilityLabel="This is my emergency fund" accessibilityState={{ checked: isEmergencyFund }} onPress={() => { setIsEmergencyFund((value) => !value); setMessage(null); }} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: isEmergencyFund ? P.brand : P.line, backgroundColor: isEmergencyFund ? P.brand : P.white, alignItems: "center", justifyContent: "center" }}>{isEmergencyFund ? <Text style={{ color: P.white, fontWeight: "800" }}>✓</Text> : null}</View><Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>This is my emergency fund</Text></Pressable>
      {isEmergencyFund ? <EmergencyFundTargetSuggestion userId={userId} onApply={(amount) => setTarget((amount / 100).toFixed(2))} /> : null}
       <SavingsDate label="Target date" value={targetDate} onChange={setTargetDate} error={invalid && !targetDate ? "Select a target date." : undefined} />
        <View style={{ gap: 7 }}><Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>Contribution frequency</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{CONTRIBUTION_OPTIONS.map((option) => <Pressable key={option.label} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ selected: contributionFrequency === option.value }} onPress={() => { setContributionFrequency(option.value); setMessage(null); }} style={{ backgroundColor: contributionFrequency === option.value ? P.brand : P.white, borderColor: P.line, borderRadius: 10, borderWidth: 1, padding: 10 }}><Text style={{ color: contributionFrequency === option.value ? P.white : P.ink, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>{option.label}</Text></Pressable>)}</View></View>
        {contributionFrequency !== null && !CONTRIBUTION_OPTIONS.some((option) => option.value === contributionFrequency) ? <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12 }}>Existing schedule: {contributionFrequency}. Choose a frequency above to change it.</Text> : null}
        {contributionFrequency === null ? <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12 }}>No scheduled contributions. You can still contribute manually.</Text> : <>
        <RecurringScheduleFields appearance="form" showFrequencySelector={false} weekdayLabels={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]} frequencies={GOAL_CONTRIBUTION_FREQUENCIES as readonly RecurringScheduleFrequency[]} value={scheduleValue} onChange={(next) => { setContributionFrequency(next.frequency as GoalContributionFrequency); setContributionDay(next.dayOfMonth); setContributionSecondDay(next.secondDayOfMonth); setContributionDayOfWeek(next.dayOfWeek); setContributionMonth(next.monthOfYear); setMessage(null); }} frequencyLabel="CONTRIBUTION FREQUENCY" dayOfMonthError={invalid && (contributionFrequency === "semi_monthly" || contributionFrequency === "monthly" || contributionFrequency === "yearly") && (!Number.isInteger(Number(contributionDay)) || Number(contributionDay) < 1 || Number(contributionDay) > 31)} secondDayOfMonthError={invalid && contributionFrequency === "semi_monthly" && !contributionSecondDay} />
        {contributionFrequency === "monthly" || contributionFrequency === "semi_monthly" || contributionFrequency === "yearly" ? <MonthEndNote days={[contributionDay, contributionFrequency === "semi_monthly" ? contributionSecondDay : null]} /> : null}
        {contributionFrequency === "custom" ? <Field label="Custom interval days" value={customIntervalDays} onChangeText={setCustomIntervalDays} placeholder="e.g. 45" numeric invalid={invalid && (!Number.isSafeInteger(Number(customIntervalDays)) || Number(customIntervalDays) <= 0)} /> : null}
        <Field label="Planned contribution amount" value={plannedContribution} onChangeText={setPlannedContribution} placeholder="0.00" numeric invalid={invalid && (!Number.isSafeInteger(toCentavos(plannedContribution)) || toCentavos(plannedContribution) < 0)} />
        {suggestedContribution !== null ? <View style={{ gap: 7 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12 }}>Suggested: {formatPeso(suggestedContribution)} per contribution to reach your target by {targetDate}. Based on your remaining balance; excludes interest.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Use suggested amount" onPress={() => setPlannedContribution(fromCentavos(suggestedContribution))} style={{ alignSelf: "flex-start", paddingVertical: 8 }}>
            <Text style={{ color: P.brand, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>Use suggested amount</Text>
          </Pressable>
        </View> : <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12 }}>Enter a remaining target, a valid target date, and contribution days to see a suggested amount.</Text>}
        </>}
       {goal ? <Field label="Interest rate (%)" value={interestRate} onChangeText={setInterestRate} placeholder="Optional" numeric invalid={invalid && interestRate.trim() !== "" && (!Number.isFinite(Number(interestRate)) || Number(interestRate) < 0)} /> : null}
       <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" />
      <View style={{ gap: 7 }}><Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>Priority</Text><View style={{ flexDirection: "row", gap: 7 }}>{SAVINGS_GOAL_PRIORITIES.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`Select ${SAVINGS_GOAL_PRIORITY_LABELS[value]} priority`} accessibilityState={{ selected: value === priority }} onPress={() => setPriority(value)} style={{ backgroundColor: value === priority ? P.brand : P.white, borderColor: value === priority ? P.brand : P.line, borderRadius: 9, borderWidth: 1, flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center" }}><Text style={{ color: value === priority ? P.white : P.ink, fontFamily: "Manrope", fontSize: 11, fontWeight: "700" }}>{SAVINGS_GOAL_PRIORITY_LABELS[value]}</Text></Pressable>)}</View></View>
       {message ? <Text accessibilityLiveRegion="polite" style={{ color: P.error, fontFamily: "Manrope", fontSize: 12 }}>{message}</Text> : null}
      <View style={{ flexDirection: "row", gap: 10 }}><Pressable accessibilityRole="button" accessibilityLabel={goal ? "Save savings goal changes" : "Save savings goal"} disabled={saving} onPress={() => { save().catch(() => {}); }} style={{ backgroundColor: P.brand, borderRadius: 10, flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", opacity: saving ? 0.6 : 1 }}>{saving ? <ActivityIndicator color={P.white} /> : <Text style={{ color: P.white, fontFamily: "Manrope", fontWeight: "700" }}>{goal ? "Save changes" : "Save goal"}</Text>}</Pressable><Pressable accessibilityRole="button" accessibilityLabel="Cancel" disabled={saving} onPress={onCancel} style={{ borderColor: P.line, borderRadius: 10, borderWidth: 1, flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center" }}><Text style={{ color: P.ink, fontFamily: "Manrope", fontWeight: "700" }}>Cancel</Text></Pressable></View>
     </View>
   </View>;
}
