import React, { useState } from "react";
import { View } from "react-native";
import { Banner, FormCard, Note } from "../../../../components/BudgieForm";
import { filterDebtTrendPoints, type DebtTrendRange } from "../helpers/debtTrendRange";
import { manilaToday } from "../../../../lib/dates";
import { DebtForecastChart, type ForecastChartPoint } from "./DebtForecastChart";
import { DebtForecastTable } from "./DebtForecastTable";
import { ChartLegend, RangeChips, formatMilestoneDate } from "../../components/debtUi";

const CHART_HEIGHT = 220;

export type GlobalDebtPoint = { date: string; debtCentavos: number };

function monthlyBalancePoints(points: GlobalDebtPoint[], today: string): ForecastChartPoint[] {
  const monthly = new Map<string, ForecastChartPoint>();
  for (const point of points) {
    const isForecast = point.date > today;
    // Keep the latest actual balance as the starting point when this month also has forecasts.
    const key = `${point.date.slice(0, 7)}-${isForecast ? "forecast" : "actual"}`;
    const previous = monthly.get(key);
    if (!previous || point.date >= previous.date) {
      monthly.set(key, { id: key, date: point.date, balanceCentavos: point.debtCentavos, isForecast });
    }
  }
  return [...monthly.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export default function GlobalDebtTrend({ points }: { points: GlobalDebtPoint[] }) {
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState<DebtTrendRange>("year");
  const today = manilaToday();
  const payoffDate = points.find((point) => point.date >= today && point.debtCentavos <= 0)?.date;
  const visiblePoints = filterDebtTrendPoints(points, range, payoffDate);
  const balancePoints = monthlyBalancePoints(visiblePoints, today);
  if (points.length === 0) return null;
  return <FormCard title="Total debt trend">
    <Note>Monthly closing balances. Credit-card debt is credit limit minus available credit; other active debt balances are included.</Note>
    <RangeChips range={range} onChange={setRange} payoffAvailable={Boolean(payoffDate)} />
    {payoffDate ? <Banner tone="info">{`Debt-free by ${formatMilestoneDate(payoffDate)}, based on all current repayment projections.`}</Banner> : null}
    <ChartLegend />
    <View onLayout={(event) => setWidth(Math.floor(event.nativeEvent.layout.width))} style={{ height: CHART_HEIGHT }}>
      {width > 0 && visiblePoints.length > 0 ? <DebtForecastChart points={balancePoints} status="on_schedule" today={today} width={width} colorMode="blue" /> : null}
    </View>
    {visiblePoints.length > 0 ? <DebtForecastTable points={balancePoints} milestoneDate={payoffDate} dateGranularity="month" /> : null}
  </FormCard>;
}
