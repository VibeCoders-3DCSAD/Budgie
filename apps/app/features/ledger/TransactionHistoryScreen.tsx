import { ActivityIndicator, Text, View } from "react-native";
import NewTransactionScreen from "./NewTransactionScreen";
import type { UnusualSpendingInsight } from "../../local-db/repositories/alerts/unusualSpending";
import { dashboardColors as P } from "../dashboard/dashboardAppearance";
import { useHistoryFilters } from "./history/hooks/useHistoryFilters";
import { useTransactionList } from "./history/hooks/useTransactionList";
import { useEditTarget, useEditTransaction } from "./history/hooks/useEditTransaction";
import { useDeleteTransaction } from "./history/hooks/useDeleteTransaction";
import { useUnusualSpendingPrompt } from "./history/hooks/useUnusualSpendingPrompt";
import { HistorySearchCard } from "./history/components/HistorySearchCard";
import { StatCard } from "./history/components/StatCard";
import { TransactionListBody } from "./history/components/TransactionListBody";
import { TransactionFiltersSheet } from "./history/components/TransactionFiltersSheet";
import { DeleteTransactionModal, InstallmentDeleteBlockedModal } from "./history/components/DeleteTransactionModals";
import { UnusualSpendingModal } from "./history/components/UnusualSpendingModal";
import { TourTarget } from "../onboarding-tour/components/TourTarget";

type Props = {
  userId: string;
  deviceId: string;
  accessToken: string;
  unusualSpending: UnusualSpendingInsight | null;
  onUnusualSpendingDismissed: () => void;
  onNewTransaction: () => void;
  onLoadMoreChange?: (loadMore: (() => void) | null) => void;
  // The shell owns the scroll view; these let the list return to where it was after an edit.
  getScrollOffset?: () => number;
  scrollTo?: (y: number) => void;
  // Bumped by the shell after a sync pushes or pulls changes.
  syncVersion?: number;
  // Lets the shell hide its top bar and tabs while the edit form is open, like the full-screen new transaction page.
  onEditingChange?: (editing: boolean) => void;
};

export default function TransactionHistoryScreen({ userId, deviceId, accessToken, unusualSpending, onUnusualSpendingDismissed, onNewTransaction, onLoadMoreChange, getScrollOffset, scrollTo, syncVersion = 0, onEditingChange }: Props) {
  const filters = useHistoryFilters(userId);
  const { editTarget, editing, beginEdit, closeEdit, restoreListScroll } = useEditTarget({ getScrollOffset, scrollTo, onEditingChange });
  const list = useTransactionList({ userId, filters: filters.state, editing, syncVersion, onLoadMoreChange });
  const editTransaction = useEditTransaction(userId, list.transactions, beginEdit);
  const deletion = useDeleteTransaction({
    userId,
    deviceId,
    accessToken,
    onDeleted: (transactionId) => {
      list.removeTransaction(transactionId);
      list.load({ inPlace: true });
    },
  });
  const unusual = useUnusualSpendingPrompt({ userId, deviceId, unusualSpending, loading: list.loading, onUnusualSpendingDismissed });

  const { typeFilter } = filters.state;
  const filtered = filters.activeFilterCount > 0 || list.loadedSearch.length > 0;

  // The list stays mounted, hidden, while a transaction is edited: remounting every loaded row on return
  // blocks the JS thread for seconds, whereas a mounted list only re-renders the rows the edit changed.
  return (
    <>
    {editTarget ? (
      // The form brings its own side padding; this cancels the shell's 20px content gutter so it is not doubled.
      <View style={{ marginHorizontal: -20 }}>
        <NewTransactionScreen
          transaction={editTarget}
          userId={userId}
          deviceId={deviceId}
          accessToken={accessToken}
          onClose={() => { closeEdit(); list.load({ inPlace: true }); }}
        />
      </View>
    ) : null}
    <View style={{ gap: 11, paddingTop: 6, display: editTarget ? "none" : "flex" }} onLayout={restoreListScroll}>
      <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 22, letterSpacing: -0.3, color: P.ink, marginBottom: 2 }}>
        Activity
      </Text>

      <TourTarget id="activity-search" fill>
      <HistorySearchCard
        search={filters.state.search}
        onSearchChange={filters.setSearch}
        onSearchSubmit={() => list.load()}
        activeFilterCount={filters.activeFilterCount}
        onOpenFilters={() => filters.setShowFilters(true)}
      />
      </TourTarget>

      {/* The totals wait for the rows rather than printing a zero that is about to change. A type filter shows only its own total. */}
      {list.loading ? null : (
        <TourTarget id="activity-totals" fill>
        <View style={{ flexDirection: "row", gap: 12, opacity: list.stale ? 0.5 : 1 }}>
          {typeFilter !== "expense" ? <StatCard kind="income" centavos={list.totals.income_centavos} /> : null}
          {typeFilter !== "income" ? <StatCard kind="expense" centavos={list.totals.expense_centavos} /> : null}
        </View>
        </TourTarget>
      )}

      <TransactionListBody
        loading={list.loading}
        stale={list.stale}
        empty={list.transactions.length === 0}
        filtered={filtered}
        grouped={list.grouped}
        onEdit={editTransaction}
        onDelete={deletion.selectDeleteTarget}
        onNewTransaction={onNewTransaction}
      />
      {list.loadingMore ? <ActivityIndicator color={P.brand} style={{ marginVertical: 16 }} /> : null}

      <TransactionFiltersSheet
        visible={filters.showFilters}
        onClose={() => filters.setShowFilters(false)}
        filters={filters.state}
        categories={filters.categories}
        datePickerField={filters.datePickerField}
        onTypeChange={filters.setTypeFilter}
        onCategoryChange={filters.setCategoryFilter}
        onDateRangeChange={filters.setDateRange}
        onOpenDatePicker={filters.setDatePickerField}
        onSelectCustomDate={filters.selectCustomDate}
        onSortChange={filters.selectSort}
        onReset={filters.resetFilters}
        onApply={filters.applyFilters}
      />

      <DeleteTransactionModal
        visible={deletion.deleteTarget !== null}
        deleting={deletion.deleting}
        onConfirm={deletion.confirmDelete}
        onCancel={deletion.cancelDelete}
      />

      <InstallmentDeleteBlockedModal visible={deletion.deleteBlockedTarget !== null} onClose={deletion.closeDeleteBlocked} />

      <UnusualSpendingModal visible={unusual.visible} unusualSpending={unusualSpending} onAnswer={unusual.answerUnusualSpendingRecurrence} />
    </View>
    </>
  );
}
