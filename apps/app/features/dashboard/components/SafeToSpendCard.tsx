import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { getSafeToSpend, type SafeToSpend } from "../../../local-db/repositories/dashboard/safeToSpend";
import { formatPeso } from "../dashboardFormatting";

import { dashboardColors as P, dashboardStyles } from "../dashboardAppearance";
import { manilaToday } from "../../../lib/dates";
import { WithTermInfo } from "../../../components/TermInfo";

type Props = {
  userId: string;
  // Changes whenever the dashboard reloads, so this card reloads with it.
  reloadKey: unknown;
  onNavigate: (page: string) => void;
};

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
}

function headline(data: SafeToSpend): { amount: string; detail: string } {
  if (data.leftCentavos < 0) return { amount: `${formatPeso(-data.leftCentavos)} over budget`, detail: `You have spent more than this cycle's plan, which ends ${shortDate(data.periodEnd)}.` };
  if (data.leftCentavos === 0) return { amount: "No budget left", detail: `You have used this cycle's plan, which ends ${shortDate(data.periodEnd)}.` };
  return {
    amount: `${formatPeso(data.leftCentavos)} left until ${shortDate(data.periodEnd)}`,
    detail: data.daysLeft === 1 ? `About ${formatPeso(data.dailyCentavos)} for today.` : `About ${formatPeso(data.dailyCentavos)} a day for ${data.daysLeft} days.`,
  };
}

export function SafeToSpendCard({ userId, reloadKey, onNavigate }: Props) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error" } | { status: "ready"; data: SafeToSpend | null }>({ status: "loading" });

  useEffect(() => {
    let current = true;
    void getSafeToSpend(userId, manilaToday())
      .then((data) => { if (current) setState({ status: "ready", data }); })
      .catch(() => { if (current) setState({ status: "error" }); });
    return () => { current = false; };
  }, [userId, reloadKey]);

  return <View style={{ marginTop: 24 }}>
    <WithTermInfo term="safe-to-spend" style={{ marginBottom: 10 }}><Text style={dashboardStyles.sectionTitle}>Safe to spend</Text></WithTermInfo>
    {state.status === "loading" ? <ActivityIndicator color={P.brand} /> : null}
    {state.status === "error" ? <Text style={{ fontFamily: "Manrope", fontSize: 13, color: P.secondary }}>Your budget could not be loaded. Refresh to try again.</Text> : null}
    {state.status === "ready" && !state.data ? <Pressable accessibilityRole="button" accessibilityLabel="Open Financial Plan" onPress={() => onNavigate("financial-plan")} style={[dashboardStyles.card, { alignItems: "center" }]}>
      <Text style={{ fontFamily: "Manrope", fontSize: 13, color: P.secondary, textAlign: "center" }}>Create this month's Financial Plan to see how much you can safely spend.</Text>
      <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: P.green, marginTop: 6 }}>Open Financial Plan</Text>
    </Pressable> : null}
    {state.status === "ready" && state.data ? <SafeToSpendDetails data={state.data} onNavigate={onNavigate} /> : null}
  </View>;
}

function SafeToSpendDetails({ data, onNavigate }: { data: SafeToSpend; onNavigate: (page: string) => void }) {
  const { amount, detail } = headline(data);
  return <View style={[dashboardStyles.card, { gap: 14 }]}>
    <View>
      <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 20, color: data.leftCentavos < 0 ? P.error : P.brand }}>{amount}</Text>
      <Text style={{ fontFamily: "Manrope", fontSize: 14, lineHeight: 21, color: P.secondary, marginTop: 4 }}>{detail}</Text>
    </View>
    {data.categories.map((category) => {
      const pct = Math.min(category.spentCentavos / category.plannedCentavos * 100, 100);
      const barColor = pct >= 100 ? P.error : pct >= 85 ? P.warning : P.green;
      return <View key={category.allocationId}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          <Text style={{ fontFamily: "Manrope", fontWeight: "600", fontSize: 12.5, color: P.secondary }}>{category.label}</Text>
          <Text style={{ fontFamily: "Manrope", fontWeight: "600", fontSize: 12, color: P.secondary }}>{formatPeso(category.spentCentavos)} / {formatPeso(category.plannedCentavos)}</Text>
        </View>
        <View style={{ height: 8, borderRadius: 8, backgroundColor: P.track, overflow: "hidden" }}>
          <View style={{ width: `${pct}%`, height: "100%", borderRadius: 6, backgroundColor: barColor }} />
        </View>
      </View>;
    })}
    <Pressable accessibilityRole="button" accessibilityLabel="Open Financial Plan" onPress={() => onNavigate("financial-plan")}>
      <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: P.green }}>View all budgets</Text>
    </Pressable>
  </View>;
}
