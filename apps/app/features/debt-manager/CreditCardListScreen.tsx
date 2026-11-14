import React from "react";
import { View } from "react-native";
import { Note } from "../../components/BudgieForm";
import type { FinancialAccount } from "../../local-db/repositories/foundations/financialFoundations";
import type { CreditCardCycle } from "../../local-db/repositories/credit-cards/creditCardCycles";
import { CARD_TINT, CardIcon, List, ListRow, SectionHeader, formatPeso, formatShortDate } from "./components/debtUi";

type Props = {
  accounts: FinancialAccount[];
  cycles: CreditCardCycle[];
  onOpenCard: (accountId: string) => void;
};

export default function CreditCardListScreen({ accounts, cycles, onOpenCard }: Props) {
  return <View style={{ gap: 12 }}>
    <SectionHeader title="Credit Cards" />
    <Note>Select a card to view its cycles, statements, and payments.</Note>
    {accounts.length === 0 ? <Note>No credit cards are recorded yet.</Note> : <List>{accounts.map((account, index) => {
      const details = account.creditCardDetails;
      const cycle = cycles.filter((item) => item.account_id === account.id).sort((a, b) => b.cutoff_date.localeCompare(a.cutoff_date))[0];
      const debtCentavos = details && details.availableCreditCentavos != null ? Math.max(0, details.creditLimitCentavos - details.availableCreditCentavos) : null;
      return <ListRow
        key={account.id}
        divider={index > 0}
        icon={<CardIcon />}
        tint={CARD_TINT}
        title={account.name}
        subtitle={`${details?.issuer ?? account.institutionName ?? "Credit Card"} · ${cycle ? `Cut-off ${formatShortDate(cycle.cutoff_date)}` : "No billing cycle recorded"}`}
        value={formatPeso(debtCentavos)}
        caption={`${formatPeso(details?.availableCreditCentavos)} available`}
        onPress={() => onOpenCard(account.id)}
        accessibilityLabel={`Open ${account.name}`}
      />;
    })}</List>}
  </View>;
}
