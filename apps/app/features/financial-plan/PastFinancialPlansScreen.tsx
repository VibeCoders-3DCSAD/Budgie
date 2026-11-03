import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { manilaToday } from "../../lib/dates";
import { listCompletedFinancialPlans } from "../../local-db/repositories/financial-plans/financialPlans";
import { formatPeso, formatPlanMonthLabel } from "./helpers/financialPlanPresentation";
import type { CompletedFinancialPlanSummary } from "./past-plans/pastPlanTypes";

export type PastFinancialPlansScreenProps = {
  userId: string;
  onOpenPlan: (planId: string) => void;
};

export default function PastFinancialPlansScreen({ userId, onOpenPlan }: PastFinancialPlansScreenProps) {
  const [plans, setPlans] = useState<CompletedFinancialPlanSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPlans(null);
    setError(null);
    listCompletedFinancialPlans(userId, manilaToday())
      .then((result) => { if (active) setPlans(result); })
      .catch(() => { if (active) setError("Your past plans could not be loaded."); });
    return () => { active = false; };
  }, [userId]);

  if (error) return <View accessibilityRole="alert" style={{ marginTop: 16, backgroundColor: "#FBE9E7", borderRadius: 16, padding: 16 }}><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 15, color: "#D9001F" }}>Past plans unavailable</Text><Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#414942", marginTop: 5 }}>{error}</Text></View>;
  if (plans === null) return <View style={{ paddingTop: 32, alignItems: "center" }}><ActivityIndicator color="#0E6D46" /><Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#6B7A6F", marginTop: 10 }}>Loading past plans...</Text></View>;

  return (
    <View style={{ paddingBottom: 28 }}>
      <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 20, color: "#1B1C1A" }}>Past plans</Text>
      <Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#6B7A6F", marginTop: 2 }}>Review how your completed Financial Plans turned out.</Text>
      {plans.length === 0 ? <View style={{ marginTop: 16, backgroundColor: "#F1F0EB", borderRadius: 16, padding: 16 }}><Text style={{ fontFamily: "Manrope", fontSize: 12, color: "#6B7A6F" }}>No completed plans yet</Text></View> : null}
      {plans.map((plan) => {
        const month = formatPlanMonthLabel(plan.periodStart);
        const hasShortfall = (plan.shortfallCentavos ?? 0) > 0;
        return (
          <Pressable key={plan.id} accessibilityRole="button" accessibilityLabel={`Open ${month} plan`} onPress={() => onOpenPlan(plan.id)} style={{ marginTop: 12, backgroundColor: "#F1F0EB", borderRadius: 16, padding: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ flex: 1, fontFamily: "Manrope", fontWeight: "800", fontSize: 15, color: "#1B1C1A" }}>{month}</Text>
              <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 14, color: "#1B1C1A" }}>{formatPeso(plan.plannedTotalCentavos)}</Text>
            </View>
            <Text style={{ fontFamily: "Manrope", fontSize: 11, color: "#6B7A6F", marginTop: 4 }}>{plan.periodStart} to {plan.periodEnd}</Text>
            {hasShortfall ? <Text style={{ alignSelf: "flex-start", fontFamily: "Manrope", fontWeight: "700", fontSize: 11, color: "#D9001F", backgroundColor: "#FFF0F2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 8 }}>Shortfall {formatPeso(plan.shortfallCentavos ?? 0)}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
