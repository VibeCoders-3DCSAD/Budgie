import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { CaretDown, CaretUp } from "phosphor-react-native";
import { getSavingsAllocationStrategy, saveSavingsAllocationStrategy, type SavingsAllocationStrategy } from "../../../local-db/repositories/savings/savingsAllocationPreferences";
import { getCurrentSavingsEnvelopeAllocation } from "../queries/savingsEnvelopeAllocationQueries";
import type { SavingsAllocationProposal, SavingsCycleAllocation, SavingsCycleContribution, SavingsExtraReason } from "../helpers/savingsEnvelopeAllocation";
import { manilaToday } from "../../../lib/dates";
import { formatPeso } from "../../../lib/format/money";

const P = { card: "#F1F0EB", ink: "#1B1C1A", muted: "#6B7A6F", brand: "#013220", line: "#EAEAE6", error: "#D9001F", white: "#FFFFFF", soft: "#E8F3EC" } as const;
const money = formatPeso;
const dueDateLabel = (date: string | null) => date ? `Due ${new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : "No due date";
const STRATEGY_COPY: Record<SavingsAllocationStrategy, { label: string; description: string }> = {
  avalanche: { label: "Biggest need first", description: "Avalanche: goals that still need the most get extra savings first." },
  snowball: { label: "Closest to target first", description: "Snowball: goals nearest their target get extra savings first." },
};
const EXTRA_REASON: Record<SavingsExtraReason, string> = {
  emergency_fund: "Extra goes here first: the Emergency Fund always comes first",
  avalanche: "Extra goes here first: this goal still needs the most (Avalanche)",
  snowball: "Extra goes here first: this goal is closest to its target (Snowball)",
};

type Props = {
  userId: string;
  deviceId: string;
  syncVersion?: number;
  onAllocationChange?: (proposals: SavingsAllocationProposal[]) => void;
};

export default function SavingsAllocationReview({ userId, deviceId, syncVersion = 0, onAllocationChange }: Props) {
  const [allocation, setAllocation] = useState<SavingsCycleAllocation | null>(null);
  const [strategy, setStrategy] = useState<SavingsAllocationStrategy>("avalanche");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [choosingStrategy, setChoosingStrategy] = useState(false);
  const today = manilaToday();

  async function load() {
    setLoading(true);
    try {
      const [nextAllocation, nextStrategy] = await Promise.all([getCurrentSavingsEnvelopeAllocation(userId, today), getSavingsAllocationStrategy(userId)]);
      setAllocation(nextAllocation);
      setStrategy(nextStrategy);
      onAllocationChange?.(nextAllocation?.proposals ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {
      setAllocation(null);
      onAllocationChange?.([]);
    });
  }, [userId, syncVersion, today]);

  async function selectStrategy(next: SavingsAllocationStrategy) {
    setSaving(true);
    try {
      await saveSavingsAllocationStrategy(userId, deviceId, next);
      setStrategy(next);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={{ minHeight: 96, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={P.brand} /></View>;
  if (!allocation) return <View style={{ backgroundColor: P.card, borderColor: P.line, borderWidth: 1, borderRadius: 14, gap: 4, padding: 14 }}><Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 14, fontWeight: "800" }}>Financial Plan for savings</Text><Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12 }}>Create a Financial Plan to set aside money for your goals each cycle.</Text></View>;

  return <View style={{ backgroundColor: P.white, borderColor: P.line, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 }}>
    <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 14, fontWeight: "800" }}>This cycle</Text>
    <Row label="Savings Budget this month" value={money(allocation.envelopeCentavos)} />
    {allocation.contributions.map((contribution) => <SavingsContributionRow key={contribution.id} contribution={contribution} />)}
    {allocation.unallocatedCentavos > 0 ? <UnassignedSurplusRow amountCentavos={allocation.unallocatedCentavos} /> : null}
    <Row label="Remaining to contribute" value={money(allocation.remainingToContributeCentavos)} />
    <Pressable accessibilityRole="button" accessibilityLabel="Change surplus strategy" accessibilityState={{ expanded: choosingStrategy }} onPress={() => setChoosingStrategy((current) => !current)} style={{ alignItems: "center", borderTopColor: P.line, borderTopWidth: 1, flexDirection: "row", gap: 8, marginTop: 6, paddingTop: 10 }}>
      <Text style={{ color: P.muted, flex: 1, fontFamily: "Manrope", fontSize: 12 }}>Extra savings go to</Text>
      <Text style={{ color: P.brand, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>{STRATEGY_COPY[strategy].label}</Text>
      {choosingStrategy ? <CaretUp size={14} color={P.brand} /> : <CaretDown size={14} color={P.brand} />}
    </Pressable>
    {choosingStrategy ? <View style={{ gap: 6, paddingTop: 8 }}>
      <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 11 }}>Switching moves this month's extra savings to other goals right away. Extra you already saved stays with its goal, so you may end up saving more than this month's plan.</Text>
      {(["avalanche", "snowball"] as const).map((option) => <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Use ${option} savings allocation`} accessibilityState={{ selected: strategy === option }} disabled={saving} onPress={() => { selectStrategy(option).then(() => setChoosingStrategy(false)).catch(() => {}); }} style={{ backgroundColor: strategy === option ? P.soft : P.card, borderColor: strategy === option ? P.brand : P.line, borderRadius: 10, borderWidth: 1, gap: 2, opacity: saving ? 0.6 : 1, padding: 10 }}>
        <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>{STRATEGY_COPY[option].label}</Text>
        <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 11 }}>{STRATEGY_COPY[option].description}</Text>
      </Pressable>)}
    </View> : null}
  </View>;
}

