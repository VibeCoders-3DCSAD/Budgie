import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { v4 } from "../../../components/BudgieForm";
import { listFinancialAccounts, type FinancialAccount } from "../../../local-db/repositories/foundations/financialFoundations";
import { listDebtAccounts, type DebtAccount } from "../../../local-db/repositories/debts/debtAccounts";
import { listAllDebtPayments, type DebtPayment } from "../../../local-db/repositories/debts/debtPayments";
import { listCreditCardCycles, listCreditCardCycleTransactions, type CreditCardCycle, type CreditCardCycleTransaction } from "../../../local-db/repositories/credit-cards/creditCardCycles";
import { listCreditCardStatements, type CreditCardStatement } from "../../../local-db/repositories/credit-cards/creditCardStatements";
import { listCreditCardPayments, type CreditCardPayment } from "../../../local-db/repositories/credit-cards/creditCardPayments";
import { listCreditCardInstallments, type CreditCardInstallment } from "../../../local-db/repositories/credit-cards/creditCardInstallments";
import { listCreditCardStrategies, type CreditCardStrategy } from "../../../local-db/repositories/credit-cards/creditCardRepaymentPlans";
import { buildCreditCardForecast } from "../credit-cards/helpers/creditCardForecast";
import DebtOverviewSummary from "./DebtOverviewSummary";
import DebtPaymentTrend from "./DebtPaymentTrend";
import GlobalDebtTrend, { type GlobalDebtPoint } from "../forecast/components/GlobalDebtTrend";
import { buildDebtForecast, type DebtForecastStatus } from "../forecast/helpers/debtForecast";
import { getDebtTypeLabel } from "../debtTypes";
import { CARD_TINT, CardIcon, DebtTypeIcon, List, ListRow, SectionHeader, cardStrategyLabel, debtTypeTint, forecastStatusLabel, formatPeso, formatShortDate } from "./debtUi";
import { buildDebtManagerSummary, type DebtManagerSummary } from "../helpers/debtManagerSummary";
import { currentDebtTrendWindow } from "../forecast/helpers/debtTrendRange";
import { manilaToday } from "../../../lib/dates";
import { combineDebtBalanceSeries } from "../forecast/helpers/globalDebtForecast";
import { getAcceptedFinancialPlanForPeriod, getCurrentFinancialPlanPeriod, type AcceptedFinancialPlan } from "../../../local-db/repositories/financial-plans/financialPlans";
import { getDebtStrategy, listDebtPriorities, type DebtPriority, type DebtStrategy } from "../../../local-db/repositories/debts/debtRepaymentPlans";
import { allocateDebtRepayments, type DebtRepaymentAllocation } from "../helpers/debtRepaymentAllocation";
import { buildDebtSurplusCandidates, planDebtSurplus, type DebtSurplusPlan } from "../helpers/debtSurplusPlan";
import DebtRepaymentPlanCard from "./DebtRepaymentPlanCard";
import UpcomingPaymentsCard from "./UpcomingPaymentsCard";
import { buildFinancialPlanRepayments } from "../helpers/financialPlanRepayments";
import { buildUpcomingDebtPayments } from "../helpers/upcomingDebtPayments";

type Props = { userId: string; onOpenCreditCards: () => void; onOpenNonCreditDebts: () => void; onOpenCard?: (accountId: string) => void; onOpenDebt?: (debtId: string) => void };
type CardRow = { id: string; name: string; subtitle: string; debtCentavos: number; strategyLabel: string };

