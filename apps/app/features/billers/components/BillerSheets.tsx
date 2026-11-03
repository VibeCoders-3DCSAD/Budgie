import { Pressable, Text, View } from "react-native";
import { Bank, Check, CreditCard, Money, Wallet } from "phosphor-react-native";
import { BottomSheet, styles as ui, tileTints, v4, v4Font } from "../../../components/BudgieForm";
import type { AccountOption, FinancialAccount } from "../../../local-db/repositories/foundations/financialFoundations";
import { formatPeso } from "../presentation";

function AccountIcon({ kind, color }: { kind: FinancialAccount["kind"]; color: string }) {
  const Icon = kind === "credit_card" ? CreditCard : kind === "cash" ? Money : kind === "e_wallet" ? Wallet : Bank;
  return <Icon color={color} size={16} weight="bold" />;
}

export function AccountPickerSheet({ visible, accounts, selectedId, onSelect, onClose }: { visible: boolean; accounts: AccountOption[]; selectedId: string | null; onSelect: (accountId: string) => void; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Pay from">
      {accounts.length === 0 ? (
        <Text style={{ fontFamily: v4Font, fontSize: 13, color: v4.mut, textAlign: "center", paddingVertical: 20 }}>
          No eligible category, obligation, or source account is available. Add one and try again.
        </Text>
      ) : (
        <View style={ui.list}>
          {accounts.map((account, index) => {
            const selected = account.id === selectedId;
            const tint = tileTints[account.kind === "credit_card" ? 2 : 1];
            return (
              <Pressable key={account.id} onPress={() => { onSelect(account.id); onClose(); }} accessibilityRole="button" accessibilityLabel={account.name} accessibilityState={{ selected }} style={[ui.listRow, index > 0 ? ui.listRowDivider : null, selected ? ui.listRowSelected : null]}>
                <View style={ui.listRowMain}>
                  <View style={[ui.listTile, { backgroundColor: tint.bg }]}><AccountIcon kind={account.kind} color={tint.fg} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={ui.listTitle}>{account.name}</Text>
                    <Text numberOfLines={1} style={ui.listSubtitle}>{formatPeso(account.currentBalanceCentavos)}</Text>
                  </View>
                  {selected ? <Check color={v4.brandMid} size={16} weight="bold" /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </BottomSheet>
  );
}
