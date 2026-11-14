import React, { useState } from "react";
import { View } from "react-native";
import type { FinancialAccount, CreateFinancialAccountInput } from "../../local-db/repositories/foundations/financialFoundations";
import type { SavingsAccountDetailsInput } from "../../local-db/repositories/savings/savingsAccountDetails";
import { AmountHero } from "../../components/BudgieForm";
import SavingsGoalForm from "../savings-goals/components/SavingsGoalForm";
import { AccountActionsSheet } from "./components/AccountActionsSheet";
import { AccountFormSheet } from "./components/AccountFormSheet";
import { AccountsEmptyState } from "./components/AccountsEmptyState";
import { AccountsList } from "./components/AccountsList";
import SavingsGoalInvitation from "./components/SavingsGoalInvitation";
import { totalCashPosition } from "./helpers/accountDisplay";
import { useFinancialAccounts } from "./hooks/useFinancialAccounts";
import { TourTarget } from "../onboarding-tour/components/TourTarget";
import { useCloseWithTour } from "../onboarding-tour/hooks/useCloseWithTour";

type Props = {
  userId: string;
  deviceId: string;
  onBack: () => void;
  onSyncRequested?: () => void;
};

export default function FinancialAccountsScreen({ userId, deviceId, onBack, onSyncRequested }: Props) {
  const { accounts, loading, loadAccounts, saveNewAccount, saveAccountChanges, confirmDeleteAccount } = useFinancialAccounts({ userId, deviceId, onSyncRequested });
  const [sheetVisible, setSheetVisible] = useState(false);
  const [newSavingsAccountId, setNewSavingsAccountId] = useState<string | null>(null);
  const [goalAccountId, setGoalAccountId] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [accountActionsTarget, setAccountActionsTarget] = useState<FinancialAccount | null>(null);

  const totalCash = totalCashPosition(accounts);
  useCloseWithTour("money-accounts-menu", accountActionsTarget !== null, () => setAccountActionsTarget(null));

  const handleCreate = async (input: CreateFinancialAccountInput, savingsDetails: SavingsAccountDetailsInput | null) => {
    const account = await saveNewAccount(input, savingsDetails);
    setSheetVisible(false); await loadAccounts();
    onSyncRequested?.();
    if (input.kind === "savings") setNewSavingsAccountId(account.id);
  };

  const handleUpdate = async (input: CreateFinancialAccountInput, savingsDetails: SavingsAccountDetailsInput | null) => {
    if (!editingAccount) return;
    await saveAccountChanges(editingAccount, input, savingsDetails);
    setSheetVisible(false); setEditingAccount(null);
    await loadAccounts();
    onSyncRequested?.();
  };

  const openCreateSheet = () => { setEditingAccount(null); setSheetVisible(true); };

  if (goalAccountId) return <SavingsGoalForm userId={userId} deviceId={deviceId} initialLinkedAccountId={goalAccountId} onCancel={() => setGoalAccountId(null)} onSaved={() => { setGoalAccountId(null); onSyncRequested?.(); }} />;

  return (
    <>
      <TourTarget id="money-accounts-total" fill>
      <View style={{ marginBottom: 14 }}>
        <AmountHero
          label="TOTAL CASH POSITION"
          amountCentavos={totalCash}
          detail={`Across ${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`}
        />
      </View>
      </TourTarget>
      {loading ? null : accounts.length === 0 ? (
        <AccountsEmptyState onAdd={openCreateSheet} />
      ) : (
        <TourTarget id="money-accounts-list" fill><AccountsList accounts={accounts} onAdd={openCreateSheet} onSelect={setAccountActionsTarget} /></TourTarget>
      )}
      <AccountActionsSheet
        account={accountActionsTarget}
        onClose={() => setAccountActionsTarget(null)}
        onEdit={() => {
          if (!accountActionsTarget) return;
          setEditingAccount(accountActionsTarget);
          setAccountActionsTarget(null);
          setSheetVisible(true);
        }}
        onDelete={() => {
          if (!accountActionsTarget) return;
          const account = accountActionsTarget;
          setAccountActionsTarget(null);
          confirmDeleteAccount(account);
        }}
      />
      {newSavingsAccountId ? <SavingsGoalInvitation onAddGoal={() => { setGoalAccountId(newSavingsAccountId); setNewSavingsAccountId(null); }} onDismiss={() => setNewSavingsAccountId(null)} /> : null}
      <AccountFormSheet userId={userId} visible={sheetVisible} editing={editingAccount} onClose={() => { setSheetVisible(false); setEditingAccount(null); }} onSubmit={editingAccount ? handleUpdate : handleCreate} />
    </>
  );
}