export default function DebtManagerOverview({ userId, onOpenCreditCards, onOpenNonCreditDebts, onOpenCard, onOpenDebt }: Props) {
  const [cards, setCards] = useState<FinancialAccount[] | null>(null);
  const [cycles, setCycles] = useState<CreditCardCycle[]>([]);
  const [transactions, setTransactions] = useState<CreditCardCycleTransaction[]>([]);
  const [statements, setStatements] = useState<CreditCardStatement[]>([]);
  const [payments, setPayments] = useState<CreditCardPayment[]>([]);
  const [installments, setInstallments] = useState<CreditCardInstallment[]>([]);
  const [strategies, setStrategies] = useState<CreditCardStrategy[]>([]);
  const [trendDebts, setTrendDebts] = useState<DebtAccount[]>([]);
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [financialPlan, setFinancialPlan] = useState<AcceptedFinancialPlan | null>(null);
  const [debtStrategy, setDebtStrategy] = useState<DebtStrategy>("avalanche");
  const [debtPriorities, setDebtPriorities] = useState<DebtPriority[]>([]);
  const today = manilaToday();
  const upcomingPayments = useMemo(() => {
    const { start, end } = currentDebtTrendWindow("month", undefined, new Date(`${today}T00:00:00Z`));
    return buildUpcomingDebtPayments({ periodStart: start, periodEnd: end, debts: trendDebts, creditCards: cards ?? [], creditCardCycles: cycles, creditCardCycleTransactions: transactions, creditCardStatements: statements, creditCardStrategies: strategies, creditCardPayments: payments, debtPayments }, today);
  }, [today, cards, cycles, debtPayments, payments, statements, strategies, transactions, trendDebts]);
  const overview = useMemo<{ debtBudgetCentavos: number; globalTrend: GlobalDebtPoint[]; summary: DebtManagerSummary; allocation: DebtRepaymentAllocation; surplusPlan: DebtSurplusPlan; creditCardBudgetCentavos: number; loanBudgetCentavos: number; cardRows: CardRow[]; debtStatuses: Map<string, DebtForecastStatus> }>(() => {
    const activeCards = cards ?? [];
    const asOfDate = manilaToday();
    const cardForecasts = activeCards.map((card) => ({ card, forecast: buildCreditCardForecast({ cycles: cycles.filter((cycle) => cycle.account_id === card.id), transactions: transactions.filter((transaction) => transaction.account_id === card.id), statements, strategy: strategies.find((strategy) => strategy.accountId === card.id), payments, installments: installments.filter((installment) => installment.account_id === card.id), availableCreditCentavos: card.creditCardDetails?.availableCreditCentavos ?? 0, creditLimitCentavos: card.creditCardDetails?.creditLimitCentavos ?? 0, billingCycleEndDay: card.creditCardDetails?.cutoffDay ?? null, reconciledAvailableCreditCentavos: card.creditCardDetails?.reconciledAvailableCreditCentavos, preReconciliationAvailableCreditCentavos: card.creditCardDetails?.preReconciliationAvailableCreditCentavos, availableCreditReconciledAt: card.creditCardDetails?.availableCreditReconciledAt, asOfDate }) }));
    const debtReservations = ((financialPlan?.recommendation.debtReservations as Array<{ debtAccountId?: string | null; creditCardStatementId?: string | null; amountCentavos?: number }> | undefined) ?? []);
    const reservationCentavos = (reservation: { amountCentavos?: number }) => typeof reservation.amountCentavos === "number" && Number.isSafeInteger(reservation.amountCentavos) ? Math.max(0, reservation.amountCentavos) : 0;
    const nonCreditDebtReservationCentavos = debtReservations.reduce((total, reservation) => total + (reservation.debtAccountId ? reservationCentavos(reservation) : 0), 0);
    const creditCardBudgetCentavos = debtReservations.reduce((total, reservation) => total + (reservation.creditCardStatementId ? reservationCentavos(reservation) : 0), 0);
    const planDebtSurplusCentavos = financialPlan?.recommendation.debtSurplusCentavos;
    const debtSurplusCentavos = typeof planDebtSurplusCentavos === "number" && Number.isSafeInteger(planDebtSurplusCentavos) ? Math.max(0, planDebtSurplusCentavos) : 0;
    const debtBudgetCentavos = debtReservations.reduce((total, reservation) => total + reservationCentavos(reservation), debtSurplusCentavos);
    const allocation = allocateDebtRepayments({ debts: trendDebts, debtBudgetCentavos: nonCreditDebtReservationCentavos, strategy: debtStrategy, priorities: debtPriorities });
    const surplusPlan = planDebtSurplus({
      candidates: buildDebtSurplusCandidates({ debts: trendDebts, debtPayments, cards: activeCards, cycles, statements, cardPayments: payments, reservations: debtReservations, period: getCurrentFinancialPlanPeriod(asOfDate), today: asOfDate }),
      surplusCentavos: debtSurplusCentavos, strategy: debtStrategy, priorities: debtPriorities,
    });
    const debtForecasts = trendDebts.map((debt) => ({ debt, forecast: buildDebtForecast(debt, asOfDate, debtPayments.filter((payment) => payment.debt_account_id === debt.id).map((payment) => ({ paymentDate: payment.payment_date, amountCentavos: payment.amount_centavos })), allocation.allocations.get(debt.id)) }));
    const cardSeries = cardForecasts.map(({ card, forecast }) => ({ points: forecast.points.map((point) => ({ date: point.date, balanceCentavos: Math.max(0, (card.creditCardDetails?.creditLimitCentavos ?? 0) - point.availableCreditCentavos) })) }));
    const debtSeries = debtForecasts.map(({ forecast }) => ({ points: forecast.points }));
    const globalTrend = combineDebtBalanceSeries([...cardSeries, ...debtSeries]).map((point) => ({ date: point.date, debtCentavos: point.balanceCentavos }));
    const cardSummaryItems = cardForecasts.map(({ card, forecast }) => ({ currentDebtCentavos: Math.max(0, (card.creditCardDetails?.creditLimitCentavos ?? 0) - (card.creditCardDetails?.availableCreditCentavos ?? 0)), state: forecast.status === "on_schedule" ? "on_track" as const : forecast.status })).filter((item) => item.currentDebtCentavos > 0);
    const debtSummaryItems = debtForecasts.map(({ debt, forecast }) => ({ currentDebtCentavos: debt.currentBalanceCentavos, state: forecast.status }));
    const debtNameById = new Map(trendDebts.map((debt) => [debt.id, debt.name]));
    const accountNameById = new Map(activeCards.map((card) => [card.id, card.name]));
    const accountIdByCycleId = new Map(cycles.map((cycle) => [cycle.id, cycle.account_id]));
    const recordedPayments = [...debtPayments.map((payment) => ({ paymentDate: payment.payment_date, debtName: debtNameById.get(payment.debt_account_id) ?? "Debt", amountCentavos: payment.amount_centavos })), ...payments.map((payment) => ({ paymentDate: payment.payment_date, debtName: accountNameById.get(accountIdByCycleId.get(payment.cycle_id) ?? "") ?? "Credit card", amountCentavos: payment.amount_centavos }))];
    const cardRows = activeCards.map((card) => {
      const cycleIds = new Set(cycles.filter((cycle) => cycle.account_id === card.id).map((cycle) => cycle.id));
      const statement = statements.filter((item) => item.authoritative && !item.deleted && cycleIds.has(item.cycle_id) && item.statement_date <= asOfDate).sort((left, right) => right.statement_date.localeCompare(left.statement_date))[0];
      const paidCentavos = statement ? payments.filter((payment) => payment.statement_id === statement.id).reduce((total, payment) => total + payment.amount_centavos, 0) : 0;
      const subtitle = !statement ? "No statement yet" : paidCentavos >= statement.statement_balance_centavos ? "Statement paid" : `Due ${formatShortDate(statement.due_date)}`;
      return { id: card.id, name: card.name, subtitle, debtCentavos: Math.max(0, (card.creditCardDetails?.creditLimitCentavos ?? 0) - (card.creditCardDetails?.availableCreditCentavos ?? 0)), strategyLabel: cardStrategyLabel(strategies.find((strategy) => strategy.accountId === card.id)?.strategy) };
    });
    const debtStatuses = new Map(debtForecasts.map(({ debt, forecast }) => [debt.id, forecast.status]));
    return { debtBudgetCentavos, globalTrend, summary: buildDebtManagerSummary([...cardSummaryItems, ...debtSummaryItems], recordedPayments, asOfDate), allocation, surplusPlan, creditCardBudgetCentavos, loanBudgetCentavos: nonCreditDebtReservationCentavos, cardRows, debtStatuses };
  }, [cards, cycles, debtPayments, debtPriorities, debtStrategy, financialPlan, installments, payments, strategies, statements, transactions, trendDebts]);

  async function load() { const today = manilaToday(); const period = getCurrentFinancialPlanPeriod(today); const [accounts, activeDebts, finishedDebts, cycleRows, transactionRows, statementRows, paymentRows, installmentRows, strategyRows, allDebtPayments, plan, strategy, priorities] = await Promise.all([listFinancialAccounts(userId, { kind: "credit_card", status: "active" }), listDebtAccounts(userId, "active"), listDebtAccounts(userId, "finished"), listCreditCardCycles(userId), listCreditCardCycleTransactions(userId), listCreditCardStatements(userId), listCreditCardPayments(userId), listCreditCardInstallments(userId), listCreditCardStrategies(userId), listAllDebtPayments(userId), getAcceptedFinancialPlanForPeriod(userId, period.start, period.end), getDebtStrategy(userId), listDebtPriorities(userId)]); setCards(accounts); setTrendDebts([...activeDebts, ...finishedDebts]); setDebtPayments(allDebtPayments); setCycles(cycleRows); setTransactions(transactionRows); setStatements(statementRows); setPayments(paymentRows); setInstallments(installmentRows); setStrategies(strategyRows); setFinancialPlan(plan); setDebtStrategy(strategy); setDebtPriorities(priorities); }
  useEffect(() => { load().catch(() => { setCards([]); }); }, [userId]);

  if (cards === null) return <ActivityIndicator color={v4.brand} />;

  const financialPlanRepayments = buildFinancialPlanRepayments({
    plan: financialPlan, period: getCurrentFinancialPlanPeriod(today), today,
    debts: trendDebts, cards, statements, cycles, debtPayments, cardPayments: payments,
  });

  const payoffDate = overview.globalTrend.find((point) => point.date >= today && point.debtCentavos <= 0)?.date;
  const loans = trendDebts.filter((debt) => debt.status !== "deleted");

  return <View style={{ gap: 14 }}>
    <DebtOverviewSummary summary={overview.summary} payoffDate={payoffDate} />
    <DebtRepaymentPlanCard strategy={debtStrategy} hasPlan={financialPlan !== null} debtBudgetCentavos={overview.debtBudgetCentavos} creditCardBudgetCentavos={overview.creditCardBudgetCentavos} loanBudgetCentavos={overview.loanBudgetCentavos} shortfallCentavos={overview.allocation.shortfallCentavos} surplusPlan={overview.surplusPlan} repayments={financialPlanRepayments} />

    <SectionHeader title="Credit cards" actionLabel="Manage" accessibilityLabel="Open Credit Cards" onAction={onOpenCreditCards} />
    <List>{overview.cardRows.length === 0
      ? <ListRow title="No credit cards yet" subtitle="Add a credit card to begin tracking billing cycles." icon={<CardIcon />} tint={CARD_TINT} onPress={onOpenCreditCards} accessibilityLabel="Manage credit cards" />
      : overview.cardRows.map((card, index) => <ListRow key={card.id} divider={index > 0} icon={<CardIcon />} tint={CARD_TINT} title={card.name} subtitle={card.subtitle} value={formatPeso(card.debtCentavos)} caption={card.strategyLabel} onPress={() => (onOpenCard ? onOpenCard(card.id) : onOpenCreditCards())} accessibilityLabel={`Open ${card.name}, ${formatPeso(card.debtCentavos)} owed`} />)}</List>

    <SectionHeader title="Loans and other debts" actionLabel="Manage" accessibilityLabel="Open Non Credit Card Debts" onAction={onOpenNonCreditDebts} />
    <List>{loans.length === 0
      ? <ListRow title="No loans yet" subtitle="Manage loans and other debts, including your repayment strategy." icon={<DebtTypeIcon type="custom_debt" />} tint={debtTypeTint("custom_debt")} onPress={onOpenNonCreditDebts} accessibilityLabel="Manage non-credit-card debts" />
      : loans.map((debt, index) => {
        const status = forecastStatusLabel(overview.debtStatuses.get(debt.id) ?? "not_scheduled");
        return <ListRow key={debt.id} divider={index > 0} icon={<DebtTypeIcon type={debt.type} />} tint={debtTypeTint(debt.type)} title={debt.name} subtitle={getDebtTypeLabel(debt.type)} value={formatPeso(debt.currentBalanceCentavos)} caption={status.label} captionTone={status.tone === "warn" ? "warn" : undefined} onPress={() => (onOpenDebt ? onOpenDebt(debt.id) : onOpenNonCreditDebts())} accessibilityLabel={`Open ${debt.name}, ${formatPeso(debt.currentBalanceCentavos)} remaining, ${status.label}`} />;
      })}</List>

    <UpcomingPaymentsCard payments={upcomingPayments} today={today} />

    <DebtPaymentTrend points={overview.summary.paymentTrend} />
    <GlobalDebtTrend points={overview.globalTrend} />
  </View>;
}
