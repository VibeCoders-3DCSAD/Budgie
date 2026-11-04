import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpRight,
} from "phosphor-react-native";
import { AmountHero } from "../../components/BudgieForm";
import { SnapshotCard } from "./components/SnapshotCard";
import { DashboardEmptyState } from "./components/DashboardEmptyState";
import { DashboardPartialData } from "./components/DashboardPartialData";
import { SpendingPie, TrendChart } from "./components/DashboardCharts";
import { FinancialHealthCard } from "./components/FinancialHealthCard";
import { AttentionUpcoming } from "./components/AttentionUpcoming";
import type { DashboardItemTarget } from "./types";
import { SafeToSpendCard } from "./components/SafeToSpendCard";
import { getSnapshotCentavos, getSnapshotCount, getSnapshotText } from "./dashboardSnapshotContent";
import { formatPesoAmount } from "../../lib/format/money";
import { deltaPercent, formatPeso, formatPesoCompact, formatTransactionTime, getGreeting, getPreviousMonthName } from "./dashboardFormatting";
import { useDashboardData } from "./hooks/useDashboardData";
import { groupSpendingCategories } from "./helpers/spendingGroups";
import { DEFAULT_TAXONOMY_COLOR, TaxonomyIcon } from "../taxonomy/taxonomyVisuals";
import { dashboardColors as P, dashboardStyles } from "./dashboardAppearance";
import { WithTermInfo } from "../../components/TermInfo";

type Props = {
  userId: string;
  deviceId: string;
  accessToken: string;
  onNavigate: (page: string) => void;
  syncVersion?: number;
  onOpenReminder: (target: DashboardItemTarget) => void;
};

