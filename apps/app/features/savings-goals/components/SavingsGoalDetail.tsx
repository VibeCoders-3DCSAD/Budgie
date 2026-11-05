import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Archive, ArrowCounterClockwise, ArrowDownLeft, ArrowLeft, ArrowUpRight, PencilSimple, TrashSimple } from "phosphor-react-native";
import KebabMenu, { type KebabAction } from "../../../components/KebabMenu";
import type { SavingsGoal } from "../../../local-db/repositories/savings/savingsGoals";
import { SAVINGS_GOAL_PRIORITY_LABELS, savingsGoalKindLabel } from "../constants";
import { getMinimumContributionPerOccurrence, type ScheduledSavingsGoal } from "../helpers/contributionSchedule";
import { manilaToday } from "../../../lib/dates";
import type { SavingsActivity } from "../types";
import { SavingsForecastSection } from "../forecast/components/SavingsForecastSection";
import { formatPeso } from "../../../lib/format/money";
import { GoalProgressBar } from "./GoalProgressBar";

const P = { card: "#F1F0EB", ink: "#1B1C1A", muted: "#6B7A6F", brand: "#013220", line: "#EAEAE6", error: "#D9001F", white: "#FFFFFF", soft: "#E8F3EC", warn: "#8A4B00" } as const;
const money = formatPeso;
const formatDate = (isoDate: string) => new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const RECENT_ACTIVITY_LIMIT = 5;

type Confirmation = "archive" | "delete" | null;
type Props = {
  goal: SavingsGoal;
  activities: SavingsActivity[];
  plannedContributionCentavos?: number;
  message: string | null;
  busy: boolean;
  onBack: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onRecordActivity?: (goalId: string, kind: "contribution" | "withdrawal", amountCentavos?: number) => void;
  onOpenTransaction?: (transactionId: string) => void;
};

