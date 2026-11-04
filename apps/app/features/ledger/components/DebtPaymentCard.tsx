import { Pressable, Text, View } from "react-native";
import { Check } from "phosphor-react-native";
import { FieldLabel, FormCard, Note, Switch, TextField, styles as ui, v4 } from "../../../components/BudgieForm";
import type { DebtPaymentFields } from "../hooks/useDebtPaymentFields";
import { formatCurrency } from "../helpers/transactionFormat";

type Props = { debt: DebtPaymentFields };

// Splits an expense into the principal and interest or fees it pays on one of the user's debts.
export default function DebtPaymentCard({ debt }: Props) {
  const { activeDebts, debtLocked } = debt;
  return (
    <FormCard
      title="This is a payment for my debt"
      right={<Switch value={debt.isDebtPayment} disabled={debtLocked} accessibilityLabel="This is a payment for my debt" onToggle={debt.toggleDebtPayment} />}
    >
      <Note>Choose this when this expense pays down one of your debts.</Note>
      {debt.isDebtPayment ? (
        <>
          <FieldLabel>Debt</FieldLabel>
          {activeDebts.length === 0 ? (
            <Note>No active debts are available. Add a debt before recording a debt payment.</Note>
          ) : (
            <View accessibilityRole="radiogroup" accessibilityLabel="Select the debt this payment applies to" style={[ui.list, { marginTop: -7 }]}>
              {activeDebts.map((item, index) => {
                const selected = debt.debtPaymentId === item.id;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${item.name}, ${formatCurrency(item.currentBalanceCentavos)}`}
                    accessibilityState={{ selected, disabled: debtLocked }}
                    disabled={debtLocked}
                    onPress={() => debt.setDebtPaymentId(item.id)}
                    style={[ui.listRow, index > 0 ? ui.listRowDivider : null, selected ? ui.listRowSelected : null]}
                  >
                    <View style={ui.listRowMain}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={[ui.listTitle, selected ? { fontWeight: "700" } : null]}>{item.name}</Text>
                        <Text numberOfLines={1} style={ui.listSubtitle}>Balance {formatCurrency(item.currentBalanceCentavos)}</Text>
                      </View>
                      {selected ? <Check color={v4.brandMid} size={16} weight="bold" /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
          <TextField label="Principal" term="principal" suffix="₱" accessibilityLabel="Principal amount" value={debt.debtPrincipal} onChangeText={debt.setDebtPrincipal} placeholder="Enter principal amount" keyboardType="decimal-pad" />
          <TextField label="Interest or fee" suffix="₱" accessibilityLabel="Interest or fee amount" value={debt.debtInterestOrFees} onChangeText={debt.setDebtInterestOrFees} placeholder="Enter interest or fee amount" keyboardType="decimal-pad" />
          <Note>Principal reduces the debt balance. Principal plus interest or fees cannot exceed the payment amount.</Note>
        </>
      ) : null}
    </FormCard>
  );
}
