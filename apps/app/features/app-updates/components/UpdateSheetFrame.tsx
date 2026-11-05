import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ActionSheet } from "../../../components/ActionSheet";
import { BottomSheetSurface } from "../../../components/BottomSheetSurface";
import { P } from "../../financial-accounts/helpers/accountsTheme";

type Action = { label: string; onPress: () => void; primary?: boolean };
type Props = { visible: boolean; title: string; subtitle: string; onClose: () => void; actions: Action[]; children?: ReactNode };

export function UpdateSheetFrame({ visible, title, subtitle, onClose, actions, children }: Props) {
  return (
    <ActionSheet visible={visible} onClose={onClose} backdropColor="rgba(27,28,26,0.28)">
      <BottomSheetSurface bottomSpacing={20} style={{ padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: P.white }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 18, backgroundColor: P.line }} />
        <Text style={{ fontFamily: "Manrope", fontSize: 17, fontWeight: "800", color: P.ink }}>{title}</Text>
        <Text style={{ marginTop: 4, marginBottom: 16, fontFamily: "Manrope", fontSize: 13, color: P.muted }}>{subtitle}</Text>
        {children}
        {actions.map((action) => <SheetAction key={action.label} {...action} />)}
      </BottomSheetSurface>
    </ActionSheet>
  );
}

function SheetAction({ label, onPress, primary = false }: Action) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 50, alignItems: "center", justifyContent: "center", marginBottom: 9, borderRadius: 13, borderWidth: 1, borderColor: primary ? P.brand : P.line, backgroundColor: primary ? P.brand : P.card }}>
      <Text style={{ fontFamily: "Manrope", fontSize: 14, fontWeight: "800", color: primary ? P.white : P.ink }}>{label}</Text>
    </Pressable>
  );
}
