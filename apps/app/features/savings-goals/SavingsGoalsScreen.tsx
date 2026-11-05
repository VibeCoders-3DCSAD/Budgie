import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { CaretRight, CheckCircle, ShieldCheck, Target } from "phosphor-react-native";
import { archiveSavingsGoal, deleteSavingsGoal, getSavingsGoal, listSavingsGoals, restoreSavingsGoal, type SavingsGoal } from "../../local-db/repositories/savings/savingsGoals";
import SavingsGoalForm from "./components/SavingsGoalForm";
import SavingsGoalDetail from "./components/SavingsGoalDetail";
import { GoalProgressBar } from "./components/GoalProgressBar";
import { listSavingsGoalActivities } from "../../local-db/repositories/savings/savingsGoalActivities";
import type { SavingsActivity } from "./types";
import SavingsAllocationReview from "./components/SavingsAllocationReview";
import type { SavingsAllocationProposal } from "./helpers/savingsEnvelopeAllocation";
import { formatPeso } from "../../lib/format/money";

const P = { card: "#F1F0EB", ink: "#1B1C1A", muted: "#6B7A6F", brand: "#013220", line: "#EAEAE6", error: "#D9001F", white: "#FFFFFF", soft: "#E8F3EC", warn: "#8A4B00" } as const;
type Props = { userId: string; deviceId: string; syncVersion?: number; initialGoalId?: string; onRecordActivity?: (goalId: string, kind: "contribution" | "withdrawal", amountCentavos?: number) => void; onOpenTransaction?: (transactionId: string) => void };
type Page = "list" | "create" | "detail" | "edit";
type GoalListView = "active" | "archived";
const money = formatPeso;
const monthYear = (isoDate: string) => new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", year: "numeric", timeZone: "UTC" });

