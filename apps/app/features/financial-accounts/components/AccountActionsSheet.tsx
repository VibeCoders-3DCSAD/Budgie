import React from "react";
import { Pressable, Text, View } from "react-native";
import type { FinancialAccount } from "../../../local-db/repositories/foundations/financialFoundations";
import { ActionSheet } from "../../../components/ActionSheet";
import { BottomSheetSurface } from "../../../components/BottomSheetSurface";
import { P } from "../helpers/accountsTheme";
import { TourTarget } from "../../onboarding-tour/components/TourTarget";

type Props = { account: FinancialAccount | null; onClose: () => void; onEdit: () => void; onDelete: () => void };

export function AccountActionsSheet({ account, onClose, onEdit, onDelete }: Props) {
  return (
    <ActionSheet visible={account !== null} onClose={onClose} backdropColor="rgba(27,28,26,0.28)">
        <BottomSheetSurface bottomSpacing={20} style={{ padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: P.white }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 18, backgroundColor: P.line }} />
          <Text numberOfLines={1} style={{ marginBottom: 16, fontFamily: "Manrope", fontSize: 17, fontWeight: "800", color: P.ink }}>{account?.name}</Text>
          <TourTarget id="money-accounts-menu" fill>
          <View>
          <AccountAction label="Edit" onPress={onEdit} />
          <AccountAction label="Delete" destructive onPress={onDelete} />
          <AccountAction label="Cancel" onPress={onClose} />
          </View>
          </TourTarget>
        </BottomSheetSurface>
    </ActionSheet>
  );
}

function AccountAction({ label, destructive = false, onPress }: { label: string; destructive?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 50, alignItems: "center", justifyContent: "center", marginBottom: 9, borderRadius: 13, borderWidth: 1, borderColor: destructive ? "#FFB9C2" : P.line, backgroundColor: destructive ? P.errorSoft : P.card }}>
      <Text style={{ fontFamily: "Manrope", fontSize: 14, fontWeight: "800", color: destructive ? P.error : P.ink }}>{label}</Text>
    </Pressable>
  );
}
