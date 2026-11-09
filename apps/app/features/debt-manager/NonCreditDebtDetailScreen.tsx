import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Banner, styles as ui, v4, v4Font } from "../../components/BudgieForm";
import { listDebtAccounts, type DebtAccount } from "../../local-db/repositories/debts/debtAccounts";
import { listDebtPayments, type DebtPayment } from "../../local-db/repositories/debts/debtPayments";
import { getLatestFinancialPlan } from "../../local-db/repositories/financial-plans/financialPlans";
import NonCreditDebtCard from "./non-credit/components/NonCreditDebtCard";
import NonCreditDebtForecastSection from "./non-credit/components/NonCreditDebtForecastSection";
import NonCreditDebtForm from "./non-credit/components/NonCreditDebtForm";
import { getDebtTypeLabel } from "./debtTypes";
import { Button, DebtTypeIcon, debtTypeTint } from "./components/debtUi";
import { TourTarget } from "../onboarding-tour/components/TourTarget";

type Props = { userId: string; deviceId: string; debtId: string; onBack: () => void; onRecordPayment: (debtId: string) => void; onEditPayment: (payment: DebtPayment) => void };

export default function NonCreditDebtDetailScreen({ userId, deviceId, debtId, onBack, onRecordPayment, onEditPayment }: Props) {
  const [debt, setDebt] = useState<DebtAccount | null | undefined>(undefined);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [editing, setEditing] = useState(false);
  const [projectedContributionCentavos, setProjectedContributionCentavos] = useState<number | undefined>();
  async function load() {
    const debts = await listDebtAccounts(userId, "all");
    const nextDebt = debts.find((item) => item.id === debtId) ?? null;
    setDebt(nextDebt);
    setPayments(nextDebt ? await listDebtPayments(userId, debtId) : []);
    try {
      const plan = await getLatestFinancialPlan(userId);
      const reservations = plan?.recommendation.debtReservations;
      const reservation = Array.isArray(reservations)
        ? reservations.find((item) => item && typeof item === "object" && (item as { debtAccountId?: unknown }).debtAccountId === nextDebt?.id) as { amountCentavos?: unknown } | undefined
        : undefined;
      setProjectedContributionCentavos(typeof reservation?.amountCentavos === "number" ? reservation.amountCentavos : undefined);
    } catch {
      setProjectedContributionCentavos(undefined);
    }
  }
  useEffect(() => { load().catch(() => setDebt(null)); }, [debtId, userId]);
  if (debt === undefined) return <ActivityIndicator color={v4.brand} />;
  if (debt === null) return <View style={{ gap: 12 }}><Banner tone="error">This debt is unavailable.</Banner><Button variant="ghost" label="Back to debts" accessibilityLabel="Back to Non Credit Card Debts" onPress={onBack} /></View>;
  if (editing) return <NonCreditDebtForm userId={userId} deviceId={deviceId} debt={debt} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load().catch(() => {}); }} />;
  return <View style={{ gap: 14 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={[ui.listTile, { backgroundColor: debtTypeTint(debt.type).bg, width: 40, height: 40, borderRadius: 12 }]}><DebtTypeIcon type={debt.type} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: v4Font, fontWeight: "800", fontSize: 20, color: v4.ink }}>{debt.name}</Text>
        <Text style={ui.listSubtitle}>{getDebtTypeLabel(debt.type)}</Text>
      </View>
    </View>
    <NonCreditDebtCard userId={userId} deviceId={deviceId} debt={debt} onEdit={() => setEditing(true)} onRecordPayment={onRecordPayment} onEditPayment={onEditPayment} onChanged={() => load().catch(() => {})} />
    <TourTarget id="debt-forecast" fill><NonCreditDebtForecastSection debt={debt} payments={payments} projectedContributionCentavos={projectedContributionCentavos} /></TourTarget>
  </View>;
}
