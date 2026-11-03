import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { SavingsAccountDetails } from "../../../../local-db/repositories/savings/savingsAccountDetails";
import { DebtForecastChart } from "../../../debt-manager/forecast/components/DebtForecastChart";
import { filterDebtTrendPoints, type DebtTrendRange } from "../../../debt-manager/forecast/helpers/debtTrendRange";
import { manilaToday } from "../../../../lib/dates";
import type { SavingsActivity } from "../../types";
import { SavingsForecastTable } from "./SavingsForecastTable";
import { buildSavingsForecast, type SavingsForecastStatus } from "../helpers/savingsForecast";
import type { SavingsContributionSchedule } from "../../helpers/contributionSchedule";

const P = { ink: "#1B1C1A", muted: "#6B7A6F", line: "#EAEAE6" } as const;
const CHART_HEIGHT = 220;
const statusColors: Record<SavingsForecastStatus, { text: string; background: string; label: string }> = {
  ahead: { text: "#087443", background: "#E8F5ED", label: "Ahead" },
  on_track: { text: "#2563EB", background: "#E6EFFC", label: "On track" },
  behind: { text: "#B45309", background: "#FFF4E5", label: "Behind" },
  projected: { text: "#2563EB", background: "#E6EFFC", label: "Projected" },
  not_scheduled: { text: "#6B7A6F", background: "#E7E7E2", label: "No schedule" },
};

type Props = {
  currentBalanceCentavos: number;
  startingBalanceCentavos: number;
  targetAmountCentavos?: number;
  targetDate?: string | null;
  schedule: SavingsContributionSchedule;
  interestRateBps: number | null;
  details?: SavingsAccountDetails | null;
  activities?: SavingsActivity[];
};

export function SavingsForecastSection(props: Props) {
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState<DebtTrendRange>("year");
  const today = manilaToday();
  const forecast = buildSavingsForecast({ ...props, asOf: today });
  const visiblePoints = filterDebtTrendPoints(forecast.points, range, forecast.projectedTargetDate ?? undefined);
  const chartPoints = visiblePoints.map((point, index) => ({ id: `${point.date}-${point.event}-${index}`, date: point.date, balanceCentavos: point.balanceCentavos, isForecast: point.isForecast }));
  const presentationStatus = forecast.status === "projected" || forecast.status === "not_scheduled" ? "on_track" : forecast.status;
  const status = statusColors[forecast.status];

  return <View style={{ borderTopWidth: 1, borderTopColor: P.line, marginTop: 18, paddingTop: 16 }} accessibilityLabel={`Savings forecast. Status: ${status.label}.`}>
    <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 15, color: P.ink }}>Savings forecast</Text>
    <Text style={{ fontFamily: "Manrope", fontSize: 11.5, color: P.muted, marginTop: 4 }}>Projected from your current balance, planned contributions, and interest.</Text>
    <View style={{ marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: status.background }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 12, color: status.text }}>{status.label}{props.targetDate ? `: target ${props.targetDate}` : ""}</Text><Text style={{ fontFamily: "Manrope", fontSize: 10.5, color: P.muted, marginTop: 2 }}>{forecast.status === "not_scheduled" ? "No contribution schedule is configured. Manual contributions update your balance and progress." : forecast.projectedTargetDate ? `Projected to reach the target by ${forecast.projectedTargetDate}.` : props.targetDate ? "Current scheduled contributions do not reach this target date." : forecast.interestExplanation}</Text></View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>{(["month", "year", "all"] as const).map((option) => <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Show 1 ${option}`} onPress={() => setRange(option)} style={{ borderWidth: 1, borderColor: range === option ? P.ink : P.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11, color: P.ink }}>{option === "all" ? "All" : `1 ${option}`}</Text></Pressable>)}</View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }} accessibilityLabel="Chart legend: solid line actual balance, dashed line forecast"><Text style={{ fontFamily: "Manrope", fontSize: 10.5, color: P.muted }}>Solid: Actual balance</Text><Text style={{ fontFamily: "Manrope", fontSize: 10.5, color: P.muted }}>Dashed: Forecast</Text></View>
    {visiblePoints.length <= 1 ? <Text style={{ fontFamily: "Manrope", fontSize: 11.5, color: P.muted, marginTop: 10 }}>Add a complete contribution schedule to see future savings projections.</Text> : <><View onLayout={(event) => setWidth(Math.floor(event.nativeEvent.layout.width))} style={{ height: CHART_HEIGHT, marginTop: 10 }}>{width > 0 ? <DebtForecastChart points={chartPoints} status={presentationStatus} today={today} width={width} colorMode={forecast.status === "projected" || forecast.status === "not_scheduled" ? "blue" : "status"} targetDate={props.targetDate ?? undefined} accessibilityLabel="Savings trend" /> : null}</View><SavingsForecastTable points={visiblePoints} milestoneDate={forecast.projectedTargetDate} /></>}
    <Text style={{ fontFamily: "Manrope", fontSize: 10.5, color: P.muted, marginTop: 8 }}>{forecast.interestExplanation} Planned contributions and projected interest do not change your actual balance.</Text>
  </View>;
}
