import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Banner, FormCard, Note, styles as ui, v4, v4Font } from "../../components/BudgieForm";
import type { CreditCardPayment, StatementPaymentContext } from "../../local-db/repositories/credit-cards/creditCardPayments";
import type { CreditCardCycle } from "../../local-db/repositories/credit-cards/creditCardCycles";
import type { CreditCardStrategy } from "../../local-db/repositories/credit-cards/creditCardRepaymentPlans";
import { CreditCardCycleList, CreditCardInstallmentList } from "./credit-cards/components/CreditCardCollections";
import CreditCardCycleEditor from "./credit-cards/components/CreditCardCycleEditor";
import CreditCardListScreen from "./CreditCardListScreen";
import CreditCardForecastSection from "./credit-cards/components/CreditCardForecastSection";
import CreditCardRepaymentStrategy from "./credit-cards/components/CreditCardRepaymentStrategy";
import CreditCardAvailableCreditReconciliation from "./credit-cards/components/CreditCardAvailableCreditReconciliation";
import { manilaToday } from "../../lib/dates";
import { useCreditCardForecast } from "./credit-cards/hooks/useCreditCardForecast";
import { useCycleEditor } from "./hooks/useCycleEditor";
import { useDebtManagerData } from "./hooks/useDebtManagerData";
import { Button, CARD_TINT, CardIcon, InfoRow, LinkButton, ProgressBar, SectionHeader, formatPeso } from "./components/debtUi";

type Props = { userId: string; deviceId: string; accountId?: string; onBack?: () => void; onOpenCard?: (accountId: string) => void; onPayStatement?: (context: StatementPaymentContext) => void; onEditPayment?: (payment: CreditCardPayment) => void };