function SavingsContributionRow({ contribution }: { contribution: SavingsCycleContribution }) {
  const done = contribution.recordedCentavos >= contribution.plannedCentavos;
  const status = done ? "Done" : contribution.recordedCentavos > 0 ? "Partial" : "Not done";
  const dueDate = dueDateLabel(contribution.dueDate);
  const split = contribution.extraCentavos > 0 ? `${money(contribution.scheduledCentavos)} scheduled + ${money(contribution.extraCentavos)} extra` : null;
  const reason = contribution.extraCentavos > 0 ? EXTRA_REASON[contribution.extraReason] : null;
  // Saved beyond this month's plan, e.g. extra deposited before switching strategy.
  const extraSavedCentavos = Math.max(0, contribution.recordedCentavos - contribution.plannedCentavos);
  const extraSaved = extraSavedCentavos > 0 ? `${money(extraSavedCentavos)} extra saved beyond this month's plan` : null;
  const details = [split ? `${dueDate} · ${split}` : dueDate, reason, extraSaved].filter((line): line is string => line !== null);
  return <View accessibilityLabel={[`${contribution.name}, ${money(contribution.plannedCentavos)}, ${status}`, ...details].join(", ")} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 5 }}>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12 }}>{contribution.name}</Text>
      {details.map((line) => <Text key={line} style={{ color: line === extraSaved ? P.brand : P.muted, fontFamily: "Manrope", fontSize: 11 }}>{line}</Text>)}
    </View>
    <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>{money(contribution.plannedCentavos)}</Text>
    <Text style={{ color: done ? P.brand : P.muted, fontFamily: "Manrope", fontSize: 11, fontWeight: "700" }}>{status}</Text>
  </View>;
}

function UnassignedSurplusRow({ amountCentavos }: { amountCentavos: number }) {
  return <View accessibilityLabel={`Not assigned to a goal, ${money(amountCentavos)}. We suggest adding it to your other goals.`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 5 }}>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12 }}>Not assigned to a goal</Text>
      <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 11 }}>We suggest adding it to your other goals.</Text>
    </View>
    <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>{money(amountCentavos)}</Text>
  </View>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={{ flexDirection: "row", gap: 12, justifyContent: "space-between", paddingVertical: 5 }}><Text style={{ color: P.muted, flexShrink: 1, fontFamily: "Manrope", fontSize: 12 }}>{label}</Text><Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>{value}</Text></View>;
}