function DashboardContent({ userId, deviceId, accessToken, onNavigate, syncVersion = 0, onOpenReminder }: Props) {
  const { summary: s, trends, snapshots, loading, refreshing, summaryUnavailable, summaryStale, snapshotsUnavailable, error, refresh } = useDashboardData({ userId, deviceId, accessToken });

  const reminders = <AttentionUpcoming userId={userId} reloadKey={`${syncVersion}:${refreshing}`} onOpen={onOpenReminder} />;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={P.brand} />
      </View>
    );
  }

  if (summaryUnavailable) {
    return <View><DashboardPartialData trends={trends} snapshots={snapshots} snapshotsUnavailable={snapshotsUnavailable} onRefresh={refresh} onNavigate={onNavigate} />{reminders}</View>;
  }

  const prevMonthName = getPreviousMonthName();
  const incomeDelta = deltaPercent(s.currentMonthIncomeCentavos, s.previousMonthIncomeCentavos);
  const expenseDelta = deltaPercent(s.currentMonthExpenseCentavos, s.previousMonthExpenseCentavos);
  // Balance at the start of the month is today's balance minus this month's net activity.
  const monthStartBalanceCentavos = s.currentBalanceCentavos - (s.currentMonthIncomeCentavos - s.currentMonthExpenseCentavos);
  const balanceDelta = monthStartBalanceCentavos > 0 ? deltaPercent(s.currentBalanceCentavos, monthStartBalanceCentavos) : null;
  const showBalanceDelta = s.accountCount > 0 && !!balanceDelta;
  const balanceDetail = s.accountCount === 0
    ? "Add an account to see your balance"
    : balanceDelta ?? `Across ${s.accountCount} ${s.accountCount === 1 ? "account" : "accounts"}`;
  // Include savings contributions in the chart total, including those recorded as transfers.
  const categoryExpenseTotal = s.categorySpending.reduce((sum, category) => sum + category.total_centavos, 0);
  const spendingGroups = groupSpendingCategories(s.categorySpending);

  const isEmpty = s.accountCount === 0
    && s.currentMonthIncomeCentavos === 0
    && s.currentMonthExpenseCentavos === 0
    && s.transactionCount === 0
    && s.categorySpending.length === 0;

  if (isEmpty && !summaryUnavailable) return <View><DashboardEmptyState onNavigate={onNavigate} />{reminders}</View>;

  const savingsSnap = snapshots.savings_goals;
  const savingsText = getSnapshotText(savingsSnap);
  const savingsCount = getSnapshotCount(savingsSnap);
  const savingsCentavos = getSnapshotCentavos(savingsSnap, ["saved_centavos", "current_amount_centavos"]);
  const savingsUnavailable = (snapshotsUnavailable && !savingsSnap) || (!!savingsSnap && !savingsText && savingsCount === null);
  const staleSnapshot = (snapshot: typeof savingsSnap) => !!snapshot && (snapshot.stale || snapshotsUnavailable);

  return (
    <View>
      {error ? (
        <View style={[dashboardStyles.card, { backgroundColor: P.pink, marginBottom: 14 }]}>
          <Text style={{ fontFamily: "Manrope", fontSize: 14, lineHeight: 21, color: P.secondary }}>{error}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry dashboard refresh" onPress={refresh} style={{ marginTop: 10 }}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: P.error }}>Try again</Text></Pressable>
        </View>
      ) : null}
      {summaryStale ? <View style={[dashboardStyles.card, { backgroundColor: P.mint, marginBottom: 14 }]}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: P.ink }}>Cached dashboard summary</Text><Text style={{ fontFamily: "Manrope", fontSize: 14, lineHeight: 21, color: P.secondary, marginTop: 6 }}>Balances, income, and expenses are from your last successful update.</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh cached dashboard summary" onPress={refresh} style={{ marginTop: 10 }}><Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: P.green }}>Refresh</Text></Pressable></View> : null}
      {s.accountCount === 0 && !summaryUnavailable ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add account" onPress={() => onNavigate("financial-accounts")} style={[dashboardStyles.card, { marginBottom: 14, backgroundColor: P.mint }]}>
          <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: P.ink }}>Add an account</Text>
          <Text style={{ fontFamily: "Manrope", fontSize: 14, lineHeight: 21, color: P.secondary, marginTop: 6 }}>Add an account to make your available balance accurate.</Text>
        </Pressable>
      ) : null}
      {/* Balance card */}
      <AmountHero label="AVAILABLE BALANCE" amountCentavos={s.currentBalanceCentavos} detail={showBalanceDelta ? undefined : balanceDetail}>
        {showBalanceDelta ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, backgroundColor: P.brand, alignSelf: "flex-start" }}>
            {balanceDelta?.startsWith("-") ? <ArrowDownRight size={12} color="#FFFFFF" weight="bold" /> : <ArrowUpRight size={12} color="#FFFFFF" weight="bold" />}
            <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11, color: "#FFFFFF" }}>{balanceDelta}</Text>
          </View>
        ) : null}
      </AmountHero>

      {/* Income / Expense cards */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
        <View style={{ flex: 1, minWidth: 0, padding: 14, borderRadius: 12, backgroundColor: P.mint }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: P.secondary }}>Income</Text>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: P.green, justifyContent: "center", alignItems: "center" }}>
              <ArrowDownLeft size={13} color={P.surface} weight="bold" />
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", marginTop: 8 }}>
            <Text style={{ fontFamily: "Manrope", fontWeight: "500", fontSize: 11, color: P.secondary, marginRight: 3 }}>₱</Text>
            <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 19, flexShrink: 1, color: P.ink }}>
              {formatPesoAmount(s.currentMonthIncomeCentavos)}
            </Text>
          </View>
          {incomeDelta && (
            <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11, color: P.green, marginTop: 8, backgroundColor: P.surface, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 9, alignSelf: "flex-start" }}>{incomeDelta} from {prevMonthName}</Text>
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0, padding: 14, borderRadius: 12, backgroundColor: P.pink }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: P.secondary }}>Expenses</Text>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: P.expenseIcon, justifyContent: "center", alignItems: "center" }}>
              <ArrowUpRight size={13} color={P.surface} weight="bold" />
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", marginTop: 8 }}>
            <Text style={{ fontFamily: "Manrope", fontWeight: "500", fontSize: 11, color: P.secondary, marginRight: 3 }}>₱</Text>
            <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 19, flexShrink: 1, color: P.ink }}>
              {formatPesoAmount(s.currentMonthExpenseCentavos)}
            </Text>
          </View>
          {expenseDelta && (
            <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 11, color: P.error, marginTop: 8, backgroundColor: P.surface, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 9, alignSelf: "flex-start" }}>{expenseDelta} from {prevMonthName}</Text>
          )}
        </View>
      </View>
      {reminders}

      <View style={[dashboardStyles.card, { marginTop: 12 }]}><WithTermInfo term="cash-flow"><Text style={{ fontFamily: "Manrope", fontSize: 14, color: P.secondary }}>Net monthly cash flow</Text></WithTermInfo><Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 20, color: s.currentMonthIncomeCentavos - s.currentMonthExpenseCentavos >= 0 ? P.green : P.error, marginTop: 4 }}>{formatPeso(s.currentMonthIncomeCentavos - s.currentMonthExpenseCentavos)}</Text></View>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
        <SnapshotCard title="Savings goals" stale={staleSnapshot(savingsSnap)} unavailable={savingsUnavailable} onRefresh={refresh} onNavigate={() => onNavigate("savings-goals")} actionLabel={!savingsSnap || savingsCount === 0 ? "Create a goal" : undefined} copy={savingsText ?? (savingsUnavailable ? "Savings goal information is unavailable." : !savingsSnap || savingsCount === 0 ? "No savings goals yet. Create one when you're ready." : savingsCount === null ? "Savings goal summary is unavailable. Refresh to try again." : `${savingsCount} savings goal${savingsCount === 1 ? "" : "s"} in progress${savingsCentavos === null ? "." : ` · ${formatPeso(savingsCentavos)} saved.`}`)} />
      </View>

      <FinancialHealthCard accessToken={accessToken} />

      {s.incomeSourceCount === 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add an income source" onPress={() => onNavigate("income-sources")} style={[dashboardStyles.card, { marginTop: 20, backgroundColor: P.mint }]}>
          <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: P.ink }}>Add an income source</Text>
          <Text style={{ fontFamily: "Manrope", fontSize: 14, lineHeight: 21, color: P.secondary, marginTop: 6 }}>Set expected income to make your monthly plan more useful.</Text>
        </Pressable>
      ) : null}

      {/* Trends */}
      <View style={dashboardStyles.sectionHeading}>
        <Text style={dashboardStyles.sectionTitle}>Trends</Text>
        {trends.length === 0 ? <Text style={{ fontFamily: "Manrope", fontWeight: "600", fontSize: 12.5, color: P.secondary }}>No chart data</Text> : <Text style={{ fontFamily: "Manrope", fontWeight: "600", fontSize: 12.5, color: P.green }}>This month</Text>}
      </View>
      <View style={[dashboardStyles.card, { borderRadius: 12, padding: 14 }]}>
        <TrendChart data={trends} startingBalance={s.currentBalanceCentavos - (s.currentMonthIncomeCentavos - s.currentMonthExpenseCentavos)} colors={{ line: P.divider, income: P.green, expense: P.error, muted: P.secondary }} />
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 18, paddingTop: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 14, height: 3, borderRadius: 3, backgroundColor: P.green }} />
            <Text style={{ fontFamily: "Manrope", fontWeight: "500", fontSize: 11, color: P.secondary }}>Balance</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 14, height: 3, borderRadius: 3, backgroundColor: P.error }} />
            <Text style={{ fontFamily: "Manrope", fontWeight: "500", fontSize: 11, color: P.secondary }}>Expenses</Text>
          </View>
        </View>
      </View>

      {/* Spending */}
      <View style={dashboardStyles.sectionHeading}>
        <Text style={dashboardStyles.sectionTitle}>Spending</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="View all spending categories" onPress={() => onNavigate("categories")}>
          <Text style={dashboardStyles.action}>View all</Text>
        </Pressable>
      </View>
      <View style={[dashboardStyles.card, { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: P.mint }]}>
        <SpendingPie
          segments={spendingGroups.map((c) => ({
            label: c.category_label,
            value: c.total_centavos,
            color: c.color_hex ?? DEFAULT_TAXONOMY_COLOR,
          }))}
          total={categoryExpenseTotal}
          totalLabel={formatPesoCompact(categoryExpenseTotal)}
          line={P.divider}
          muted={P.secondary}
        />
        <View style={{ flex: 1, gap: 10 }}>
          {spendingGroups.map((c) => {
            const pct = categoryExpenseTotal > 0
              ? Math.round((c.total_centavos / categoryExpenseTotal) * 100)
              : 0;
            return (
              <View key={c.category_id ?? "uncategorized"} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: c.color_hex ?? DEFAULT_TAXONOMY_COLOR, alignItems: "center", justifyContent: "center" }}>
                  <TaxonomyIcon iconKey={c.icon_key} size={15} color="#fff" weight="fill" />
                </View>
                <Text style={{ flex: 1, fontFamily: "Manrope", fontWeight: "500", fontSize: 12.5, color: P.secondary }} numberOfLines={1}>{c.category_label}</Text>
                <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 12.5, color: P.ink }}>{pct}%</Text>
              </View>
            );
          })}
          {s.categorySpending.length === 0 && (
            <Text style={{ fontFamily: "Manrope", fontSize: 12, color: P.secondary }}>No expenses this month</Text>
          )}
        </View>
      </View>

      {/* Recent */}
      <View style={dashboardStyles.sectionHeading}>
        <Text style={dashboardStyles.sectionTitle}>Recent</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="View all transactions" onPress={() => onNavigate("transactions")}>
          <Text style={dashboardStyles.action}>View all</Text>
        </Pressable>
      </View>
      <View style={[dashboardStyles.card, { padding: 0, overflow: "hidden" }]}>
        {s.recentTransactions.map((tx, index) => {
          const isIncome = tx.transaction_type === "income";
          const label = tx.merchant_name || tx.counterparty_name || tx.category_label || (isIncome ? "Income" : "Expense");
          return (
            <View key={tx.id} style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: P.divider }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: tx.color_hex ?? DEFAULT_TAXONOMY_COLOR, justifyContent: "center", alignItems: "center" }}>
                <TaxonomyIcon iconKey={tx.icon_key} size={21} color="#fff" weight="fill" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13.5, color: P.ink }} numberOfLines={1}>{label}</Text>
                <Text style={{ fontFamily: "Manrope", fontSize: 11.5, color: P.secondary }} numberOfLines={1}>{tx.category_label ?? (isIncome ? "Income" : "Expense")}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 13.5, color: isIncome ? P.green : P.ink }}>
                  {isIncome ? "+" : "-"}{formatPeso(tx.amount_centavos)}
                </Text>
                <Text style={{ fontFamily: "Manrope", fontSize: 11, color: P.secondary }}>{formatTransactionTime(tx.transaction_date)}</Text>
              </View>
            </View>
          );
        })}
        {s.recentTransactions.length === 0 && s.transactionCount === 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Record a transaction" onPress={() => onNavigate("add-transaction")} style={{ paddingVertical: 20, alignItems: "center" }}>
            <Text style={{ fontFamily: "Manrope", fontSize: 13, color: P.secondary }}>No recent transactions</Text>
            <Text style={{ fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: P.green, marginTop: 6 }}>Record income or an expense</Text>
          </Pressable>
        )}
        {s.recentTransactions.length === 0 && s.transactionCount > 0 && <Text style={{ paddingVertical: 20, textAlign: "center", fontFamily: "Manrope", fontSize: 13, color: P.secondary }}>No expenses recorded yet</Text>}
      </View>

      <SafeToSpendCard userId={userId} reloadKey={s} onNavigate={onNavigate} />

      {refreshing ? <View style={{ alignItems: "center", marginTop: 12 }}><ActivityIndicator size="small" color={P.green} /></View> : null}
    </View>
  );
}

// Re-checked every minute so the greeting changes while the dashboard stays open.
function useGreeting(): string {
  const [greeting, setGreeting] = React.useState(() => getGreeting());
  React.useEffect(() => {
    const timer = setInterval(() => setGreeting(getGreeting()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return greeting;
}

export default function DashboardScreen(props: Props) {
  const greeting = useGreeting();
  return (
    <View>
      <View style={{ marginTop: 6, marginBottom: 14 }}>
        <Text accessibilityRole="header" style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 22, color: P.ink }}>Dashboard</Text>
        <Text style={{ fontFamily: "Manrope", fontWeight: "500", fontSize: 13, color: P.secondary, marginTop: 4 }}>{greeting}!</Text>
      </View>
      <DashboardContent {...props} />
    </View>
  );
}