export default function DebtManagerScreen({ userId, deviceId, accountId, onBack, onOpenCard, onPayStatement, onEditPayment }: Props) {
  const { accounts, cycles, cycleTransactions, statements, installments, payments, strategies, settlements, loading, error, stale, load } = useDebtManagerData(userId, deviceId);
  const cycleEditor = useCycleEditor(userId, deviceId, load);
  const [previewStrategy, setPreviewStrategy] = useState<CreditCardStrategy | null>(null);
  const [statementCycle, setStatementCycle] = useState<CreditCardCycle | null>(null);

  useEffect(() => { setPreviewStrategy(null); }, [accountId]);

  const today = manilaToday();
  const selectedAccount = accountId ? accounts.find((account) => account.id === accountId) : undefined;
  const strategy = accountId ? strategies.find((item) => item.accountId === accountId) : undefined;
  const forecastStrategy = accountId
    ? previewStrategy ?? strategy ?? { accountId, strategy: "pay_in_full" as const, customAmountCentavos: null, percentageBps: null, version: 0 }
    : null;
  const forecast = useCreditCardForecast(selectedAccount && forecastStrategy ? {
    cycles: cycles.filter((cycle) => cycle.account_id === accountId),
    transactions: cycleTransactions.filter((transaction) => transaction.account_id === accountId),
    statements,
    strategy: forecastStrategy,
    payments,
    installments: installments.filter((installment) => installment.account_id === accountId),
    availableCreditCentavos: selectedAccount.creditCardDetails?.availableCreditCentavos ?? 0,
    creditLimitCentavos: selectedAccount.creditCardDetails?.creditLimitCentavos ?? 0,
    billingCycleEndDay: selectedAccount.creditCardDetails?.cutoffDay ?? null,
    reconciledAvailableCreditCentavos: selectedAccount.creditCardDetails?.reconciledAvailableCreditCentavos,
    preReconciliationAvailableCreditCentavos: selectedAccount.creditCardDetails?.preReconciliationAvailableCreditCentavos,
    availableCreditReconciledAt: selectedAccount.creditCardDetails?.availableCreditReconciledAt,
    asOfDate: today,
  } : null);

  if (loading && accounts.length === 0) {
    return <View style={{ alignItems: "center", gap: 12, paddingVertical: 30 }}><ActivityIndicator color={v4.brand} /><Note>{"Your credit-card information is loading. Wait a moment for the details to appear."}</Note></View>;
  }

  if (accounts.length === 0 && !error) {
    return <View style={{ gap: 10 }}><SectionHeader title="Credit Cards" /><Note>No credit cards are recorded yet. Add a credit card to track billing cycles and payments.</Note></View>;
  }

  if (!accountId) return <CreditCardListScreen accounts={accounts} cycles={cycles} onOpenCard={onOpenCard ?? (() => {})} />;

  if (!selectedAccount) return <View style={{ gap: 12 }}><Banner tone="error">This credit card is unavailable.</Banner><Button variant="ghost" label="Back to Credit Cards" onPress={() => onBack?.()} /></View>;
  const latestStatement = statements
    .filter((statement) => statement.authoritative && !statement.deleted && statement.statement_date <= today && cycles.find((cycle) => cycle.id === statement.cycle_id)?.account_id === accountId)
    .sort((left, right) => right.statement_date.localeCompare(left.statement_date))[0];
  const creditLimitCentavos = selectedAccount.creditCardDetails?.creditLimitCentavos ?? 0;
  const availableCreditCentavos = selectedAccount.creditCardDetails?.availableCreditCentavos ?? 0;
  const currentDebtCentavos = Math.max(0, creditLimitCentavos - availableCreditCentavos);
  const usedRatio = creditLimitCentavos > 0 ? currentDebtCentavos / creditLimitCentavos : 0;
  const alertRatio = (selectedAccount.creditCardDetails?.alertThresholdPercent ?? 80) / 100;

  return (
    <View style={{ gap: 14 }}>
      <FormCard>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={[ui.listTile, { backgroundColor: CARD_TINT.bg, width: 40, height: 40, borderRadius: 12 }]}><CardIcon /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: v4Font, fontWeight: "800", fontSize: 18, color: v4.ink }}>{selectedAccount.name}</Text>
            <Text style={[ui.listSubtitle, { marginTop: 2 }]}>{selectedAccount.creditCardDetails?.issuer ?? selectedAccount.institutionName ?? "Billing cycles and statement activity"}</Text>
          </View>
          <LinkButton label="Refresh" accessibilityLabel="Refresh credit-card information" onPress={() => { load().catch(() => {}); }} />
        </View>
        <Note>Billing cycles and statement activity</Note>
        <ProgressBar label="Credit used" valueLabel={`${formatPeso(currentDebtCentavos)} of ${formatPeso(creditLimitCentavos)}`} ratio={usedRatio} tone={usedRatio >= alertRatio ? "err" : "ok"} />
        <InfoRow label="Available credit" term="available-credit" value={formatPeso(availableCreditCentavos)} tone="ok" />
        <InfoRow label="Current card debt" value={formatPeso(currentDebtCentavos)} />
        <InfoRow label="Credit limit" term="credit-limit" value={formatPeso(creditLimitCentavos)} />
        <CreditCardAvailableCreditReconciliation userId={userId} deviceId={deviceId} accountId={selectedAccount.id} creditLimitCentavos={creditLimitCentavos} onSaved={load} />
      </FormCard>
      {stale ? <Banner tone="warn">Credit-card information may be out of date. Refresh or reconcile it with the latest issuer records.</Banner> : null}
      {error && !stale ? <Banner tone="error">Your credit-card information could not be loaded or saved. Check your connection and try again.</Banner> : null}
      {cycleEditor.notice ? <Banner tone="info">{cycleEditor.notice}</Banner> : null}
      <CreditCardCycleEditor editor={cycleEditor} today={today} />
      <CreditCardCycleList
        key={`${userId}:${selectedAccount.id}`}
        userId={userId}
        deviceId={deviceId}
        account={selectedAccount}
        cycles={cycles}
        transactions={cycleTransactions}
        statements={statements}
        payments={payments}
        statementCycle={statementCycle}
        onManageCycle={cycleEditor.open}
        onAddStatement={setStatementCycle}
        onCancelStatement={() => setStatementCycle(null)}
        onStatementSaved={load}
        onPayStatement={onPayStatement}
        onEditPayment={onEditPayment}
      />
      <CreditCardRepaymentStrategy key={accountId} userId={userId} deviceId={deviceId} accountId={accountId} statement={latestStatement} strategy={strategy} onPreviewChange={setPreviewStrategy} onSaved={async () => { await load(); setPreviewStrategy(null); }} />
      <CreditCardForecastSection forecast={forecast.forecast} isLoading={forecast.isLoading} creditLimitCentavos={creditLimitCentavos} reconciliationAt={selectedAccount.creditCardDetails?.availableCreditReconciledAt} />
      <CreditCardInstallmentList userId={userId} deviceId={deviceId} installments={installments.filter((installment) => installment.account_id === accountId)} settlements={settlements} onSaved={load} />
    </View>
  );
}