export default function SavingsGoalsScreen({ userId, deviceId, syncVersion = 0, initialGoalId, onRecordActivity, onOpenTransaction }: Props) {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [selected, setSelected] = useState<SavingsGoal | null>(null);
  const [activities, setActivities] = useState<SavingsActivity[]>([]);
  const [proposals, setProposals] = useState<SavingsAllocationProposal[]>([]);
  const [page, setPage] = useState<Page>("list");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<GoalListView>("active");
  async function load() { setLoading(true); try { setGoals(await listSavingsGoals(userId, view)); setMessage(null); } catch { setMessage("Your savings goals could not be loaded. Please try again."); } finally { setLoading(false); } }
  useEffect(() => { load().catch(() => {}); }, [userId, syncVersion, view]);
  async function openGoal(id: string) { const [goal, nextActivities] = await Promise.all([getSavingsGoal(userId, id), listSavingsGoalActivities(userId, id)]); if (goal) { setSelected(goal); setActivities(nextActivities); setMessage(null); setPage("detail"); } }
  useEffect(() => {
    if (initialGoalId) void openGoal(initialGoalId).catch(() => setMessage("Your savings goal could not be loaded. Please try again."));
  }, [initialGoalId, userId]);
  function backToList() { setSelected(null); setMessage(null); setPage("list"); }
  async function runGoalAction(action: () => Promise<unknown>, failure: string, nextView?: GoalListView) {
    setBusy(true);
    try { await action(); if (nextView && nextView !== view) setView(nextView); else await load(); backToList(); } catch { setMessage(failure); } finally { setBusy(false); }
  }
  if (page === "create" || page === "edit") return <SavingsGoalForm userId={userId} deviceId={deviceId} goal={page === "edit" ? selected ?? undefined : undefined} onCancel={() => setPage(page === "edit" && selected ? "detail" : "list")} onSaved={(goal) => { setSelected(goal); load().catch(() => {}); setPage("detail"); }} />;
  if (page === "detail" && selected) {
    const proposal = proposals.find((item) => item.id === selected.id);
    return <SavingsGoalDetail
      goal={selected}
      activities={activities}
      plannedContributionCentavos={proposal?.proposedTotalCentavos}
      message={message}
      busy={busy}
      onBack={backToList}
      onEdit={() => setPage("edit")}
      onArchive={() => { runGoalAction(() => archiveSavingsGoal(userId, deviceId, selected.id), "Your savings goal could not be archived. Please try again.").catch(() => {}); }}
      onRestore={() => { runGoalAction(() => restoreSavingsGoal(userId, deviceId, selected.id), "Your savings goal could not be restored. Please try again.", "active").catch(() => {}); }}
      onDelete={() => { runGoalAction(() => deleteSavingsGoal(userId, deviceId, selected.id), "Your savings goal could not be deleted. Please try again.").catch(() => {}); }}
      onRecordActivity={onRecordActivity}
      onOpenTransaction={onOpenTransaction}
    />;
  }
  if (loading) return <View style={{ minHeight: 180, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={P.brand} /></View>;
  return <SavingsGoalsOverview userId={userId} deviceId={deviceId} syncVersion={syncVersion} goals={goals} proposals={proposals} onProposalsChange={setProposals} view={view} onViewChange={setView} message={message} onCreate={() => setPage("create")} onOpenGoal={(id) => { openGoal(id).catch(() => {}); }} />;
}

function SavingsGoalsOverview({ userId, deviceId, syncVersion, goals, proposals, onProposalsChange, view, onViewChange, message, onCreate, onOpenGoal }: { userId: string; deviceId: string; syncVersion: number; goals: SavingsGoal[]; proposals: SavingsAllocationProposal[]; onProposalsChange: (proposals: SavingsAllocationProposal[]) => void; view: GoalListView; onViewChange: (view: GoalListView) => void; message: string | null; onCreate: () => void; onOpenGoal: (id: string) => void }) {
  const proposalsByGoalId = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  const errorBanner = message ? <Text accessibilityRole="alert" style={{ color: P.error, fontFamily: "Manrope", fontSize: 12 }}>{message}</Text> : null;

  if (view === "archived") return <View style={{ gap: 14 }}>
    <SectionHeader title="Archived goals" actionLabel="Back to active goals" accessibilityLabel="Active goals" onAction={() => onViewChange("active")} />
    {errorBanner}
    {goals.length === 0 ? <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12 }}>No archived savings goals yet.</Text> : <GoalList goals={goals} onOpenGoal={onOpenGoal} />}
  </View>;

  if (goals.length === 0) return <View style={{ gap: 14 }}>
    {errorBanner}
    <View style={{ alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 28 }}>
      <View style={{ alignItems: "center", borderColor: P.muted, borderRadius: 40, borderStyle: "dashed", borderWidth: 1, height: 80, justifyContent: "center", width: 80 }}><Target size={30} color={P.ink} /></View>
      <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 16, fontWeight: "800" }}>No savings goals yet</Text>
      <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12, textAlign: "center" }}>Create a goal to start tracking progress. Your Financial Plan's savings then has somewhere to go.</Text>
    </View>
    <PrimaryButton label="Add goal" accessibilityLabel="Add savings goal" onPress={onCreate} />
    <ArchivedLink onPress={() => onViewChange("archived")} />
  </View>;

  const savedCentavos = goals.reduce((total, goal) => total + goal.currentAmountCentavos, 0);
  const targetCentavos = goals.reduce((total, goal) => total + goal.targetAmountCentavos, 0);
  return <View style={{ gap: 16 }}>
    {errorBanner}
    <View style={{ backgroundColor: P.brand, borderRadius: 16, padding: 16 }}>
      <Text style={{ color: "#D7EEE2", fontFamily: "Manrope", fontSize: 11, fontWeight: "700", letterSpacing: 0.6 }}>SAVED ACROSS {goals.length} {goals.length === 1 ? "GOAL" : "GOALS"}</Text>
      <Text style={{ color: P.white, fontFamily: "Manrope", fontSize: 28, fontWeight: "800", marginTop: 4 }}>{money(savedCentavos)}</Text>
      <Text style={{ color: "#D7EEE2", fontFamily: "Manrope", fontSize: 12, marginTop: 2 }}>{money(targetCentavos)} target</Text>
    </View>
    <SavingsAllocationReview userId={userId} deviceId={deviceId} syncVersion={syncVersion} onAllocationChange={onProposalsChange} />
    <View style={{ gap: 8 }}>
      <SectionHeader title="Your goals" actionLabel="Add goal" accessibilityLabel="Add savings goal" onAction={onCreate} />
      <GoalList goals={goals} proposalsByGoalId={proposalsByGoalId} onOpenGoal={onOpenGoal} />
    </View>
    <ArchivedLink onPress={() => onViewChange("archived")} />
  </View>;
}

