import { useEffect, useRef, useState, type ReactNode } from "react";
import { Text, TextInput, View } from "react-native";
import { allocationLabel, formatForecastPeso, formatPeso, toCentavos } from "../helpers/financialPlanPresentation";
import type { FinancialPlanAllocation } from "../types";
import { groupPlanAllocations } from "../helpers/groupPlanAllocations";
import { PlanAmountInput } from "./PlanAmountInput";
import { WithTermInfo } from "../../../components/TermInfo";

type Props = {
  allocations: FinancialPlanAllocation[];
  restrictions?: Record<string, unknown>;
  showSpendingProgress: boolean;
  readOnly: boolean;
  onFlexibleAmountChange: (index: number, amount: string) => void;
  onWeightChange: (index: number, weight: string) => void;
  // Shown beside the section heading, such as a recalculate action.
  headerAction?: ReactNode;
  onValidityChange?: (key: string, valid: boolean) => void;
};

const RULE_LABELS: Record<FinancialPlanAllocation["allocationRule"], string> = { FIXED: "Fixed", MINIMUM: "Minimum", FLEXIBLE: "Flexible" };

// Keeps what the user is typing while the field is focused, so the plan's two-decimal formatting
// does not rewrite the text mid-entry.
function AllocationAmountField({ label, amount, onChange, onValidityChange }: { label: string; amount: number; onChange: (value: string) => void; onValidityChange?: (valid: boolean) => void }) {
  const format = (centavos: number) => (centavos / 100).toFixed(2);
  const [draft, setDraft] = useState(format(amount));
  const focused = useRef(false);
  const validityCallback = useRef(onValidityChange);
  validityCallback.current = onValidityChange;
  useEffect(() => { validityCallback.current?.(toCentavos(draft) !== null); }, [draft]);
  useEffect(() => () => { validityCallback.current?.(true); }, []);
  useEffect(() => { if (!focused.current) setDraft(format(amount)); }, [amount]);
  return <PlanAmountInput value={draft} invalid={toCentavos(draft) === null} accessibilityLabel={label} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setDraft(format(amount)); }} onChangeText={(value) => { setDraft(value); onChange(value); }} />;
}

export function PlanAllocations({ allocations, restrictions, showSpendingProgress, readOnly, onFlexibleAmountChange, onWeightChange, headerAction, onValidityChange }: Props) {
  const groups = groupPlanAllocations(allocations, restrictions);
  if (groups.length === 0) return null;

  return (
    <View style={{ marginTop: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <WithTermInfo term="allocation" style={{ flex: 1 }}><Text accessibilityRole="header" style={{ flexShrink: 1, fontFamily: "Manrope", fontWeight: "800", fontSize: 16, color: "#1B1C1A" }}>Category Allocations</Text></WithTermInfo>
        {headerAction}
      </View>
      {!readOnly ? <Text style={{ fontFamily: "Manrope", fontSize: 12, lineHeight: 18, color: "#6B7A6F", marginTop: 2 }}>Fixed and minimum amounts are protected. Adjust flexible amounts before saving.</Text> : null}
      {groups.map((group) => (
        <View key={group.title} style={{ marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <Text accessibilityRole="header" style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: "#416153" }}>{group.title}</Text>
            <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 13, color: "#1B1C1A" }}>{formatPeso(group.allocations.reduce((total, { allocation }) => total + allocation.allocatedAmountCentavos, 0))}</Text>
          </View>
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: "#EAEAE6", backgroundColor: "#FFFFFF", overflow: "hidden" }}>
            {group.allocations.map(({ allocation, index }, position) => {
              const editable = allocation.allocationRule === "FLEXIBLE" && !readOnly;
              const label = allocationLabel(allocation);
              const spentAmountCentavos = allocation.spentAmountCentavos ?? 0;
              // Overspending shows as a negative remaining amount with a full red bar, not as zero.
              const remainingAmountCentavos = allocation.allocatedAmountCentavos - spentAmountCentavos;
              const overspent = remainingAmountCentavos < 0;
              const remainingPercent = overspent ? 100 : allocation.allocatedAmountCentavos > 0 ? Math.min(100, (remainingAmountCentavos / allocation.allocatedAmountCentavos) * 100) : 0;
              return (
                <View key={`${allocation.categoryId ?? allocation.subcategoryId}-${index}`} style={{ borderTopWidth: position === 0 ? 0 : 1, borderTopColor: "#EFEEE8", paddingHorizontal: 14, paddingVertical: 12 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13, color: "#1B1C1A" }}>{label}</Text>
                      {!readOnly ? <Text style={{ fontFamily: "Manrope", fontSize: 11, color: "#6B7A6F", marginTop: 2 }}>{RULE_LABELS[allocation.allocationRule]}{allocation.forecastAmountCentavos != null ? ` · forecast ${formatForecastPeso(allocation.forecastAmountCentavos)}` : ""}</Text> : null}
                    </View>
                    {editable ? <AllocationAmountField label={`${label} flexible amount in pesos`} amount={allocation.allocatedAmountCentavos} onValidityChange={(valid) => onValidityChange?.(`allocation-${index}`, valid)} onChange={(amount) => onFlexibleAmountChange(index, amount)} /> : <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 13, color: "#1B1C1A" }}>{formatPeso(allocation.allocatedAmountCentavos)}</Text>}
                  </View>
                  {showSpendingProgress ? <><View style={{ height: 6, backgroundColor: "#E6E8E3", borderRadius: 999, marginTop: 10, overflow: "hidden" }}><View style={{ width: `${remainingPercent}%`, height: "100%", backgroundColor: overspent ? "#D9001F" : "#0E6D46", borderRadius: 999 }} /></View><Text accessibilityLabel={overspent ? `${label} is ${formatPeso(-remainingAmountCentavos)} over budget` : undefined} style={{ fontFamily: "Manrope", fontSize: 10.5, color: overspent ? "#D9001F" : "#6B7A6F", fontWeight: overspent ? "700" : "400", marginTop: 5 }}>{formatPeso(remainingAmountCentavos)} remaining of {formatPeso(allocation.allocatedAmountCentavos)}{overspent ? " · over budget" : ""}</Text></> : null}
                  {allocation.subcategoryWeightBps != null ? <View style={{ flexDirection: "row", alignItems: "center", marginTop: 9, gap: 8 }}><Text style={{ flex: 1, fontFamily: "Manrope", fontSize: 11, color: "#6B7A6F" }}>Subcategory split weight</Text><TextInput value={(allocation.subcategoryWeightBps / 100).toFixed(2)} onChangeText={(weight) => onWeightChange(index, weight)} accessibilityLabel={`${label} subcategory weight percent`} keyboardType="decimal-pad" style={{ width: 70, height: 34, borderWidth: 1, borderColor: "#D6D8D4", borderRadius: 8, paddingHorizontal: 8, fontFamily: "Manrope", fontSize: 12, color: "#1B1C1A", textAlign: "right", backgroundColor: "#FFFFFF" }} /><Text style={{ fontFamily: "Manrope", fontSize: 11, color: "#6B7A6F" }}>%</Text></View> : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
