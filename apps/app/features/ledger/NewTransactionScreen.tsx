import SavingsContributionGoalPicker from "./components/SavingsContributionGoalPicker";
import SavingsExpenseFundingSheet from "./components/SavingsExpenseFundingSheet";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { DEFAULT_TAXONOMY_COLOR, TaxonomyIcon } from "../taxonomy/taxonomyVisuals";
import { AmountHero, Banner, Chip, FieldError, FormCard, Note, PickerField, Switch, TextField, styles as ui, v4, v4Font } from "../../components/BudgieForm";
import TransactionTypeSelector from "./components/TransactionTypeSelector";
import { useTransactionData } from "./hooks/useTransactionData";
import type { Transaction } from "../../local-db/repositories/ledger/ledger";
import type { StatementPaymentContext } from "../../local-db/repositories/credit-cards/creditCardPayments";
import type { DebtPaymentContext } from "../../local-db/repositories/debts/debtPayments";
import type { UnusualSpendingInsight } from "../../local-db/repositories/alerts/unusualSpending";
import { useConnectivityStore } from "../../services/connectivity";
import AccountSelectionSheet from "../../components/AccountSelectionSheet";
import BalanceWarningModal from "./components/BalanceWarningModal";
import CreditCardPurchaseCard from "./components/CreditCardPurchaseCard";
import DebtPaymentCard from "./components/DebtPaymentCard";
import { TourScrollArea } from "../onboarding-tour/components/TourScrollArea";
import { TourTarget } from "../onboarding-tour/components/TourTarget";
import TransactionAccountFields from "./components/TransactionAccountFields";
import TransactionCategoryPicker from "./components/TransactionCategoryPicker";
import TransactionDateSheet from "./components/TransactionDateSheet";
import TransactionFormHeader from "./components/TransactionFormHeader";
import { useCategorySelection } from "./hooks/useCategorySelection";
import { useCreditCardPurchase } from "./hooks/useCreditCardPurchase";
import { useDebtPaymentFields } from "./hooks/useDebtPaymentFields";
import { useStatementPayment } from "./hooks/useStatementPayment";
import { useTransactionFormFields } from "./hooks/useTransactionFormFields";
import { useTransactionSave } from "./hooks/useTransactionSave";
import { formatAccountAmount, formatCurrency, formatDate, fromDateKey, toDateKey } from "./helpers/transactionFormat";

const QUICK_AMOUNTS = [100, 250, 500, 1000];

type Props = {
  userId: string;
  deviceId: string;
  accessToken: string;
  onClose: () => void;
  onCreated?: (unusualSpending: UnusualSpendingInsight | null) => void;
  transaction?: Transaction;
  statementPaymentContext?: StatementPaymentContext;
  debtPaymentDebtId?: string;
  debtPaymentContext?: DebtPaymentContext;
  savingsActivityContext?: { savingsGoalId: string; kind: "contribution" | "withdrawal"; amountCentavos?: number };
};

