import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import AnomalyAlertsScreen from "../alerts/AnomalyAlertsScreen";
import SpendingForecastScreen from "../forecast/SpendingForecastScreen";
import {
  AllocationSummarySection,
  BudgetActualSection,
  CategoryBreakdownSection,
  DebtSummarySection,
  ExpenseDistributionSection,
  ForecastActualSection,
  SavingsProgressSection,
} from "./ReportSections";
import { rangeFor, type ReportPeriod } from "./reportRange";
import { TourTarget } from "../onboarding-tour/components/TourTarget";

type Props = {
  userId: string;
  deviceId: string;
  accessToken: string;
  syncVersion?: number;
  // Called with the forecast section's offset in the shell's scroll content, each time it moves.
  onForecastLayout?: (y: number) => void;
};

const P = { brand: "#013220", ink: "#1B1C1A", muted: "#6B7A6F", tint: "#EFFEF7" };

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "this_week", label: "This week" },
];

export default function FinancialReportsScreen({ userId, deviceId, accessToken, syncVersion = 0, onForecastLayout }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>("this_month");
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const refreshKey = manualRefreshKey + syncVersion;
  const range = rangeFor(period);
  const screenY = useRef(0);
  const forecastY = useRef(0);
  const reportForecastLayout = () => onForecastLayout?.(screenY.current + forecastY.current);

  return <View onLayout={({ nativeEvent }) => { screenY.current = nativeEvent.layout.y; reportForecastLayout(); }}>
    <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 22, fontWeight: "800" }}>Financial Reports</Text>
    <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 14, lineHeight: 21, marginTop: 5 }}>
      A clear read on your money, from spending to goals and debt.
    </Text>

    <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 13, fontWeight: "800", marginTop: 20 }}>Reporting period</Text>
    <TourTarget id="reports-period" fill><View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
      {PERIODS.map((option) => <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: period === option.value }} onPress={() => setPeriod(option.value)} style={{ flex: 1, alignItems: "center", backgroundColor: period === option.value ? P.brand : P.tint, borderRadius: 10, paddingVertical: 9 }}>
        <Text style={{ color: period === option.value ? "#FFFFFF" : P.brand, fontFamily: "Manrope", fontSize: 11, fontWeight: "800" }}>{option.label}</Text>
      </Pressable>)}
    </View></TourTarget>
    <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 7 }}>
      <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 11 }}>{range.startDate} to {range.endDate}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh financial report" onPress={() => setManualRefreshKey((value) => value + 1)} hitSlop={8}>
        <Text style={{ color: P.brand, fontFamily: "Manrope", fontSize: 12, fontWeight: "800" }}>Refresh</Text>
      </Pressable>
    </View>

    <View style={{ gap: 14, marginTop: 20 }}>
      <TourTarget id="reports-distribution" fill><ExpenseDistributionSection userId={userId} range={range} refreshKey={refreshKey} /></TourTarget>
      <TourTarget id="reports-forecast-actual" fill><ForecastActualSection userId={userId} accessToken={accessToken} refreshKey={refreshKey} /></TourTarget>
      <TourTarget id="reports-budget-actual" fill><BudgetActualSection userId={userId} range={range} refreshKey={refreshKey} /></TourTarget>
      <SavingsProgressSection userId={userId} refreshKey={refreshKey} />
      <DebtSummarySection userId={userId} refreshKey={refreshKey} />
      <CategoryBreakdownSection userId={userId} range={range} refreshKey={refreshKey} />
      <AllocationSummarySection userId={userId} range={range} refreshKey={refreshKey} />
    </View>

    <View onLayout={({ nativeEvent }) => { forecastY.current = nativeEvent.layout.y; reportForecastLayout(); }} style={{ marginTop: 32 }}><TourTarget id="reports-outlook" fill><SpendingForecastScreen userId={userId} accessToken={accessToken} refreshKey={refreshKey} embedded /></TourTarget></View>
    <View style={{ marginTop: 32 }}><TourTarget id="reports-unusual" fill><AnomalyAlertsScreen userId={userId} deviceId={deviceId} /></TourTarget></View>
  </View>;
}
