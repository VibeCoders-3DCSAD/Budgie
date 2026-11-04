import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Chip, FormCard, Note, Segment, styles as ui, v4 } from "../../components/BudgieForm";
import { listDebtAccounts, type DebtAccount, type DebtListVisibility } from "../../local-db/repositories/debts/debtAccounts";
import { getDebtStrategy, listDebtPriorities, saveDebtPriorities, saveDebtStrategy, type DebtPriority, type DebtStrategy } from "../../local-db/repositories/debts/debtRepaymentPlans";
import NonCreditDebtForm from "./non-credit/components/NonCreditDebtForm";
import { getDebtTypeLabel } from "./debtTypes";
import { DebtTypeIcon, LinkButton, List, ListRow, Pill, SectionHeader, debtTypeTint, formatPeso } from "./components/debtUi";

type Props = { userId: string; deviceId: string; onBack: () => void; onOpenDebt: (debtId: string) => void };

const FILTERS: { value: DebtListVisibility; label: string }[] = [{ value: "active", label: "Active" }, { value: "finished", label: "Finished" }, { value: "archived", label: "Archived" }, { value: "deleted", label: "Deleted" }];

export default function NonCreditDebtListScreen({ userId, deviceId, onOpenDebt }: Props) {
  const [debts, setDebts] = useState<DebtAccount[] | null>(null);
  const [visibility, setVisibility] = useState<DebtListVisibility>("active");
  const [strategy, setStrategy] = useState<DebtStrategy>("avalanche");
  const [savingStrategy, setSavingStrategy] = useState(false);
  const [priorities, setPriorities] = useState<DebtPriority[]>([]);
  const [savingPriorities, setSavingPriorities] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtAccount | null | undefined>(undefined);

  function load() { return Promise.all([listDebtAccounts(userId, visibility), getDebtStrategy(userId), listDebtPriorities(userId)]).then(([nextDebts, nextStrategy, nextPriorities]) => { setDebts(nextDebts); setStrategy(nextStrategy); setPriorities(nextPriorities); }); }
  async function togglePriority(debtId: string) {
    setSavingPriorities(true);
    try {
      const priorityIds = priorities.map((priority) => priority.debtAccountId);
      const next = priorityIds.includes(debtId) ? priorityIds.filter((id) => id !== debtId) : [...priorityIds, debtId];
      await saveDebtPriorities(userId, deviceId, next);
      setPriorities(next.map((debtAccountId, index) => ({ debtAccountId, priorityRank: index + 1 })));
    } finally {
      setSavingPriorities(false);
    }
  }
  useEffect(() => { load().catch(() => setDebts([])); }, [userId, visibility]);

  if (editingDebt !== undefined) return <NonCreditDebtForm userId={userId} deviceId={deviceId} debt={editingDebt} onCancel={() => setEditingDebt(undefined)} onSaved={() => { setEditingDebt(undefined); load().catch(() => {}); }} />;
  if (debts === null) return <ActivityIndicator color={v4.brand} />;
  const prioritized = visibility === "active" ? debts.filter((debt) => priorities.some((item) => item.debtAccountId === debt.id)) : [];
  const unprioritized = visibility === "active" ? debts.filter((debt) => !priorities.some((item) => item.debtAccountId === debt.id)) : [];

  return <View style={{ gap: 14 }}>
    <SectionHeader title="Loans and other debts" actionLabel="Add debt" accessibilityLabel="Add non-credit-card debt" onAction={() => setEditingDebt(null)} />
    <Note>Select a debt to view payments and repayment details.</Note>
    <FormCard title="Global repayment strategy" term="repayment-strategy">
      <Note>Apply surplus after required payments to active non-credit-card debts.</Note>
      <Segment options={[{ key: "snowball", label: "Snowball" }, { key: "avalanche", label: "Avalanche" }]} value={strategy} disabled={savingStrategy} onChange={(option: DebtStrategy) => { setSavingStrategy(true); saveDebtStrategy(userId, deviceId, option).then(() => setStrategy(option)).finally(() => setSavingStrategy(false)); }} />
      <Note>{strategy === "snowball" ? "Snowball pays the smallest balance first." : "Avalanche pays the highest interest rate first."}</Note>
    </FormCard>
    <View style={ui.chips}>{FILTERS.map(({ value, label }) => <Chip key={value} label={label} accessibilityLabel={`Show ${value} debts`} selected={visibility === value} onPress={() => setVisibility(value)} />)}</View>
    {debts.length === 0 ? <List><ListRow title={`No ${visibility === "finished" ? "finished" : visibility} debts are recorded yet.`} /></List> : <List>{debts.map((debt, index) => {
      const priority = priorities.find((item) => item.debtAccountId === debt.id);
      return <ListRow
        key={debt.id}
        divider={index > 0}
        icon={<DebtTypeIcon type={debt.type} />}
        tint={debtTypeTint(debt.type)}
        title={debt.name}
        subtitle={`${getDebtTypeLabel(debt.type)} · ${debt.lenderName ?? "No lender listed"}`}
        value={formatPeso(debt.currentBalanceCentavos)}
        caption={priority && visibility === "active" ? `Priority ${priority.priorityRank}` : progressCaption(debt)}
        onPress={() => onOpenDebt(debt.id)}
        accessibilityLabel={`Open ${debt.name}`}
      />;
    })}</List>}
    {visibility === "active" && debts.length > 0 ? <FormCard title="Surplus priority">
      <Note>Prioritized debts receive surplus first, in this order, before the {strategy === "snowball" ? "snowball" : "avalanche"} order applies.</Note>
      {[...prioritized.sort((left, right) => (priorities.find((item) => item.debtAccountId === left.id)?.priorityRank ?? 0) - (priorities.find((item) => item.debtAccountId === right.id)?.priorityRank ?? 0)), ...unprioritized].map((debt) => {
        const priority = priorities.find((item) => item.debtAccountId === debt.id);
        return <View key={debt.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {priority ? <Pill label={`#${priority.priorityRank}`} tone="ok" /> : null}
          <Text numberOfLines={1} style={[ui.listTitle, { flex: 1 }]}>{debt.name}</Text>
          <LinkButton label={priority ? "Remove" : "Prioritize"} tone={priority ? "err" : undefined} accessibilityLabel={priority ? `Remove priority from ${debt.name}` : `Prioritize ${debt.name}`} disabled={savingPriorities} onPress={() => { togglePriority(debt.id).catch(() => {}); }} />
        </View>;
      })}
    </FormCard> : null}
  </View>;
}

function progressCaption(debt: DebtAccount): string {
  if (debt.status === "paid_off") return "Paid off";
  if (debt.status === "archived") return "Archived";
  if (debt.status === "deleted") return "Deleted";
  if (debt.progress === "ahead") return "Ahead";
  if (debt.progress === "behind") return "Behind";
  if (debt.progress === "on_schedule") return "On schedule";
  return "No payments yet";
}