export default function SavingsGoalDetail({ goal, activities, plannedContributionCentavos = 0, message, busy, onBack, onEdit, onArchive, onRestore, onDelete, onRecordActivity, onOpenTransaction }: Props) {
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const active = goal.status === "active";
  const reached = goal.isAchieved || goal.currentAmountCentavos >= goal.targetAmountCentavos;
  const minimum = getMinimumContributionPerOccurrence(goal as ScheduledSavingsGoal, manilaToday());
  const visibleActivity = showAllActivity ? activities : activities.slice(0, RECENT_ACTIVITY_LIMIT);
  const menuActions: KebabAction[] = active
    ? [
      { label: "Edit", icon: <PencilSimple size={17} color="#414942" />, onClick: onEdit },
      { label: "Archive", icon: <Archive size={17} color="#414942" />, onClick: () => setConfirmation("archive") },
      { label: "Delete", icon: <TrashSimple size={17} color={P.error} />, onClick: () => setConfirmation("delete") },
    ]
    : [
      { label: "Restore", icon: <ArrowCounterClockwise size={17} color="#414942" />, onClick: onRestore },
      { label: "Delete", icon: <TrashSimple size={17} color={P.error} />, onClick: () => setConfirmation("delete") },
    ];

  return <View style={{ gap: 16 }}>
    <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to goals" onPress={onBack} hitSlop={8} style={{ alignItems: "center", height: 36, justifyContent: "center", width: 36 }}><ArrowLeft size={20} color={P.ink} /></Pressable>
      <Text numberOfLines={1} style={{ color: P.ink, flex: 1, fontFamily: "Manrope", fontSize: 20, fontWeight: "800" }}>{goal.name}</Text>
      <KebabMenu actions={menuActions} disabled={busy} />
    </View>
    {message ? <Text accessibilityRole="alert" style={{ color: P.error, fontFamily: "Manrope", fontSize: 12 }}>{message}</Text> : null}

    <View style={{ backgroundColor: P.card, borderColor: P.line, borderRadius: 16, borderWidth: 1, gap: 10, padding: 16 }}>
      <StatusPill goal={goal} reached={reached} />
      <View>
        <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 28, fontWeight: "800" }}>{money(goal.currentAmountCentavos)}</Text>
        <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12 }}>of {money(goal.targetAmountCentavos)} target{goal.targetDate ? ` by ${formatDate(goal.targetDate)}` : ""}</Text>
      </View>
      <GoalProgressBar percent={goal.progressPercent} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>{goal.progressPercent}% saved</Text>
        <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12 }}>{reached ? "Target reached" : `${money(goal.remainingAmountCentavos)} to go`}</Text>
      </View>
    </View>

    {active ? <View style={{ flexDirection: "row", gap: 10 }}>
      {!reached ? <View style={{ flex: 1 }}><Button label="Add money" onPress={() => onRecordActivity?.(goal.id, "contribution", plannedContributionCentavos > 0 ? plannedContributionCentavos : undefined)} /></View> : null}
      <View style={{ flex: 1 }}><Button label="Withdraw" secondary onPress={() => onRecordActivity?.(goal.id, "withdrawal")} /></View>
    </View> : null}

    {active && plannedContributionCentavos > 0 ? <View style={{ backgroundColor: P.soft, borderRadius: 12, padding: 12 }}>
      <Text style={{ color: P.brand, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>Remaining to contribute this cycle: {money(plannedContributionCentavos)}.</Text>
    </View> : null}

    <Section title="Details">
      <DetailRow label="Type" value={`${savingsGoalKindLabel(goal.isEmergencyFund)} · ${SAVINGS_GOAL_PRIORITY_LABELS[goal.priority]} priority`} />
      <DetailRow label="Account" value={goal.linkedAccountName ?? (goal.linkedAccountId ? "Unavailable" : "Not linked")} />
      <DetailRow label="Next contribution" value={goal.nextContributionDate ? `${formatDate(goal.nextContributionDate)} · ${money(goal.plannedContributionAmountCentavos)}` : "Whenever you choose"} />
      {minimum !== null ? <DetailRow label="Minimum each time" value={money(minimum)} /> : null}
      {goal.notes ? <DetailRow label="Notes" value={goal.notes} /> : null}
    </Section>

    <SavingsForecastSection currentBalanceCentavos={goal.currentAmountCentavos} startingBalanceCentavos={goal.startingAmountCentavos} targetAmountCentavos={goal.targetAmountCentavos} targetDate={goal.targetDate} schedule={goal} interestRateBps={goal.interestRateBps} activities={activities} />

    <Section title="Activity" trailing={activities.length > 0 ? `${activities.length} ${activities.length === 1 ? "entry" : "entries"}` : undefined}>
      {activities.length === 0
        ? <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12, paddingVertical: 4 }}>No money added or withdrawn yet.</Text>
        : visibleActivity.map((activity) => <ActivityRow key={activity.id} activity={activity} onOpenTransaction={onOpenTransaction} />)}
      {activities.length > RECENT_ACTIVITY_LIMIT ? <Pressable accessibilityRole="button" accessibilityLabel={showAllActivity ? "Show recent activity" : "Show all activity"} onPress={() => setShowAllActivity((current) => !current)} style={{ paddingTop: 10 }}>
        <Text style={{ color: P.brand, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>{showAllActivity ? "Show less" : `Show all ${activities.length}`}</Text>
      </Pressable> : null}
    </Section>

    <ConfirmDialog
      confirmation={confirmation}
      busy={busy}
      onCancel={() => setConfirmation(null)}
      onConfirm={() => { if (confirmation === "archive") onArchive(); else onDelete(); setConfirmation(null); }}
    />
  </View>;
}

function StatusPill({ goal, reached }: { goal: SavingsGoal; reached: boolean }) {
  const label = goal.status === "archived" ? "Archived" : reached ? "Reached" : goal.contributionShortfallCentavos > 0 ? "Behind" : null;
  if (!label) return null;
  const behind = label === "Behind";
  return <View style={{ alignSelf: "flex-start", backgroundColor: behind ? "#F8EFDC" : goal.status === "archived" ? P.line : P.soft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
    <Text style={{ color: behind ? P.warn : goal.status === "archived" ? P.muted : P.brand, fontFamily: "Manrope", fontSize: 11, fontWeight: "700" }}>{label}</Text>
  </View>;
}

function Section({ title, trailing, children }: { title: string; trailing?: string; children: React.ReactNode }) {
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 14, fontWeight: "800" }}>{title}</Text>
      {trailing ? <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12 }}>{trailing}</Text> : null}
    </View>
    <View style={{ backgroundColor: P.white, borderColor: P.line, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6 }}>{children}</View>
  </View>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <View style={{ flexDirection: "row", gap: 12, justifyContent: "space-between", paddingVertical: 8 }}>
    <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12 }}>{label}</Text>
    <Text style={{ color: P.ink, flexShrink: 1, fontFamily: "Manrope", fontSize: 12, fontWeight: "700", textAlign: "right" }}>{value}</Text>
  </View>;
}