function GoalList({ goals, proposalsByGoalId, onOpenGoal }: { goals: SavingsGoal[]; proposalsByGoalId?: Map<string, SavingsAllocationProposal>; onOpenGoal: (id: string) => void }) {
  return <View style={{ backgroundColor: P.white, borderColor: P.line, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12 }}>
    {goals.map((goal, index) => <GoalRow key={goal.id} goal={goal} plannedCentavos={proposalsByGoalId?.get(goal.id)?.plannedTotalCentavos ?? proposalsByGoalId?.get(goal.id)?.proposedTotalCentavos ?? 0} divider={index > 0} onPress={() => onOpenGoal(goal.id)} />)}
  </View>;
}

function GoalRow({ goal, plannedCentavos, divider, onPress }: { goal: SavingsGoal; plannedCentavos: number; divider: boolean; onPress: () => void }) {
  const status = goalStatus(goal);
  const Icon = goal.isAchieved ? CheckCircle : goal.isEmergencyFund ? ShieldCheck : Target;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${goal.name}`} onPress={onPress} style={{ borderTopColor: P.line, borderTopWidth: divider ? 1 : 0, flexDirection: "row", gap: 12, paddingVertical: 13 }}>
    <View style={{ alignItems: "center", backgroundColor: P.soft, borderRadius: 10, height: 34, justifyContent: "center", width: 34 }}><Icon size={18} color={P.brand} /></View>
    <View style={{ flex: 1, gap: 6 }}>
      <View style={{ flexDirection: "row", gap: 8, justifyContent: "space-between" }}>
        <Text numberOfLines={1} style={{ color: P.ink, flex: 1, fontFamily: "Manrope", fontSize: 14, fontWeight: "700" }}>{goal.name}</Text>
        <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 13, fontWeight: "800" }}>{goal.progressPercent}%</Text>
      </View>
      <GoalProgressBar percent={goal.progressPercent} />
      <View style={{ flexDirection: "row", gap: 8, justifyContent: "space-between" }}>
        <Text numberOfLines={1} style={{ color: P.muted, flex: 1, fontFamily: "Manrope", fontSize: 11 }}>{money(goal.currentAmountCentavos)} of {money(goal.targetAmountCentavos)}</Text>
        {status ? <Text style={{ color: status.tone, fontFamily: "Manrope", fontSize: 11, fontWeight: "700" }}>{status.label}</Text> : null}
      </View>
      {plannedCentavos > 0 ? <Text style={{ color: P.brand, fontFamily: "Manrope", fontSize: 11, fontWeight: "700" }}>Plan: {money(plannedCentavos)} this cycle</Text> : null}
    </View>
    <View style={{ justifyContent: "center" }}><CaretRight size={16} color={P.muted} /></View>
  </Pressable>;
}

function goalStatus(goal: SavingsGoal): { label: string; tone: string } | null {
  if (goal.status === "archived") return { label: "Archived", tone: P.muted };
  if (goal.isAchieved) return { label: "Reached", tone: P.brand };
  if (goal.contributionShortfallCentavos > 0) return { label: "Behind", tone: P.warn };
  if (goal.targetDate) return { label: `By ${monthYear(goal.targetDate)}`, tone: P.muted };
  return null;
}

function SectionHeader({ title, actionLabel, accessibilityLabel, onAction }: { title: string; actionLabel: string; accessibilityLabel: string; onAction: () => void }) {
  return <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
    <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 15, fontWeight: "800" }}>{title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onAction} hitSlop={8}><Text style={{ color: P.brand, fontFamily: "Manrope", fontSize: 13, fontWeight: "700" }}>{actionLabel}</Text></Pressable>
  </View>;
}

function ArchivedLink({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Archived goals" onPress={onPress} style={{ alignItems: "center", paddingVertical: 6 }}><Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>View archived goals</Text></Pressable>;
}

function PrimaryButton({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={{ alignItems: "center", backgroundColor: P.brand, borderRadius: 12, justifyContent: "center", minHeight: 48 }}><Text style={{ color: P.white, fontFamily: "Manrope", fontSize: 14, fontWeight: "700" }}>{label}</Text></Pressable>;
}
