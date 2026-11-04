import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { v4, v4Font } from "../../../components/BudgieForm";
import { WithTermInfo } from "../../../components/TermInfo";
import type { GlossaryTermId } from "../../glossary/terms";

export const interestText = { fontFamily: v4Font, fontSize: 12, color: v4.ink2 };
export const interestInput = { fontFamily: v4Font, color: v4.ink, minHeight: 46, borderWidth: 1, borderColor: v4.hairline, borderRadius: 10, padding: 10 };
export function InterestChoices<T extends string>({ label, value, options, onChange, term }: { label: string; value: T | null; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; term?: GlossaryTermId }) {
  return <View style={{ gap: 8 }}>
    <WithTermInfo term={term}><Text style={interestText}>{label}</Text></WithTermInfo>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`${label}: ${option.label}`} accessibilityState={{ checked: value === option.value }} onPress={() => onChange(option.value)} style={{ padding: 10, borderRadius: 10, borderWidth: 1, borderColor: v4.hairline, backgroundColor: value === option.value ? v4.brand : v4.surface }}>
        <Text style={{ ...interestText, color: value === option.value ? v4.surface : v4.ink }}>{option.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}
export function InterestToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={{ paddingVertical: 10 }}>
    <Text style={{ ...interestText, color: v4.brand, fontWeight: "700" }}>{label}: {value ? "On" : "Off"}</Text>
  </Pressable>;
}
export function InterestDateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <View style={{ gap: 6 }}><Text style={interestText}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" maxLength={10} style={interestInput} /></View>;
}
export function InterestNumberInput({ label, value, onChange, scale = 1 }: { label: string; value: number | null; onChange: (value: number | null) => void; scale?: number }) {
  const [draft, setDraft] = useState(value === null ? "" : String(value / scale));
  return <View style={{ gap: 6 }}><Text style={interestText}>{label}</Text>
    <TextInput accessibilityLabel={label} value={draft} keyboardType={scale === 1 ? "number-pad" : "decimal-pad"} placeholder="Enter value" onChangeText={(raw) => {
      setDraft(raw);
      const valid = scale === 1 ? /^\d+$/.test(raw) : /^\d+(\.\d{1,2})?$/.test(raw);
      onChange(raw.trim() === "" ? null : valid ? Math.round(Number(raw) * scale) : NaN);
    }} style={interestInput} />
  </View>;
}
