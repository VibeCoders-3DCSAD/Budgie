import React from "react";
import { Text, View } from "react-native";
import { FormCard, Note, v4, v4Font } from "../../../components/BudgieForm";
import type { DebtStrategy } from "../../../local-db/repositories/debts/debtRepaymentPlans";
import { Divider, InfoRow } from "./debtUi";
import type { DebtExtraReason, DebtSurplusPlan } from "../helpers/debtSurplusPlan";
import type { DebtPlanRow } from "../helpers/debtPlanRows";
import { formatPeso as php } from "../../financial-plan/helpers/financialPlanPresentation";

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
  rows: DebtPlanRow[];
};

export default function DebtRepaymentPlanCard({ strategy, hasPlan, debtBudgetCentavos, creditCardBudgetCentavos, loanBudgetCentavos, shortfallCentavos, surplusPlan, rows }: Props) {
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
      {rows.length ? <RowList title="Financial Plan repayments" rows={rows} /> : null}
      {surplusPlan.unassignedCentavos > 0 ? <UnassignedSurplusRow amountCentavos={surplusPlan.unassignedCentavos} /> : null}
    </> : <Note>Accept a Financial Plan for this month to calculate allocation and surplus.</Note>}
  </FormCard>;
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

function extraReasonLabel(reason: DebtExtraReason): string {
  if (reason.kind === "priority") return `Extra goes here first: your priority #${reason.rank}`;
  if (reason.kind === "snowball") return "Extra goes here first: smallest balance (Snowball)";
  return "Extra goes here first: highest interest (Avalanche)";
}

// Rows that only hold extra paid beyond the plan show that amount; others show required + extra.
function rowAmount(row: DebtPlanRow): number {
  const planned = row.requiredCentavos + row.extraCentavos;
  return planned > 0 ? planned : row.extraPaidBeyondPlanCentavos;
}

function rowFirstLine(row: DebtPlanRow): string {
  if (row.requiredCentavos === 0 && row.extraCentavos > 0) return "Extra payment this month";
  if (row.requiredCentavos === 0) return "Extra paid this month, beyond the plan";
  const due = row.dueDate ? `Due ${row.dueDate}` : "No scheduled date";
  if (row.extraCentavos > 0) return `${due} · ${php(row.requiredCentavos)} required + ${php(row.extraCentavos)} extra`;
  if (!row.payment) return due;
  return `${due} · Amount due: ${php(row.payment.dueCentavos)}`;
}

function rowDetails(row: DebtPlanRow): string[] {
  const details = [];
  if (row.extraReason && row.extraCentavos > 0) details.push(extraReasonLabel(row.extraReason));
  if (row.extraPaidBeyondPlanCentavos > 0 && row.requiredCentavos + row.extraCentavos > 0) details.push(`${php(row.extraPaidBeyondPlanCentavos)} extra paid beyond this month's plan`);
  return details;
}

function rowAccessibilityLabel(row: DebtPlanRow): string {
  const payment = row.payment ? `, ${PAYMENT_STATUS[row.payment.status].label}, paid ${php(row.payment.paidCentavos)} of ${php(row.payment.dueCentavos)}` : "";
  const split = row.extraCentavos > 0 && row.requiredCentavos > 0 ? [`${php(row.requiredCentavos)} required + ${php(row.extraCentavos)} extra`] : [];
  return [`${row.label}, ${php(rowAmount(row))}${row.dueDate ? `, due ${row.dueDate}` : ""}${payment}`, ...split, ...rowDetails(row)].join(", ");
}

function RowList({ title, rows }: { title: string; rows: DebtPlanRow[] }) {
  return <View style={{ gap: 8 }}>
    <Divider />
    <Text style={{ color: v4.ink, fontFamily: v4Font, fontSize: 12.5, fontWeight: "800" }}>{title}</Text>
    {rows.map((row) => <View key={row.id} accessible accessibilityLabel={rowAccessibilityLabel(row)} style={{ gap: 6, paddingVertical: 8 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: v4.ink, fontFamily: v4Font, fontSize: 13, fontWeight: "700" }}>{row.label}</Text>
          <Text style={{ color: v4.mut, fontFamily: v4Font, fontSize: 11, marginTop: 2 }}>{rowFirstLine(row)}</Text>
          {rowDetails(row).map((line) => <Text key={line} style={{ color: v4.mut, fontFamily: v4Font, fontSize: 11, marginTop: 2 }}>{line}</Text>)}
        </View>
        <Text style={{ color: v4.ink, fontFamily: v4Font, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{php(rowAmount(row))}</Text>
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
