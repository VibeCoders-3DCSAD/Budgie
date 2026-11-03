import React, { useCallback, useEffect, useRef, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { Banner, FormCard, Note, PickerField, styles as ui, v4, v4Font } from "../../components/BudgieForm";
import { ensureCurrentCreditCardCycles, createCreditCardCycle, listCreditCardCycles, listCreditCardCycleTransactions, updateCreditCardCycle, type CreditCardCycle, type CreditCardCycleTransaction } from "../../local-db/repositories/credit-cards/creditCardCycles";
import { calculateCurrentCreditCardCycle } from "../../local-db/repositories/credit-cards/creditCardCycleDates";
import {
  listFinancialAccounts,
  type FinancialAccount,
} from "../../local-db/repositories/foundations/financialFoundations";
import { LocalDbError } from "../../local-db/helpers";
import { listCreditCardStatements, type CreditCardStatement } from "../../local-db/repositories/credit-cards/creditCardStatements";
import { listCreditCardInstallments, type CreditCardInstallment } from "../../local-db/repositories/credit-cards/creditCardInstallments";
import { listCreditCardPayments, type CreditCardPayment, type StatementPaymentContext } from "../../local-db/repositories/credit-cards/creditCardPayments";
import { CreditCardCycleList, CreditCardInstallmentList } from "./credit-cards/components/CreditCardCollections";
import CreditCardListScreen from "./CreditCardListScreen";
import CreditCardForecastSection from "./credit-cards/components/CreditCardForecastSection";
import { listCreditCardStrategies, type CreditCardStrategy } from "../../local-db/repositories/credit-cards/creditCardRepaymentPlans";
import { listCreditCardSettlements, type CreditCardSettlement } from "../../local-db/repositories/credit-cards/creditCardSettlements";
import CreditCardRepaymentStrategy from "./credit-cards/components/CreditCardRepaymentStrategy";
import CreditCardAvailableCreditReconciliation from "./credit-cards/components/CreditCardAvailableCreditReconciliation";
import { getPhilippineToday } from "./forecast/helpers/debtTrendRange";
import { useCreditCardForecast } from "./credit-cards/hooks/useCreditCardForecast";
import { Button, CARD_TINT, CardIcon, InfoRow, LinkButton, ProgressBar, SectionHeader, formatPeso } from "./components/debtUi";

type Props = { userId: string; deviceId: string; accountId?: string; onBack?: () => void; onOpenCard?: (accountId: string) => void; onPayStatement?: (context: StatementPaymentContext) => void; onEditPayment?: (payment: CreditCardPayment) => void };

export default function DebtManagerScreen({ userId, deviceId, accountId, onBack, onOpenCard, onPayStatement, onEditPayment }: Props) {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [cycles, setCycles] = useState<CreditCardCycle[]>([]);
  const [cycleTransactions, setCycleTransactions] = useState<CreditCardCycleTransaction[]>([]);
  const [statements, setStatements] = useState<CreditCardStatement[]>([]);
  const [installments, setInstallments] = useState<CreditCardInstallment[]>([]);
  const [payments, setPayments] = useState<CreditCardPayment[]>([]);
  const [strategies, setStrategies] = useState<CreditCardStrategy[]>([]);
  const [previewStrategy, setPreviewStrategy] = useState<CreditCardStrategy | null>(null);
  const [settlements, setSettlements] = useState<CreditCardSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stale, setStale] = useState(false);
  const [editingCycle, setEditingCycle] = useState<{ account: FinancialAccount; cycle: CreditCardCycle | null } | null>(null);
  const [cycleStart, setCycleStart] = useState("");
  const [cycleCutoff, setCycleCutoff] = useState("");
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [cycleSaving, setCycleSaving] = useState(false);
  const [cycleNotice, setCycleNotice] = useState<string | null>(null);
  const [cyclePicker, setCyclePicker] = useState<"start" | "cutoff" | null>(null);
  const [statementCycle, setStatementCycle] = useState<CreditCardCycle | null>(null);
  const hasLoadedData = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const nextAccounts = await listFinancialAccounts(userId, { kind: "credit_card", status: "active" });
      setAccounts(nextAccounts);
      hasLoadedData.current = nextAccounts.length > 0;

      let cycleLoadFailed = false;
      try {
        await ensureCurrentCreditCardCycles(userId, deviceId);
      } catch (cycleError) {
        cycleLoadFailed = true;
        console.error("[debt-manager] billing cycle load failed", {
          userId,
          error: cycleError instanceof Error ? cycleError.message : "unknown error",
        });
      }
       const nextCycles = await listCreditCardCycles(userId);
       setCycles(nextCycles);
       setCycleTransactions(await listCreditCardCycleTransactions(userId));
       setStatements(await listCreditCardStatements(userId));
       setInstallments(await listCreditCardInstallments(userId));
        setPayments(await listCreditCardPayments(userId));
          setStrategies(await listCreditCardStrategies(userId));
         setSettlements(await listCreditCardSettlements(userId));
      setError(cycleLoadFailed);
      setStale(cycleLoadFailed && hasLoadedData.current);
    } catch (loadError) {
      console.error("[debt-manager] account load failed", {
        userId,
        reason: loadError instanceof Error ? loadError.message : "unknown error",
      });
      setError(true);
      setStale(hasLoadedData.current);
    } finally {
      setLoading(false);
    }
  }, [deviceId, userId]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => { setPreviewStrategy(null); }, [accountId]);

  const today = getPhilippineToday();
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

  function openCycleEditor(account: FinancialAccount, cycle: CreditCardCycle | null) {
    const defaults = cycle ?? (account.creditCardDetails ? calculateCurrentCreditCardCycle({ account_id: account.id, cutoff_day: account.creditCardDetails.cutoffDay }) : null);
    setEditingCycle({ account, cycle });
    setCycleStart(defaults?.cycle_start_date ?? "");
    setCycleCutoff(defaults?.cutoff_date ?? "");
    setCycleError(null);
    setCycleNotice(null);
  }

  async function saveCycle() {
    if (!editingCycle || !/^\d{4}-\d{2}-\d{2}$/.test(cycleStart) || !/^\d{4}-\d{2}-\d{2}$/.test(cycleCutoff) || cycleStart > cycleCutoff) {
      setCycleError("Some credit-card details are not valid. Check the highlighted fields and try again.");
      return;
    }
    setCycleSaving(true);
    setCycleNotice("Your credit-card changes are being saved. Please wait before trying again.");
    try {
      if (editingCycle.cycle) await updateCreditCardCycle(userId, deviceId, editingCycle.cycle.id, { cycle_start_date: cycleStart, cutoff_date: cycleCutoff });
      else await createCreditCardCycle(userId, deviceId, { account_id: editingCycle.account.id, cycle_start_date: cycleStart, cutoff_date: cycleCutoff });
      setEditingCycle(null);
      await load();
      setCycleNotice("Your credit-card changes were saved. Review the billing-cycle details before continuing.");
    } catch (error) {
      setCycleError(
        error instanceof LocalDbError
          ? error.message
          : "Your credit-card changes could not be completed. Review the details and try again.",
      );
    } finally { setCycleSaving(false); }
  }

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
        <InfoRow label="Available credit" value={formatPeso(availableCreditCentavos)} tone="ok" />
        <InfoRow label="Current card debt" value={formatPeso(currentDebtCentavos)} />
        <InfoRow label="Credit limit" value={formatPeso(creditLimitCentavos)} />
        <CreditCardAvailableCreditReconciliation userId={userId} deviceId={deviceId} accountId={selectedAccount.id} creditLimitCentavos={creditLimitCentavos} onSaved={load} />
      </FormCard>
      {stale ? <Banner tone="warn">Credit-card information may be out of date. Refresh or reconcile it with the latest issuer records.</Banner> : null}
      {error && !stale ? <Banner tone="error">Your credit-card information could not be loaded or saved. Check your connection and try again.</Banner> : null}
      {cycleNotice ? <Banner tone="info">{cycleNotice}</Banner> : null}
      {editingCycle ? (
        <FormCard title={editingCycle.cycle ? "Override billing cycle" : "Add billing cycle"}>
          <PickerField label="Cycle start" accessibilityLabel="Billing-cycle start date" value={cycleStart || "Select billing-cycle start date"} placeholder={!cycleStart} onPress={() => setCyclePicker("start")} />
          <PickerField label="Cut-off" accessibilityLabel="Cut-off date" value={cycleCutoff || "Select cut-off date"} placeholder={!cycleCutoff} onPress={() => setCyclePicker("cutoff")} error={Boolean(cycleError)} />
          {cyclePicker ? <DateTimePicker value={new Date(`${(cyclePicker === "start" ? cycleStart : cycleCutoff) || today}T12:00:00`)} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={(event, date) => { if (event.type === "set" && date) { const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; if (cyclePicker === "start") setCycleStart(value); else setCycleCutoff(value); setCycleError(null); } if (Platform.OS !== "ios") setCyclePicker(null); }} /> : null}
          {cycleError ? <Banner tone="error">{cycleError}</Banner> : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button flex variant="ghost" label="Cancel" onPress={() => setEditingCycle(null)} />
            <Button flex label={cycleSaving ? "Saving..." : "Save cycle"} disabled={cycleSaving} onPress={() => { saveCycle().catch(() => {}); }} />
          </View>
        </FormCard>
      ) : null}
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
        onManageCycle={openCycleEditor}
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