export default function NewTransactionScreen({ userId, deviceId, accessToken, onClose, onCreated, transaction, statementPaymentContext, debtPaymentDebtId, debtPaymentContext, savingsActivityContext }: Props) {
  const online = useConnectivityStore((s) => s.online);
  const isEdit = !!transaction;
  const fields = useTransactionFormFields({ transaction, statementPaymentContext, savingsActivityContext });
  const { txType, amount, contributionGoalId, formError } = fields;
  const { accounts, categories, subcategories, loading, error: dataError } = useTransactionData(userId, txType);
  const category = useCategorySelection({ txType, transaction, categories, subcategories });
  const debt = useDebtPaymentFields({ userId, debtPaymentDebtId, debtPaymentContext, setDescription: fields.setDescription });
  const statement = useStatementPayment(userId, statementPaymentContext, fields.setFormError);
  const { isStatementPayment, statementPayment } = statement;
  const card = useCreditCardPurchase({ userId, transaction, txType, accounts, sourceAccountId: fields.sourceAccountId, amount });
  const save = useTransactionSave({
    userId, deviceId, accessToken, onClose, onCreated, transaction, statementPaymentContext, debtPaymentContext, savingsActivityContext,
    accounts, fields, effectiveSubcategoryId: category.effectiveSubcategoryId, resetCategory: category.reset, debt, statement, card,
  });
  const { saving, handleSave } = save;
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPostingDatePicker, setShowPostingDatePicker] = useState(false);
  const [accountPickerMode, setAccountPickerMode] = useState<"source" | "dest" | null>(null);

  if (loading) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 60, gap: 10 }}>
        <ActivityIndicator color={v4.brand} />
        <Text style={{ fontFamily: v4Font, fontSize: 13, color: v4.mut }}>
          Loading...
        </Text>
      </View>
    );
  }

  if (dataError) {
    return (
      <View style={{ paddingHorizontal: 18, paddingVertical: 24, gap: 14 }}>
        <Banner tone="error">{dataError}</Banner>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Go back" style={[ui.button, ui.buttonGhost]}>
          <Text style={[ui.buttonText, ui.buttonGhostText]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const descriptionLabel = txType === "income" ? "Payer" : "Description";
  const descriptionPlaceholder = txType === "income" ? "Who paid you?" : txType === "transfer" ? "What's this for?" : "Jollibee - Lunch";
  const needsCategory = txType !== "transfer";
  const pickingSource = accountPickerMode === "source";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: v4.shell }}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        <TransactionFormHeader
          title={isEdit ? "Edit Transaction" : "New Transaction"}
          categoryPickerOpen={category.showCategoryPicker}
          online={online}
          onBack={category.showCategoryPicker ? () => category.setShowCategoryPicker(false) : onClose}
        />

        {category.showCategoryPicker ? (
          <TransactionCategoryPicker
            txType={txType}
            categories={categories}
            subcategories={subcategories}
            selection={category.categorySelection}
            selectionLabel={category.fieldLabel}
            selectedVisual={category.selectedVisual}
            hasSelection={Boolean(category.selectedCategory || category.selectedSubcategory)}
            onSelect={category.selectCategory}
          />
        ) : (
          <TourScrollArea contentContainerStyle={{ paddingBottom: 28, gap: 14 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {savingsActivityContext ? (
              <FormCard title={savingsActivityContext.kind === "contribution" ? "Savings contribution" : "Savings withdrawal"}>
                <Note>{contributionGoalId ? "Use available money in the linked account, or transfer money from another account." : "This transfer is linked to the selected savings goal."}</Note>
              </FormCard>
            ) : null}
            {isStatementPayment ? (
              <FormCard title="Credit-card statement payment">
                <Note>{statementPayment ? `Statement due ${statementPayment.due_date} · Balance ${formatCurrency(statementPayment.statement_balance_centavos)}` : "Checking the selected statement..."}</Note>
              </FormCard>
            ) : null}

            <TourTarget id="form-amount" fill>
            <AmountHero>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 }}>
                <Text style={{ fontFamily: v4Font, fontWeight: "800", fontSize: 30, letterSpacing: -0.6, color: "#FFFFFF" }}>₱</Text>
                <TextInput
                  accessibilityLabel="Payment amount"
                  value={amount}
                  onChangeText={fields.setAmount}
                  placeholder="0.00"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  keyboardType="decimal-pad"
                  selectionColor="#41EDA4"
                  style={{ flex: 1, fontFamily: v4Font, fontWeight: "800", fontSize: 30, letterSpacing: -0.6, color: "#FFFFFF", paddingVertical: 0, fontVariant: ["tabular-nums"] }}
                />
              </View>
            </AmountHero>
            </TourTarget>

            <TourTarget id="form-details" fill>
            <FormCard>
              {!isEdit && !isStatementPayment && !savingsActivityContext ? <TransactionTypeSelector value={txType} onChange={fields.changeType} /> : null}

              <View style={ui.chips}>
                {QUICK_AMOUNTS.map((quickAmount) => (
                  <Chip
                    key={quickAmount}
                    label={quickAmount.toLocaleString()}
                    selected={amount === String(quickAmount)}
                    onPress={() => fields.setAmount(String(quickAmount))}
                    accessibilityLabel={`Set amount to ${quickAmount.toLocaleString()}`}
                  />
                ))}
              </View>

              <TextField
                label={descriptionLabel}
                value={fields.description}
                onChangeText={fields.setDescription}
                placeholder={descriptionPlaceholder}
                accessibilityLabel={descriptionLabel}
              />

              <PickerField label="Date" value={formatDate(fields.date)} onPress={() => setShowDatePicker(true)} />

              <TransactionAccountFields userId={userId} transactionId={transaction?.id} accounts={accounts} fields={fields} onPickAccount={setAccountPickerMode} />
            </FormCard>
            </TourTarget>

            {card.isCreditCardExpense && !isStatementPayment ? (
              <CreditCardPurchaseCard card={card} isEdit={isEdit} onPickPostingDate={() => setShowPostingDatePicker(true)} />
            ) : null}

            {!isEdit && !isStatementPayment && !savingsActivityContext && !debtPaymentDebtId && !debtPaymentContext ? (
              <TourTarget id="form-savings" fill>
              <FormCard title="This is a savings contribution" right={<Switch value={fields.isSavingsContribution} accessibilityLabel="This is a savings contribution" onToggle={() => {
                fields.toggleSavingsContribution();
                debt.setIsDebtPayment(false);
              }} />}>
                <Note>Use available money in the linked account, or transfer money from another account.</Note>
                {fields.isSavingsContribution ? <SavingsContributionGoalPicker userId={userId} goalId={fields.selectedSavingsGoalId} onChange={fields.selectSavingsGoal} /> : null}
              </FormCard>
              </TourTarget>
            ) : null}

            {txType === "expense" && !isStatementPayment && !card.isCreditCardExpense ? <TourTarget id="form-debt" fill><DebtPaymentCard debt={debt} /></TourTarget> : null}

            <TourTarget id="form-category" fill>
            <FormCard>
              {needsCategory ? (
                <View>
                  <PickerField
                    label="Category"
                    icon={
                      <View style={[ui.listTile, { backgroundColor: category.selectedVisual?.color_hex ?? DEFAULT_TAXONOMY_COLOR }]}>
                        <TaxonomyIcon iconKey={category.selectedVisual?.icon_key} color="#fff" size={16} weight="fill" />
                      </View>
                    }
                    value={category.fieldLabel}
                    placeholder={!category.categorySelection.tier}
                    error={formError === "Select a category"}
                    accessibilityLabel={`Category: ${category.fieldLabel}. Open full list`}
                    onPress={() => category.setShowCategoryPicker(true)}
                  />
                  {formError === "Select a category" ? <FieldError>Select a category</FieldError> : null}
                </View>
              ) : null}
              <TextField
                label="Notes"
                value={fields.notes}
                onChangeText={fields.setNotes}
                placeholder="Optional notes"
                accessibilityLabel="Notes"
                multiline
                numberOfLines={3}
              />
            </FormCard>
            </TourTarget>


            {formError ? <Banner tone="error">{formError}</Banner> : null}

            <TourTarget id="form-save" fill>
            <Pressable
              onPress={() => handleSave()}
              disabled={saving}
              style={[ui.button, { opacity: saving ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={isEdit ? "Save changes" : "Save transaction"}
              accessibilityState={{ disabled: saving, busy: saving }}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={ui.buttonText}>{isEdit ? "Save Changes" : "Save"}</Text>}
            </Pressable>
            </TourTarget>
          </TourScrollArea>
        )}

        <TransactionDateSheet visible={showDatePicker} title="Select date" value={fields.date} onClose={() => setShowDatePicker(false)} onSelect={fields.setDate} />
        <TransactionDateSheet
          visible={showPostingDatePicker}
          title="Posting date"
          value={card.postingDate ? fromDateKey(card.postingDate) : fields.date}
          onClose={() => setShowPostingDatePicker(false)}
          onSelect={(nextDate) => card.setPostingDate(toDateKey(nextDate))}
        />
        <AccountSelectionSheet
          visible={accountPickerMode !== null}
          title={pickingSource ? "From account" : "To account"}
          accounts={accounts.filter((a) => !isStatementPayment || a.kind !== "credit_card").map((account) => ({ id: account.id, name: account.name, kind: account.kind, amountLabel: formatAccountAmount(account) }))}
          selectedId={pickingSource ? fields.sourceAccountId : fields.destAccountId}
          onSelect={(id) => { if (pickingSource) fields.setSourceAccountId(id); else fields.setDestAccountId(id); }}
          onClose={() => setAccountPickerMode(null)}
        />
        <SavingsExpenseFundingSheet funding={save.savingsFunding} onCancel={() => save.setSavingsFunding(null)} onConfirm={(withdrawals) => { save.setSavingsFunding(null); void handleSave(true, withdrawals); }} />
        <BalanceWarningModal
          warning={save.balanceWarning}
          onCancel={() => save.setBalanceWarning(null)}
          onConfirm={() => {
            save.setBalanceWarning(null);
            handleSave(true);
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
