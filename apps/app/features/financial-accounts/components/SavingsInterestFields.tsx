import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { SavingsInterestConfiguration, SavingsInterestReference } from "@odin/savings-interest";
import { v4 } from "../../../components/BudgieForm";
import { InterestChoices, interestInput, interestText } from "./InterestFormControls";
import { editableInterestReference } from "../helpers/savingsInterestConfiguration";
import SavingsInterestScheduleFields from "./SavingsInterestScheduleFields";
import SavingsInterestRulesFields from "./SavingsInterestRulesFields";
import SavingsInterestRateHistoryFields from "./SavingsInterestRateHistoryFields";

type Props = {
  rate: string; onRateChange: (rate: string) => void;
  reference: SavingsInterestReference | null; onReferenceChange: (reference: SavingsInterestReference) => void;
  persistedReference?: SavingsInterestReference | null;
};
export default function SavingsInterestFields({ rate, onRateChange, reference, onReferenceChange, persistedReference }: Props) {
  const [expanded, setExpanded] = useState(false);
  const details = editableInterestReference(reference);
  const configuration = details.configuration;
  const none = details.method === "none";
  const update = (changes: Partial<SavingsInterestConfiguration>) => onReferenceChange({ ...details, configuration: { ...configuration, ...changes } });
  return <View style={{ gap: 12 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Advanced interest options" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={{ paddingVertical: 10 }}>
      <Text style={{ ...interestText, color: v4.brand, fontWeight: "700" }}>{expanded ? "Hide advanced options" : "Advanced options"}</Text>
    </Pressable>
    {expanded ? <View style={{ gap: 18 }}>
      <InterestChoices label="Interest behavior" term="compound-interest" value={details.method} options={[{ value: "simple", label: "Simple Interest" }, { value: "compound", label: "Compound Interest" }, { value: "none", label: "None" }]} onChange={(method) => {
        if (method === "none") onRateChange("0");
        onReferenceChange({ ...details, method, configuration: { ...configuration, autoProject: false } });
      }} />
      {none ? <Text style={interestText}>This account earns 0% interest. Other interest settings are disabled. Historical interest transactions are preserved.</Text> : <>
        <View style={{ gap: 6 }}>
          <Text style={{ ...interestText, fontWeight: "600" }}>INTEREST RATE</Text>
          <TextInput accessibilityLabel="Interest rate" value={rate} onChangeText={(value) => { onRateChange(value); onReferenceChange(details); }} editable={!persistedReference?.configuration} placeholder="Enter interest rate" keyboardType="decimal-pad" style={interestInput} />
          <Text style={interestText}>Fixed nominal annual rate (% p.a.). {persistedReference?.configuration ? "Add effective-dated changes below to preserve earlier rates." : "Use the annual interest rate, not APY."}</Text>
        </View>
        <InterestChoices label="Calculation basis" value={details.balanceBasis} options={[{ value: "daily_balance", label: "Daily Balance" }, { value: "average_daily_balance", label: "Average Daily Balance (ADB)" }]} onChange={(balanceBasis) => onReferenceChange({ ...details, balanceBasis })} />
        <SavingsInterestScheduleFields configuration={configuration} isAdb={details.balanceBasis === "average_daily_balance"} onChange={update} />
        <SavingsInterestRulesFields configuration={configuration} onChange={update} />
        <SavingsInterestRateHistoryFields configuration={configuration} onChange={update} savedCount={persistedReference?.configuration?.rateHistory.length ?? 0} />
        <View style={{ gap: 6 }}>
          <Text style={interestText}>Interest notes (optional)</Text>
          <TextInput accessibilityLabel="Interest notes" value={details.notes ?? ""} onChangeText={(notes) => onReferenceChange({ ...details, notes })} maxLength={1000} multiline placeholder="Account interest notes" style={[interestInput, { minHeight: 80 }]} />
        </View>
      </>}
    </View> : null}
  </View>;
}
