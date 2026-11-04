import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { ArrowLeft, Sparkle } from "phosphor-react-native";
import { QuarterlyForecastCharts } from "./QuarterlyForecastCharts";
import { useQuarterlySpendingForecast } from "./hooks/useQuarterlySpendingForecast";
import { WithTermInfo } from "../../components/TermInfo";

type Props = { userId: string; accessToken: string; onBack?: () => void; embedded?: boolean; refreshKey?: number };

export default function SpendingForecastScreen(props: Props) {
  return <UserSpendingForecastScreen key={props.userId} {...props} />;
}

function UserSpendingForecastScreen({ userId, accessToken, onBack, embedded = false, refreshKey = 0 }: Props) {
  const { forecast, history, monthHistory, preferences, refreshing, stale, error, notice } = useQuarterlySpendingForecast(userId, accessToken, refreshKey);
  const content = <View>
    {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Back to financial reports" onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 }}><ArrowLeft size={18} color="#1B1C1A" weight="bold" /><Text style={{ fontFamily: "Manrope", fontWeight: "600", fontSize: 14, color: "#6B7A6F" }}>Financial Reports</Text></Pressable> : null}
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 18, backgroundColor: "#08B16A", justifyContent: "center", alignItems: "center" }}><Sparkle size={18} color="#FFFFFF" weight="fill" /></View><View style={{ flex: 1, flexShrink: 1 }}><WithTermInfo term="forecast"><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 20, color: "#1B1C1A" }}>Spending forecast</Text></WithTermInfo><Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#6B7A6F", marginTop: 2 }}>Based on your spending history, national spending trends, and scheduled payments.</Text></View></View>
    {!forecast && refreshing ? <ActivityIndicator accessibilityLabel="Loading spending forecast" color="#0B8A55" style={{ marginTop: 48 }} /> : <>
      {error ? <Text style={{ fontFamily: "Manrope", fontSize: 13, lineHeight: 20, color: "#D9001F", marginTop: 14 }}>{error}</Text> : null}
      {notice ? <Text style={{ fontFamily: "Manrope", fontSize: 13, lineHeight: 20, color: "#6B7A6F", marginTop: 14 }}>{notice}</Text> : null}
      {forecast && refreshing ? <Text accessibilityLiveRegion="polite" style={{ fontFamily: "Manrope", fontSize: 12, color: "#6B7A6F", marginTop: 14 }}>Updating forecast…</Text> : null}
      {stale && forecast && !refreshing ? <Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#6B7A6F", marginTop: 14 }}>This forecast hasn't been updated recently.</Text> : null}
      {forecast ? <QuarterlyForecastCharts forecast={forecast} history={history} monthHistory={monthHistory} preferences={preferences} /> : !error && !notice ? <Text style={{ fontFamily: "Manrope", fontSize: 13, lineHeight: 20, color: "#6B7A6F", marginTop: 14 }}>Record posted transactions to unlock a spending forecast.</Text> : null}
    </>}
  </View>;

  return embedded ? content : <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>{content}</ScrollView>;
}
