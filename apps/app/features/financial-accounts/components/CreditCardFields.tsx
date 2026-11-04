import React from "react";
import { Text, View } from "react-native";
import { Switch } from "../../../components/BudgieForm";
import type { FieldErrors } from "../helpers/accountFormValidation";
import { P } from "../helpers/accountsTheme";
import { AccountTextInput } from "./AccountTextInput";
import { FormField } from "./FormField";

type Props = {
  creditLimit: string;
  cutoffDay: string;
  threshold: string;
  allowsExtraPayments: boolean;
  fieldErrors: FieldErrors;
  onCreditLimitChange: (value: string) => void;
  onCutoffDayChange: (value: string) => void;
  onThresholdChange: (value: string) => void;
  onToggleExtraPayments: () => void;
};

export function CreditCardFields({ creditLimit, cutoffDay, threshold, allowsExtraPayments, fieldErrors, onCreditLimitChange, onCutoffDayChange, onThresholdChange, onToggleExtraPayments }: Props) {
  return (
    <>
      <FormField label="CREDIT LIMIT (₱)" term="credit-limit" required error={fieldErrors.creditLimit}>
        <AccountTextInput value={creditLimit} onChangeText={onCreditLimitChange} placeholder="Enter credit limit" keyboardType="decimal-pad" invalid={Boolean(fieldErrors.creditLimit)} />
      </FormField>

      <FormField
        label="BILLING CYCLE END DAY"
        term="cut-off"
        hint="Your bank may call this the cut-off date. Enter the day your billing cycle ends each month (1-31)."
        required
        error={fieldErrors.cutoffDay}
      >
        <AccountTextInput value={cutoffDay} onChangeText={onCutoffDayChange} placeholder="Enter billing cycle end day" keyboardType="number-pad" invalid={Boolean(fieldErrors.cutoffDay)} />
      </FormField>

      <FormField label="ALERT THRESHOLD (%)" required error={fieldErrors.threshold}>
        <AccountTextInput value={threshold} onChangeText={onThresholdChange} placeholder="Enter alert percentage" keyboardType="number-pad" invalid={Boolean(fieldErrors.threshold)} />
      </FormField>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: "Manrope", fontWeight: "600", fontSize: 12, color: P.ink2 }}>ALLOW EXTRA PAYMENTS</Text>
          <Text style={{ fontFamily: "Manrope", fontSize: 11.5, color: P.muted }}>Put spare money toward this card when you have it.</Text>
        </View>
        <Switch accessibilityLabel="Allow extra payments" value={allowsExtraPayments} onToggle={onToggleExtraPayments} />
      </View>
    </>
  );
}
