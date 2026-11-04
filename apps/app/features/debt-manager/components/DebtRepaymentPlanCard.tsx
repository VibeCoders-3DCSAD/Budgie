import React from "react";
import { Text, View } from "react-native";
import { FormCard, Note, v4, v4Font } from "../../../components/BudgieForm";
import type { DebtStrategy } from "../../../local-db/repositories/debts/debtRepaymentPlans";
import type { CommitmentPayment } from "../../financial-plan/helpers/commitmentPayments";
import { Divider, InfoRow } from "./debtUi";
import { formatPeso as php } from "../../financial-plan/helpers/financialPlanPresentation";

export type DebtPlanRow = { id: string; label: string; amountCentavos: number; dueDate?: string | null; payment?: CommitmentPayment };

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
  surplusCentavos: number;
  repayments: DebtPlanRow[];
  surplusRecommendations: DebtPlanRow[];
};

export default function DebtRepaymentPlanCard({ strategy, hasPlan, debtBudgetCentavos, creditCardBudgetCentavos, loanBudgetCentavos, shortfallCentavos, surplusCentavos, repayments, surplusRecommendations }: Props) {
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
      <View accessibilityRole={hasShortfall ? "alert" : undefined}><InfoRow label={hasShortfall ? "Plan shortfall" : "Strategy surplus"} term={hasShortfall ? "shortfall" : "surplus"} value={php(hasShortfall ? shortfallCentavos : surplusCentavos)} tone={hasShortfall ? "err" : "ok"} /></View>
      {repayments.length ? <RowList title="Financial Plan repayments" rows={repayments} /> : null}
      {surplusRecommendations.length ? <RowList title="Recommended surplus allocation" rows={surplusRecommendations} /> : null}
    </> : <Note>Accept a Financial Plan for this month to calculate allocation and surplus.</Note>}
  </FormCard>;
}

function RowList({ title, rows }: { title: string; rows: DebtPlanRow[] }) {
  return <View style={{ gap: 8 }}>
    <Divider />
    <Text style={{ color: v4.ink, fontFamily: v4Font, fontSize: 12.5, fontWeight: "800" }}>{title}</Text>
    {rows.map((row) => <View key={row.id} accessible accessibilityLabel={`${row.label}, ${php(row.amountCentavos)}${row.dueDate ? `, due ${row.dueDate}` : ""}${row.payment ? `, ${PAYMENT_STATUS[row.payment.status].label}, paid ${php(row.payment.paidCentavos)} of ${php(row.payment.dueCentavos)}` : ""}`} style={{ gap: 6, paddingVertical: 8 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: v4.ink, fontFamily: v4Font, fontSize: 13, fontWeight: "700" }}>{row.label}</Text>
          <Text style={{ color: v4.mut, fontFamily: v4Font, fontSize: 11, marginTop: 2 }}>{row.dueDate ? `Due ${row.dueDate}` : "No scheduled date"}{row.payment ? ` · Amount due: ${php(row.payment.dueCentavos)}` : ""}</Text>
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
