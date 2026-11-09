import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ArrowsLeftRight, Funnel } from "phosphor-react-native";
import { dashboardColors as P } from "../../../dashboard/dashboardAppearance";
import { sectionLabel } from "../constants";
import type { TransactionDateGroup } from "../helpers/historyFormat";
import { TransactionRow } from "./TransactionRow";
import { TourTarget } from "../../../onboarding-tour/components/TourTarget";

type Props = {
  loading: boolean;
  stale: boolean;
  empty: boolean;
  // Any filter or submitted search narrows the list, which changes the empty state.
  filtered: boolean;
  grouped: TransactionDateGroup[];
  onEdit: (transactionId: string) => void;
  onDelete: (transactionId: string) => void;
  onNewTransaction: () => void;
};

export function TransactionListBody({ loading, stale, empty, filtered, grouped, onEdit, onDelete, onNewTransaction }: Props) {
  if (loading) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 40 }}>
        <ActivityIndicator color={P.secondary} size="small" />
        <Text style={{ fontFamily: "Manrope", fontSize: 12, color: P.secondary }}>Loading...</Text>
      </View>
    );
  }
  if (empty) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 26, paddingHorizontal: 18 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 1.5, borderStyle: "dashed", borderColor: P.secondary, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          {filtered ? <Funnel size={34} color={P.secondary} /> : <ArrowsLeftRight size={34} color={P.secondary} />}
        </View>
        <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 15, color: P.ink, marginBottom: 4 }}>
          {filtered ? "No transactions match" : "No transactions yet"}
        </Text>
        <Text style={{ fontFamily: "Manrope", fontSize: 12, lineHeight: 18, color: P.secondary, textAlign: "center", maxWidth: 230 }}>
          {filtered ? "Clear the filters to see all your transactions." : "Record your first transaction to see it here."}
        </Text>
        {filtered ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={onNewTransaction}
            style={{ alignSelf: "stretch", minHeight: 50, borderRadius: 12, backgroundColor: P.brand, alignItems: "center", justifyContent: "center", marginTop: 14 }}
          >
            <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 14, color: "#fff" }}>
              Add your first
            </Text>
          </Pressable>
        )}
      </View>
    );
  }
  return (
    <View style={{ opacity: stale ? 0.5 : 1, gap: 11 }}>
      {stale ? <ActivityIndicator color={P.brand} /> : null}
      {grouped.map((group, groupIndex) => {
        const day = (
          <View key={`${group.date}-${group.items[0]!.id}`} style={{ gap: 8 }}>
            <Text style={sectionLabel}>
              {group.date.toUpperCase()}
            </Text>
            <View style={{ backgroundColor: P.surface, borderWidth: 1, borderColor: P.border, borderRadius: 16, overflow: "hidden" }}>
              {group.items.map((tx, index) => (
                <TransactionRow key={tx.id} tx={tx} last={index === group.items.length - 1} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </View>
          </View>
        );
        // Only the newest day is a tour target, so a long history registers one target, not one per day.
        return groupIndex === 0 ? <TourTarget key="first-day" id="activity-first-day" fill>{day}</TourTarget> : day;
      })}
    </View>
  );
}
