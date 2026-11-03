import React, { useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Banner, FormCard, Note, v4 } from "../../../../components/BudgieForm";
import type { CreditCardForecastPoint, CreditCardScheduleStatus } from "../helpers/creditCardForecast";
import { DebtForecastChart } from "../../forecast/components/DebtForecastChart";
import { DebtForecastTable } from "../../forecast/components/DebtForecastTable";
import { filterDebtTrendPoints, type DebtTrendRange } from "../../forecast/helpers/debtTrendRange";
import { manilaToday } from "../../../../lib/dates";
import { ChartLegend, Pill, RangeChips, formatMilestoneDate } from "../../components/debtUi";

const CHART_HEIGHT = 220;

function collapseSameDayActuals<T extends { date: string; isForecast: boolean }>(points: T[]): T[] {
  const lastActualIndexByDate = new Map<string, number>();
  points.forEach((point, index) => {
    if (!point.isForecast) lastActualIndexByDate.set(point.date, index);
  });
  return points.filter((point, index) => point.isForecast || lastActualIndexByDate.get(point.date) === index);
}

type Props = {
  forecast: { points: CreditCardForecastPoint[]; status: CreditCardScheduleStatus } | null;
  isLoading: boolean;
  creditLimitCentavos: number;
  reconciliationAt?: string | null;
};

export default function CreditCardForecastSection({ forecast, isLoading, creditLimitCentavos, reconciliationAt }: Props) {
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState<DebtTrendRange>("year");
  const rangeCache = useRef<{
    points: CreditCardForecastPoint[];
    today: string;
    payoffDate: string | undefined;
    visiblePoints: Map<DebtTrendRange, CreditCardForecastPoint[]>;
  } | null>(null);
  if (!forecast) {
    return <View accessibilityLabel="Generating credit-card repayment forecast"><FormCard title="Credit-card debt trend">
      <View style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}><ActivityIndicator color={v4.brand} /><Note>Generating your repayment forecast...</Note></View>
    </FormCard></View>;
  }
  const { points, status } = forecast;
  const today = manilaToday();
  if (rangeCache.current?.points !== points || rangeCache.current.today !== today) {
    rangeCache.current = {
      points,
      today,
      payoffDate: points.find((point) => point.date >= today && creditLimitCentavos - point.availableCreditCentavos <= 0)?.date,
      visiblePoints: new Map(),
    };
  }
  const { payoffDate, visiblePoints: cachedRanges } = rangeCache.current;
  const visiblePoints = cachedRanges.get(range) ?? filterDebtTrendPoints(points, range, payoffDate);
  if (!cachedRanges.has(range)) cachedRanges.set(range, visiblePoints);
  const balancePoints = collapseSameDayActuals(visiblePoints.map((point) => ({ id: `${point.cycleId}-${point.date}`, date: point.date, balanceCentavos: Math.max(0, creditLimitCentavos - point.availableCreditCentavos), isForecast: point.cycleId.startsWith("forecast") })));
  const guidance = status === "ahead" ? "Recorded payments exceed the selected targets due so far." : status === "behind" ? "Recorded payments are below selected targets due so far." : "Recorded payments match selected targets due so far.";
  const statusPill = status === "ahead" ? { label: "Ahead", tone: "ok" as const } : status === "behind" ? { label: "Behind", tone: "warn" as const } : { label: "On Schedule", tone: "ok" as const };
  return <View accessibilityLabel={`Repayment forecast: ${status.replace("_", " ")}. ${guidance}`}><FormCard title="Credit-card debt trend" right={<Pill label={statusPill.label} tone={statusPill.tone} />}>
    <Note>{guidance}</Note>
    {reconciliationAt ? <Note>Issuer balance anchored {new Date(reconciliationAt).toLocaleString()}. Earlier history is estimated from recorded activity.</Note> : null}
    {isLoading ? <View accessibilityLabel="Updating credit-card repayment forecast" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><ActivityIndicator size="small" color={v4.brand} /><Note>Updating forecast...</Note></View> : null}
    <RangeChips range={range} onChange={setRange} payoffAvailable={Boolean(payoffDate)} />
    {payoffDate ? <Banner tone="info">{`Debt-free by ${formatMilestoneDate(payoffDate)}, based on your selected repayment strategy.`}</Banner> : null}
    <ChartLegend />
    {visiblePoints.length === 0 ? <Note>No card-debt movement falls in this calendar window.</Note> : <><View onLayout={(event) => setWidth(Math.floor(event.nativeEvent.layout.width))} style={{ height: CHART_HEIGHT }}>{width > 0 ? <DebtForecastChart points={balancePoints} status={status} today={today} width={width} colorMode="blue" /> : null}</View><DebtForecastTable points={balancePoints} milestoneDate={payoffDate} /></>}
    <Note>Each point is credit limit minus available credit. {reconciliationAt ? "Points before the issuer anchor are estimated history." : "History is reconstructed from recorded card purchases and payments."}</Note>
  </FormCard></View>;
}
