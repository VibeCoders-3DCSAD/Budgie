import { memo } from "react";
import { Text, View } from "react-native";
import { ArrowDownLeft, ArrowsLeftRight, ArrowUpRight, CalendarCheck } from "phosphor-react-native";
import type { TransactionListItem } from "../../../../local-db/repositories/ledger/ledger";
import KebabTooltip from "../../../../components/KebabTooltip";
import { TourKebabMenu } from "../../../onboarding-tour/components/TourKebabMenu";
import { DEFAULT_TAXONOMY_COLOR, TaxonomyIcon } from "../../../taxonomy/taxonomyVisuals";
import { dashboardColors as P } from "../../../dashboard/dashboardAppearance";
import { AMOUNT_COLORS } from "../constants";
import { formatAmount } from "../helpers/historyFormat";

// Uncategorized rows get a tile by kind: scheduled payment, transfer, income or expense.
function FallbackTileIcon({ tx }: { tx: TransactionListItem }) {
  if (tx.is_scheduled_payment) return <CalendarCheck size={18} color="#fff" weight="bold" />;
  if (tx.transaction_type === "transfer") return <ArrowsLeftRight size={18} color="#fff" weight="bold" />;
  if (tx.transaction_type === "income") return <ArrowUpRight size={18} color="#fff" weight="bold" />;
  return <ArrowDownLeft size={18} color="#fff" weight="bold" />;
}

function fallbackTileColor(tx: TransactionListItem): string {
  if (tx.is_scheduled_payment) return P.warning;
  if (tx.transaction_type === "transfer") return P.secondary;
  if (tx.transaction_type === "income") return P.green;
  return P.error;
}

export const TransactionRow = memo(function TransactionRow({ tx, last, onEdit, onDelete, kebabTourId }: {
  tx: TransactionListItem;
  last: boolean;
  onEdit: (transactionId: string) => void;
  onDelete: (transactionId: string) => void;
  // Set on one row only: the guided tour opens that row's menu.
  kebabTourId?: string;
}) {
  const prefix = tx.transaction_type === "expense" ? "-" : tx.transaction_type === "income" ? "+" : "";
  return (
    <View style={{ paddingVertical: 12, paddingLeft: 14, paddingRight: 6, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: last ? 0 : 1, borderBottomColor: P.divider }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: tx.icon_key ? tx.color_hex ?? DEFAULT_TAXONOMY_COLOR : fallbackTileColor(tx), alignItems: "center", justifyContent: "center" }}>
        {tx.icon_key ? <TaxonomyIcon iconKey={tx.icon_key} size={18} color="#fff" weight="fill" /> : <FallbackTileIcon tx={tx} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: "Manrope", fontWeight: "600", fontSize: 13, color: P.ink }} numberOfLines={1}>
          {tx.name}
        </Text>
        <Text style={{ fontFamily: "Manrope", fontSize: 11, color: P.secondary, marginTop: 1 }} numberOfLines={1}>
          {[tx.category_label, tx.financial_account_name].filter(Boolean).join(" · ") || "Uncategorized"}
        </Text>
      </View>
      <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 12.5, color: AMOUNT_COLORS[tx.transaction_type] ?? P.ink, fontVariant: ["tabular-nums"] }}>
        {prefix}₱{formatAmount(tx.amount_centavos)}
      </Text>
      {kebabTourId
        ? <TourKebabMenu tourId={kebabTourId} onEdit={() => onEdit(tx.id)} onDelete={() => onDelete(tx.id)} />
        : <KebabTooltip onEdit={() => onEdit(tx.id)} onDelete={() => onDelete(tx.id)} />}
    </View>
  );
});
