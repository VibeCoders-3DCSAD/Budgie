import React from "react";
import { Text, View } from "react-native";
import { FormCard, Note, v4, v4Font } from "../../../components/BudgieForm";
import type { DebtStrategy } from "../../../local-db/repositories/debts/debtRepaymentPlans";
import type { CommitmentPayment } from "../../financial-plan/helpers/commitmentPayments";
import { Divider, InfoRow } from "./debtUi";
import type { DebtSurplusPlan, DebtSurplusRecommendation } from "../helpers/debtSurplusPlan";
import { formatPeso as php } from "../../financial-plan/helpers/financialPlanPresentation";

// subtitle replaces the due-date line, for rows that have no due date or amount due (surplus).
export type DebtPlanRow = { id: string; label: string; amountCentavos: number; dueDate?: string | null; payment?: CommitmentPayment; subtitle?: string };

const PAYMENT_STATUS = {
  paid: { label: "Paid", background: "#E3F2EA", color: "#0E6D46" },
  partial: { label: "Partially paid", background: "#FFF8E7", color: "#6F4A00" },
  unpaid: { label: "Not paid", background: "#ECEDEA", color: "#414942" },
};

type Props = {
  strategy: DebtStrategy;
  hasPlan: boolean;
  debtBudgetCentavos: number;
  creditCardBudgetCentavos: number;
  loanBudgetCentavos: number;
  shortfallCentavos: number;
  surplusPlan: DebtSurplusPlan;
  repayments: DebtPlanRow[];
};

export default function DebtRepaymentPlanCard({ strategy, hasPlan, debtBudgetCentavos, creditCardBudgetCentavos, loanBudgetCentavos, shortfallCentavos, surplusPlan, repayments }: Props) {
  const hasShortfall = shortfallCentavos > 0;
  return <FormCard title={`${strategy === "snowball" ? "Snowball" : "Avalanche"} repayment plan`} term={strategy === "snowball" ? "snowball" : "avalanche"}>
    {hasPlan ? <>
      <View>
        <Text style={{ color: v4.ink2, fontFamily: v4Font, fontSize: 12 }}>Debt budget this month</Text>
        <Text style={{ color: v4.ink, fontFamily: v4Font, fontSize: 22, fontWeight: "800", marginTop: 2, fontVariant: ["tabular-nums"] }}>{php(debtBudgetCentavos)}</Text>
        <Note>From your Financial Plan: debt repayments plus debt surplus.</Note>
      </View>
      <Divider />
      <InfoRow label="Planned card payments" value={php(creditCardBudgetCentavos)} />
      <InfoRow label="Planned loan payments" value={php(loanBudgetCentavos)} />
      {hasShortfall ? <View accessibilityRole="alert"><InfoRow label="Plan shortfall" term="shortfall" value={php(shortfallCentavos)} tone="err" /></View> : null}
      <InfoRow label="Strategy surplus" term="surplus" value={php(surplusPlan.surplusCentavos)} tone="ok" />
      {surplusPlan.surplusCentavos > 0 ? <InfoRow label="Surplus left to pay" value={php(surplusPlan.remainingSurplusCentavos)} /> : null}
      {repayments.length ? <RowList title="Financial Plan repayments" rows={repayments} /> : null}
      {surplusPlan.recommendations.length ? <RowList title="Recommended surplus allocation" rows={surplusPlan.recommendations.map(surplusRow)} /> : null}
      {surplusPlan.unassignedCentavos > 0 ? <UnassignedSurplusRow amountCentavos={surplusPlan.unassignedCentavos} /> : null}
    </> : <Note>Accept a Financial Plan for this month to calculate allocation and surplus.</Note>}
  </FormCard>;
}

function surplusRow(recommendation: DebtSurplusRecommendation): DebtPlanRow {
  const row = { id: recommendation.id, label: recommendation.label, amountCentavos: recommendation.plannedCentavos, subtitle: "Extra payment this month" };
  if (recommendation.paidCentavos === 0) return row;
  const status = recommendation.remainingCentavos === 0 ? "paid" as const : "partial" as const;
  return { ...row, payment: { paidCentavos: recommendation.paidCentavos, dueCentavos: recommendation.plannedCentavos, status } };
}

function UnassignedSurplusRow({ amountCentavos }: { amountCentavos: number }) {
  return <View accessible accessibilityLabel={`Not assigned to a debt, ${php(amountCentavos)}. We suggest adding it to your savings goals.`} style={{ gap: 8 }}>
    <Divider />
    <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: v4.ink, fontFamily: v4Font, fontSize: 13, fontWeight: "700" }}>Not assigned to a debt</Text>
        <Text style={{ color: v4.mut, fontFamily: v4Font, fontSize: 11, marginTop: 2 }}>We suggest adding it to your savings goals.</Text>
      </View>
      <Text style={{ color: v4.ink, fontFamily: v4Font, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{php(amountCentavos)}</Text>
    </View>
  </View>;
}

function rowSubtitle(row: DebtPlanRow): string {
  if (row.subtitle) return row.subtitle;
  const due = row.dueDate ? `Due ${row.dueDate}` : "No scheduled date";
  if (!row.payment) return due;
  return `${due} · Amount due: ${php(row.payment.dueCentavos)}`;
}

function RowList({ title, rows }: { title: string; rows: DebtPlanRow[] }) {
  return <View style={{ gap: 8 }}>
    <Divider />
    <Text style={{ color: v4.ink, fontFamily: v4Font, fontSize: 12.5, fontWeight: "800" }}>{title}</Text>
    {rows.map((row) => <View key={row.id} accessible accessibilityLabel={`${row.label}, ${php(row.amountCentavos)}${row.dueDate ? `, due ${row.dueDate}` : ""}${row.payment ? `, ${PAYMENT_STATUS[row.payment.status].label}, paid ${php(row.payment.paidCentavos)} of ${php(row.payment.dueCentavos)}` : ""}`} style={{ gap: 6, paddingVertical: 8 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: v4.ink, fontFamily: v4Font, fontSize: 13, fontWeight: "700" }}>{row.label}</Text>
          <Text style={{ color: v4.mut, fontFamily: v4Font, fontSize: 11, marginTop: 2 }}>{rowSubtitle(row)}</Text>
        </View>
        <Text style={{ color: v4.ink, fontFamily: v4Font, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{php(row.amountCentavos)}</Text>
      </View>
      {row.payment ? <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <View style={{ backgroundColor: PAYMENT_STATUS[row.payment.status].background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: PAYMENT_STATUS[row.payment.status].color, fontFamily: v4Font, fontSize: 10.5, fontWeight: "800" }}>{PAYMENT_STATUS[row.payment.status].label}</Text>
        </View>
        <Text style={{ color: v4.mut, fontFamily: v4Font, fontSize: 11 }}>Paid {php(row.payment.paidCentavos)} of {php(row.payment.dueCentavos)}</Text>
      </View> : null}
    </View>)}
  </View>;
}
