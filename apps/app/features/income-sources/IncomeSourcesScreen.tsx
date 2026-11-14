import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { CaretRight, TrendUp } from "phosphor-react-native";
import { PesoIcon } from "../../components/PesoIcon";
import { listIncomeSources, deleteIncomeSource, type IncomeSource } from "../../local-db/repositories/foundations/financialFoundations";
import { listDebtAccounts, type DebtAccount } from "../../local-db/repositories/debts/debtAccounts";
import { getIncomeSummary } from "../../local-db/repositories/foundations/incomeSummary";
import { Banner, styles as ui, v4, v4Font } from "../../components/BudgieForm";
import { AmountHero } from "../../components/BudgieForm";
import IncomeSourceActions from "./IncomeSourceActions";
import { incomeScheduleLabel } from "./presentation";
import { formatPeso } from "../../lib/format/money";
import { TourTarget } from "../onboarding-tour/components/TourTarget";
import { useCloseWithTour } from "../onboarding-tour/hooks/useCloseWithTour";

type Props = { userId: string; deviceId: string; onBack: () => void; onAdd: () => void; onEdit: (id: string) => void; onSyncRequested?: () => void };

export default function IncomeSourcesScreen({ userId, deviceId, onAdd, onEdit, onSyncRequested }: Props) {
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [debts, setDebts] = useState<DebtAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IncomeSource | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [incomeSources, debtAccounts] = await Promise.all([listIncomeSources(userId), listDebtAccounts(userId)]);
      setSources(incomeSources);
      setDebts(debtAccounts);
    } catch {
      setError("Your income sources could not be loaded. Try again.");
    } finally {
      setLoading(false);
    }
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const summary = getIncomeSummary(sources, debts);
  const sourceCount = `${sources.length} income ${sources.length === 1 ? "source" : "sources"}`;

  function closeActions() { setSelected(null); setConfirming(false); }
  useCloseWithTour("money-income-menu", selected !== null && !confirming, closeActions);

  async function confirmDelete() {
    if (!selected || deletingId) return;
    setDeletingId(selected.id);
    try {
      await deleteIncomeSource(userId, deviceId, selected.id);
      closeActions();
      await load();
      onSyncRequested?.();
    } catch {
      closeActions();
      setError("Your income source could not be deleted. Try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <View style={{ gap: 11 }}>
      <TourTarget id="money-income-total" fill><AmountHero label="ESTIMATED MONTHLY INCOME AFTER DEBT DEDUCTIONS" amountCentavos={loading ? undefined : summary.netMonthlyCentavos} detail={loading ? "Loading income sources…" : sourceCount} /></TourTarget>
      {!loading && sources.length > 0 ? <Text style={s.detail}>{`${formatPeso(summary.grossMonthlyCentavos)} after taxes, before ${formatPeso(summary.salaryLoanDeductionsCentavos)} in salary-loan deductions`}</Text> : null}
      {loading || sources.length > 0 ? (
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Income sources</Text>
          <TourTarget id="money-income-add"><Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add income source" hitSlop={8}><Text style={s.add}>Add</Text></Pressable></TourTarget>
        </View>
      ) : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {error ? <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }} style={[ui.button, ui.buttonGhost]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Retry</Text></Pressable> : null}
      {loading ? (
        <View style={s.loading}><ActivityIndicator color={v4.brand} /><Text style={s.detail}>Loading your income sources…</Text></View>
      ) : sources.length === 0 && !error ? (
        <View style={s.empty}>
          <TrendUp size={36} color={v4.ink2} />
          <Text style={s.emptyTitle}>No income sources yet</Text>
          <Text style={s.detail}>Add your salary to plan a budget.</Text>
          <Pressable onPress={onAdd} accessibilityRole="button" style={[ui.button, { alignSelf: "stretch", marginTop: 6 }]}><Text style={ui.buttonText}>Add an income source</Text></Pressable>
        </View>
      ) : sources.length > 0 ? (
        <TourTarget id="money-income-list" fill>
        <View style={s.list}>
          {sources.map((source, index) => {
            const row = (
            <Pressable key={source.id} onPress={() => { setSelected(source); setConfirming(false); }} accessibilityRole="button" accessibilityLabel={`Actions for ${source.name}`} disabled={deletingId === source.id} style={[s.row, index > 0 ? s.divider : null]}>
              <View style={s.tile}><PesoIcon size={18} color="#FFFFFF" /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={ui.listTitle}>{source.name}</Text>
                <Text numberOfLines={1} style={s.subtitle}>{incomeScheduleLabel(source)}</Text>
              </View>
              <Text style={s.amount}>{formatPeso(source.expectedAmountCentavos)}</Text>
              <CaretRight size={15} color={v4.ink2} />
            </Pressable>
            );
            // The tour opens the first source's actions.
            return index === 0 ? <TourTarget key={source.id} id="money-income-first" fill>{row}</TourTarget> : row;
          })}
        </View>
        </TourTarget>
      ) : null}
      <IncomeSourceActions name={selected?.name ?? null} confirming={confirming} busy={deletingId === selected?.id} onClose={closeActions} onEdit={() => { if (selected) { const id = selected.id; closeActions(); onEdit(id); } }} onRequestDelete={() => setConfirming(true)} onConfirmDelete={() => { void confirmDelete(); }} />
    </View>
  );
}

const s = StyleSheet.create({
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sectionTitle: { fontFamily: v4Font, fontSize: 15, fontWeight: "800", color: v4.ink },
  add: { fontFamily: v4Font, fontSize: 11.5, fontWeight: "700", color: v4.brand },
  detail: { fontFamily: v4Font, fontSize: 12, color: v4.ink2 },
  loading: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 20 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 26 },
  emptyTitle: { fontFamily: v4Font, fontSize: 16, fontWeight: "800", color: v4.ink },
  list: { backgroundColor: v4.surface, borderWidth: 1, borderColor: v4.ink2, borderRadius: 16, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: "#DBD7CD" },
  tile: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#004D1B", alignItems: "center", justifyContent: "center" },
  subtitle: { fontFamily: v4Font, fontSize: 11, color: v4.ink2, marginTop: 1 },
  amount: { fontFamily: v4Font, fontSize: 12.5, fontWeight: "700", color: v4.ink, fontVariant: ["tabular-nums"], flexShrink: 1, textAlign: "right" },
});
