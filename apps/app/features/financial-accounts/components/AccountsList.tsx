import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { FinancialAccount } from "../../../local-db/repositories/foundations/financialFoundations";
import { isNegativeAccount } from "../helpers/accountDisplay";
import { P } from "../helpers/accountsTheme";
import { AccountTile } from "./AccountTile";
import { TourTarget } from "../../onboarding-tour/components/TourTarget";

type Props = { accounts: FinancialAccount[]; onAdd: () => void; onSelect: (account: FinancialAccount) => void };

export function AccountsList({ accounts, onAdd, onSelect }: Props) {
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontFamily: "Manrope", fontWeight: "800", color: P.ink }}>Accounts</Text>
        <TourTarget id="money-accounts-add">
        <TouchableOpacity
          onPress={onAdd}
          testID="add-account"
          accessibilityLabel="Add account"
          hitSlop={8}
          style={{ paddingVertical: 4, paddingLeft: 12 }}
        >
          <Text style={{ fontSize: 11.5, fontFamily: "Manrope", fontWeight: "700", color: P.brand }}>Add</Text>
        </TouchableOpacity>
        </TourTarget>
      </View>
      <View style={{ borderWidth: 1, borderColor: "#959592", borderRadius: 16, overflow: "hidden", backgroundColor: P.white }}>
        {accounts.map((account, index) => {
          const negative = isNegativeAccount(account);
          const tile = (
            <AccountTile
              key={account.id}
              account={account}
              negative={negative}
              amountColor={negative ? P.error : P.ink}
              isLast={index === accounts.length - 1}
              onPress={() => onSelect(account)}
            />
          );
          // The tour opens the first account's actions.
          return index === 0 ? <TourTarget key={account.id} id="money-accounts-first" fill>{tile}</TourTarget> : tile;
        })}
      </View>
    </>
  );
}
