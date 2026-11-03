import React, { useState } from "react";
import { Text, View } from "react-native";
import { FormCard, Note, v4, v4Font } from "../../../../components/BudgieForm";
import type { DebtAccount } from "../../../../local-db/repositories/debts/debtAccounts";
import type { DebtPayment } from "../../../../local-db/repositories/debts/debtPayments";
import { buildDebtForecast, type DebtForecastStatus } from "../../forecast/helpers/debtForecast";
import { DebtForecastChart } from "../../forecast/components/DebtForecastChart";
import { DebtForecastTable } from "../../forecast/components/DebtForecastTable";
import { groupMissedPaymentPoints } from "../../forecast/helpers/debtForecastPresentation";
import { filterDebtTrendPoints, type DebtTrendRange } from "../../forecast/helpers/debtTrendRange";
import { manilaToday } from "../../../../lib/dates";
import { ChartLegend, InfoRow, Pill, RangeChips, formatMilestoneDate, formatPeso, type Tone } from "../../components/debtUi";

const CHART_HEIGHT = 220;

function statusLabel(status: DebtForecastStatus): string {
  if (status === "ahead") return "Advanced";
  if (status === "behind") return "Underpaid";
  if (status === "on_track") return "On track";
  if (status === "paid_off") return "Paid off";
  return "Not in schedule";
}

function statusColor(status: DebtForecastStatus): string {
  if (status === "ahead" || status === "paid_off") return "#087443";
  if (status === "behind") return "#B45309";
  return "#2563EB";
}

function statusBackground(status: DebtForecastStatus): string {
  if (status === "ahead" || status === "paid_off") return "#E8F5ED";
  if (status === "behind") return "#FFF4E5";
  return "#E6EFFC";
}

export default function NonCreditDebtForecastSection({ debt, payments, projectedContributionCentavos }: { debt: DebtAccount; payments: DebtPayment[]; projectedContributionCentavos?: number }) {
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState<DebtTrendRange>("year");
  const forecast = buildDebtForecast(debt, undefined, payments.map((payment) => ({ paymentDate: payment.payment_date, amountCentavos: payment.amount_centavos })), projectedContributionCentavos);
  const { points } = forecast;
  const today = manilaToday();
  const payoffDate = debt.status === "paid_off" ? debt.paidOffAt?.slice(0, 10) : forecast.projectedPayoffDate ?? undefined;
  const visiblePoints = filterDebtTrendPoints(points, range, payoffDate);
  const missedPaymentGroups = groupMissedPaymentPoints(visiblePoints);
  const balancePoints = visiblePoints.map((point, index) => ({ id: `${point.date}-${index}`, date: point.date, balanceCentavos: point.balanceCentavos, isForecast: point.date > today }));

  const pill = forecastStatusPill(forecast.status);
  return <View accessibilityLabel={`Debt repayment forecast${payoffDate ? `, projected debt-free ${payoffDate}` : ""}`}><FormCard title="Debt repayment forecast" right={<Pill label={pill.label} tone={pill.tone} />}>
    <Note>{debt.status === "paid_off" ? "This debt has been paid off." : debt.interestMethod === "provider_calculated" ? "Projected from your current balance and scheduled contributions." : "Projected from your current balance, scheduled contributions, and interest."}</Note>
    <RangeChips range={range} onChange={setRange} payoffAvailable={Boolean(payoffDate)} allLabel="Show all projected payments" />
    {debt.targetPayoffDate || payoffDate ? <View style={{ padding: 12, borderRadius: 13, backgroundColor: statusBackground(forecast.status), gap: 2 }}><Text style={{ fontFamily: v4Font, fontWeight: "800", fontSize: 12.5, color: statusColor(forecast.status) }}>{debt.targetPayoffDate ? `${statusLabel(forecast.status)}: target payoff ${formatMilestoneDate(debt.targetPayoffDate)}` : debt.status === "paid_off" ? "Paid off" : `Debt-free by ${formatMilestoneDate(payoffDate!)}`}</Text><Text style={{ fontFamily: v4Font, fontSize: 11, color: v4.ink2 }}>{payoffDate ? `Projected debt-free by ${formatMilestoneDate(payoffDate)}.` : "Current scheduled contributions do not reach this target."}</Text></View> : null}
    <ChartLegend color={statusColor(forecast.status)} />
    {visiblePoints.length === 0 ? <Note>No scheduled debt payments fall in this calendar window.</Note> : <><View onLayout={(event) => setWidth(Math.floor(event.nativeEvent.layout.width))} style={{ height: CHART_HEIGHT }}>{width > 0 ? <DebtForecastChart points={balancePoints} status={forecast.status} today={today} width={width} colorMode="status" targetDate={debt.targetPayoffDate ?? undefined} /> : null}</View><DebtForecastTable points={balancePoints} milestoneDate={payoffDate} /></>}
    {missedPaymentGroups.map((group) => <View key={`${group.startDate}-${group.endDate}`} accessibilityLabel={`${group.count} missed payments from ${group.startDate} to ${group.endDate}`}>
      <InfoRow label={`${group.count} missed payments, ${group.startDate} to ${group.endDate}`} value={formatPeso(group.balanceCentavos)} tone="warn" />
    </View>)}
    <Note>{debt.interestMethod === "provider_calculated" ? "Each projected contribution is the greater of the minimum payment and the highest recorded payment. Provider-calculated interest, fees, and extra payments are excluded." : "Each projected contribution is the greater of the minimum payment and the highest recorded payment. Interest is added on dates anchored to the debt start date."}</Note>
  </FormCard></View>;
}

function forecastStatusPill(status: DebtForecastStatus): { label: string; tone: Tone } {
  if (status === "behind") return { label: statusLabel(status), tone: "warn" };
  if (status === "on_track" || status === "not_scheduled") return { label: statusLabel(status), tone: "info" };
  return { label: statusLabel(status), tone: "ok" };
}
