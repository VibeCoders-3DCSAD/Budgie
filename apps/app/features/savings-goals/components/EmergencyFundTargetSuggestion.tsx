import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { getEmergencyFundBaseline } from "../../../local-db/repositories/savings/savingsGoals";
import { manilaToday } from "../../../lib/dates";
import { formatPeso } from "../../../lib/format/money";

type Props = { userId: string; onApply: (amountCentavos: number) => void };
type Result = { userId: string; monthlyCentavos: number | null };

export default function EmergencyFundTargetSuggestion({ userId, onApply }: Props) {
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let active = true;
    getEmergencyFundBaseline(userId, new Date(`${manilaToday()}T00:00:00Z`)).then(
      (monthlyCentavos) => { if (active) setResult({ userId, monthlyCentavos }); },
      () => { if (active) setResult({ userId, monthlyCentavos: null }); },
    );
    return () => { active = false; };
  }, [userId]);

  const monthly = result?.userId === userId ? result.monthlyCentavos : undefined;
  const target = monthly == null ? 0 : monthly * 6;
  const available = Number.isSafeInteger(target) && target > 0;

  return <View style={{ backgroundColor: "#F8EFDC", borderRadius: 10, gap: 6, padding: 11 }} accessibilityLiveRegion="polite">
    <Text style={{ color: "#1B1C1A", fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>
      {monthly === undefined ? "Calculating suggested emergency fund target…" : monthly === null ? "Unable to calculate a suggested target. You can enter your own amount." : available ? `Suggested target: ${formatPeso(target)}` : "No essential expenses recorded in the last six completed months. Enter your own target amount."}
    </Text>
    {available ? <>
      <Text style={{ color: "#6B7A6F", fontFamily: "Manrope", fontSize: 11, lineHeight: 16 }}>Average monthly essentials: {formatPeso(monthly ?? 0)} × 6 months. Based on posted essential expenses over the last six completed calendar months, including months with no spending.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Use suggested target amount" onPress={() => onApply(target)} style={{ alignSelf: "flex-start", paddingVertical: 8 }}>
        <Text style={{ color: "#013220", fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>Use suggested target amount</Text>
      </Pressable>
    </> : null}
  </View>;
}