function ActivityRow({ activity, onOpenTransaction }: { activity: SavingsActivity; onOpenTransaction?: (transactionId: string) => void }) {
  const contribution = activity.kind === "contribution";
  const label = contribution ? "Contribution" : "Withdrawal";
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${activity.kind} transaction`} disabled={!onOpenTransaction} onPress={() => onOpenTransaction?.(activity.transactionId)} style={{ alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 9 }}>
    <View style={{ alignItems: "center", backgroundColor: contribution ? P.soft : P.card, borderRadius: 10, height: 32, justifyContent: "center", width: 32 }}>
      {contribution ? <ArrowDownLeft size={16} color={P.brand} /> : <ArrowUpRight size={16} color={P.muted} />}
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 13, fontWeight: "700" }}>{label}</Text>
      <Text numberOfLines={1} style={{ color: P.muted, fontFamily: "Manrope", fontSize: 11 }}>{formatDate(activity.activityDate)}{activity.notes ? ` · ${activity.notes}` : ""}</Text>
    </View>
    <Text style={{ color: contribution ? P.brand : P.ink, fontFamily: "Manrope", fontSize: 13, fontWeight: "800" }}>{contribution ? "+" : "−"}{money(activity.amountCentavos)}</Text>
  </Pressable>;
}

function ConfirmDialog({ confirmation, busy, onCancel, onConfirm }: { confirmation: Confirmation; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const archive = confirmation === "archive";
  return <Modal visible={confirmation !== null} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={{ alignItems: "center", backgroundColor: "rgba(27,28,26,0.45)", flex: 1, justifyContent: "center", padding: 24 }}>
      <View style={{ backgroundColor: P.white, borderRadius: 18, gap: 10, maxWidth: 360, padding: 20, width: "100%" }}>
        <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 17, fontWeight: "800" }}>{archive ? "Archive this goal?" : "Delete this goal?"}</Text>
        <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 13 }}>{archive ? "It moves to Archived goals with its history and can be restored later." : "The goal and its history are removed. This cannot be undone."}</Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <View style={{ flex: 1 }}><Button label="Cancel" secondary onPress={onCancel} /></View>
          <View style={{ flex: 1 }}><Button label={archive ? "Archive" : "Delete"} accessibilityLabel={archive ? "Confirm archive" : "Confirm delete"} danger={!archive} disabled={busy} onPress={onConfirm} /></View>
        </View>
      </View>
    </View>
  </Modal>;
}

function Button({ label, accessibilityLabel, onPress, secondary, danger, disabled }: { label: string; accessibilityLabel?: string; onPress: () => void; secondary?: boolean; danger?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} disabled={disabled} onPress={onPress} style={{ alignItems: "center", backgroundColor: secondary ? P.white : danger ? P.error : P.brand, borderColor: P.line, borderRadius: 12, borderWidth: secondary ? 1 : 0, justifyContent: "center", minHeight: 48, opacity: disabled ? 0.6 : 1, paddingHorizontal: 14 }}>
    <Text style={{ color: secondary ? P.ink : P.white, fontFamily: "Manrope", fontSize: 14, fontWeight: "700" }}>{label}</Text>
  </Pressable>;
}
