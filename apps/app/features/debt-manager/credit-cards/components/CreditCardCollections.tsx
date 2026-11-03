import React, { useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Platform, Text, View } from "react-native";
import { Banner, FormCard, Note, PickerField, TextField, v4, v4Font } from "../../../../components/BudgieForm";
import type { CreditCardCycle, CreditCardCycleTransaction } from "../../../../local-db/repositories/credit-cards/creditCardCycles";
import type { CreditCardStatement } from "../../../../local-db/repositories/credit-cards/creditCardStatements";
import type { CreditCardInstallment } from "../../../../local-db/repositories/credit-cards/creditCardInstallments";
import type { FinancialAccount } from "../../../../local-db/repositories/foundations/financialFoundations";
import { calculateCreditCardPaymentStatus, creditBalanceCentavos, deleteStatementPayment, type CreditCardPayment, type StatementPaymentContext } from "../../../../local-db/repositories/credit-cards/creditCardPayments";
import { requestCreditCardSettlement, type CreditCardSettlement } from "../../../../local-db/repositories/credit-cards/creditCardSettlements";
import { manilaToday } from "../../../../lib/dates";
import CreditCardStatementForm from "./CreditCardStatementForm";
import { Button, Divider, InfoRow, LinkButton, List, ListRow, Pill, Pills, SectionHeader, formatPeso, formatShortDate, type Tone } from "../../components/debtUi";

type CycleListProps = { userId: string; deviceId: string; account: FinancialAccount; cycles: CreditCardCycle[]; transactions: CreditCardCycleTransaction[]; statements: CreditCardStatement[]; payments: CreditCardPayment[]; statementCycle: CreditCardCycle | null; onManageCycle: (account: FinancialAccount, cycle: CreditCardCycle | null) => void; onAddStatement: (cycle: CreditCardCycle) => void; onCancelStatement: () => void; onStatementSaved: () => Promise<void>; onPayStatement?: (context: StatementPaymentContext) => void; onEditPayment?: (payment: CreditCardPayment) => void; today?: string };
type InstallmentListProps = { userId: string; deviceId: string; installments: CreditCardInstallment[]; settlements: CreditCardSettlement[]; onSaved: () => Promise<void>; today?: string };

function parse(value: string) { const normalized = value.trim().replace(/,/g, ""); if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null; const [whole, fraction = ""] = normalized.split("."); const result = Number(whole) * 100 + Number((fraction + "00").slice(0, 2)); return Number.isSafeInteger(result) ? result : null; }

const PAYMENT_STATUS: Record<ReturnType<typeof calculateCreditCardPaymentStatus>, { label: string; tone: Tone; banner: "info" | "warn" | "error"; message: string }> = {
  fully_paid: { label: "Fully paid", tone: "ok", banner: "info", message: "This statement is fully paid. No remaining statement balance is currently recorded." },
  minimum_satisfied: { label: "Minimum met", tone: "warn", banner: "warn", message: "The minimum payment is satisfied, but the remaining balance may incur finance charges." },
  partially_paid: { label: "Below minimum", tone: "err", banner: "error", message: "This statement is not fully paid and the minimum amount due is not yet satisfied. Review the remaining payment." },
};

type CycleCardProps = { account: FinancialAccount; cycle: CreditCardCycle; current: boolean; transactions: CreditCardCycleTransaction[]; statement?: CreditCardStatement; payment?: CreditCardPayment; props: CycleListProps; today: string };

function CycleCard({ account, cycle, current, transactions, statement, payment, props, today }: CycleCardProps) {
  const pending = cycle.cutoff_date < today && !statement;
  const [expanded, setExpanded] = useState(current || pending);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const estimatedBalanceCentavos = transactions.filter((item) => item.transaction_date <= cycle.cutoff_date).reduce((total, item) => total + item.amount_centavos, 0);
  const paymentStatus = statement && payment ? PAYMENT_STATUS[calculateCreditCardPaymentStatus(payment.amount_centavos, statement.statement_balance_centavos, statement.minimum_due_centavos)] : null;

  return <FormCard title={current ? "Current billing cycle" : "Billing cycle"} right={<LinkButton label="Edit" accessibilityLabel={`Edit billing cycle for ${account.name}`} onPress={() => props.onManageCycle(account, cycle)} />}>
    <Text style={{ fontFamily: v4Font, fontSize: 12, color: v4.ink2, marginTop: -6 }}>{formatShortDate(cycle.cycle_start_date)} to {formatShortDate(cycle.cutoff_date)}</Text>
    <Pills>
      {statement ? <Pill label="Statement recorded" tone="ok" /> : <Pill label={pending ? "Statement pending" : "Estimate"} tone="warn" />}
      {statement ? paymentStatus ? <Pill label={paymentStatus.label} tone={paymentStatus.tone} /> : <Pill label="Unpaid" tone="neutral" /> : null}
    </Pills>
    <InfoRow label={statement ? "Statement balance" : "Estimated balance"} value={formatPeso(statement ? statement.statement_balance_centavos : estimatedBalanceCentavos)} />
    {expanded ? <>
      {statement ? <>
        <InfoRow label="Minimum due" value={formatPeso(statement.minimum_due_centavos)} />
        <InfoRow label="Due date" value={formatShortDate(statement.due_date)} />
        <InfoRow label="Finance charges" value={formatPeso(statement.finance_charge_centavos)} />
      </> : null}
      <InfoRow label="Cycle start" value={formatShortDate(cycle.cycle_start_date)} />
      <InfoRow label="Cut-off" value={formatShortDate(cycle.cutoff_date)} />
      <InfoRow label="Statement date" value={statement ? formatShortDate(statement.statement_date) : cycle.statement_date ? formatShortDate(cycle.statement_date) : "Not recorded"} />

      {statement && payment && paymentStatus ? <>
        <Divider />
        <InfoRow label="Paid" value={formatPeso(payment.amount_centavos)} tone="ok" />
        <InfoRow label="Remaining" value={formatPeso(Math.max(0, statement.statement_balance_centavos - payment.amount_centavos))} />
        <Banner tone={paymentStatus.banner}>{paymentStatus.message}</Banner>
        {creditBalanceCentavos(payment.amount_centavos, statement.statement_balance_centavos) > 0 ? <Note>This payment created a credit balance. Apply it only when confirmed.</Note> : null}
        {confirmingDelete ? <View style={{ gap: 8 }}>
          <Banner tone="error">Deleting this payment removes it from the statement history and reverses its related transaction. Cancel to keep it or confirm deletion to continue.</Banner>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button flex variant="ghost" label="Cancel" onPress={() => setConfirmingDelete(false)} />
            <Button flex variant="danger" label="Confirm delete" onPress={() => { deleteStatementPayment(props.userId, props.deviceId, payment.id).then(props.onStatementSaved).finally(() => setConfirmingDelete(false)); }} />
          </View>
        </View> : <View style={{ flexDirection: "row", gap: 18 }}>
          <LinkButton label="Edit payment" accessibilityLabel={`Edit payment for ${account.name}`} onPress={() => props.onEditPayment?.(payment)} />
          <LinkButton label="Delete payment" tone="err" accessibilityLabel={`Delete payment for ${account.name}`} onPress={() => setConfirmingDelete(true)} />
        </View>}
      </> : null}
      {statement && !payment ? <Button label="Pay statement" accessibilityLabel={`Pay statement for ${account.name}`} onPress={() => props.onPayStatement?.({ statementId: statement.id, cycleId: cycle.id })} /> : null}

      {!statement ? <Banner tone="warn">This statement balance is an estimate. Record the bank-provided statement when it is available.</Banner> : null}
      {pending ? <>
        <Note>Have you received the statement for this billing cycle?</Note>
        <Button variant="ghost" label="Add statement" onPress={() => props.onAddStatement(cycle)} />
        {props.statementCycle?.id === cycle.id ? <CreditCardStatementForm userId={props.userId} deviceId={props.deviceId} cycleId={cycle.id} cycleCutoffDate={cycle.cutoff_date} today={today} onCancel={props.onCancelStatement} onSaved={props.onStatementSaved} /> : null}
      </> : null}

      <Divider />
      <Text style={{ fontFamily: v4Font, fontSize: 12.5, fontWeight: "800", color: v4.ink }}>Purchases · {transactions.length}</Text>
      {transactions.length === 0 ? <Note>No purchases recorded in this billing cycle.</Note> : <List flush>{transactions.map((item, index) => <ListRow
        key={item.transaction_id}
        divider={index > 0}
        title={item.merchant_name ?? "Credit-card purchase"}
        subtitle={`${item.transaction_date} · ${item.purchase_type === "installment" ? "Installment purchase" : "Regular purchase"}`}
        value={formatPeso(item.amount_centavos)}
      />)}</List>}
    </> : null}
    {!current && !pending ? <LinkButton label={expanded ? "Hide details" : "Show details"} accessibilityLabel={`${expanded ? "Hide" : "Show"} billing cycle ${cycle.cycle_start_date} to ${cycle.cutoff_date}`} onPress={() => setExpanded((value) => !value)} /> : null}
  </FormCard>;
}

const CYCLES_PER_PAGE = 3;

// The card's billing cycles, newest first, with the current one on top.
export function CreditCardCycleList(props: CycleListProps) {
  const { account, cycles, transactions, statements, payments, today = manilaToday() } = props;
  const [visibleCount, setVisibleCount] = useState(CYCLES_PER_PAGE);
  const accountCycles = cycles.filter((cycle) => cycle.account_id === account.id);
  const currentId = (accountCycles.find((cycle) => cycle.cycle_start_date <= today && cycle.cutoff_date >= today) ?? (accountCycles.length === 1 ? accountCycles[0] : undefined))?.id;
  const ordered = accountCycles.slice().sort((left, right) => Number(right.id === currentId) - Number(left.id === currentId) || right.cutoff_date.localeCompare(left.cutoff_date));
  return <View style={{ gap: 12 }}>
    <SectionHeader title="Billing cycles" />
    {ordered.length === 0 ? <Note>No billing cycle is recorded for this card yet.</Note> : ordered.slice(0, visibleCount).map((cycle) => {
      const statement = statements.find((item) => item.cycle_id === cycle.id);
      return <CycleCard key={cycle.id} account={account} cycle={cycle} current={cycle.id === currentId} transactions={transactions.filter((item) => item.cycle_id === cycle.id)} statement={statement} payment={statement ? payments.find((item) => item.statement_id === statement.id) : undefined} props={props} today={today} />;
    })}
    {visibleCount < ordered.length ? <Button variant="ghost" label="Load More" onPress={() => setVisibleCount((count) => count + CYCLES_PER_PAGE)} /> : null}
  </View>;
}

export function CreditCardInstallmentList({ userId, deviceId, installments, settlements, onSaved, today = manilaToday() }: InstallmentListProps) {
  const [editing, setEditing] = useState<CreditCardInstallment | null>(null); const [amount, setAmount] = useState(""); const [principal, setPrincipal] = useState(""); const [fee, setFee] = useState(""); const [date, setDate] = useState(today); const [picker, setPicker] = useState(false); const [error, setError] = useState<string | null>(null);
  async function settle() { if (!editing) return; const settlementAmount = parse(amount); const remainingPrincipal = parse(principal); const settlementFee = fee ? parse(fee) : 0; if (!settlementAmount || remainingPrincipal === null || settlementFee === null) { setError("Some early-settlement details are not valid."); return; } try { await requestCreditCardSettlement(userId, deviceId, { installmentId: editing.id, settlementDate: date, remainingPrincipalCentavos: remainingPrincipal, settlementAmountCentavos: settlementAmount, preterminationFeeCentavos: settlementFee }); await onSaved(); setEditing(null); } catch { setError("Your early settlement could not be recorded."); } }
  if (installments.length === 0) return null;
  return <View style={{ gap: 12 }}>
    <SectionHeader title="Active installments" />
    {installments.map((item) => <FormCard key={item.id} title={item.description}>
      <InfoRow label="Remaining principal" value={formatPeso(item.remaining_principal_centavos)} />
      <InfoRow label="Monthly amortization" value={formatPeso(item.monthly_amortization_centavos)} />
      <InfoRow label="Months left" value={`${item.remaining_months} of ${item.term_months}`} />
      {settlements.filter((settlement) => settlement.installment_id === item.id).map((settlement) => <Note key={settlement.id}>Settlement {settlement.status}: {formatPeso(settlement.settlement_amount_centavos)} on {settlement.settlement_date}</Note>)}
      {item.settlement_status === "active" && editing?.id !== item.id ? <LinkButton label="Record early settlement" accessibilityLabel={`Record early settlement for ${item.description}`} onPress={() => { setEditing(item); setAmount(""); setPrincipal((item.remaining_principal_centavos / 100).toFixed(2)); setFee(""); setDate(today); setError(null); }} /> : null}
      {editing?.id === item.id ? <View style={{ gap: 10 }}>
        <Divider />
        <TextField label="Settlement amount" accessibilityLabel="Early settlement amount" value={amount} onChangeText={setAmount} placeholder="Enter settlement amount" keyboardType="decimal-pad" />
        <TextField label="Remaining principal" accessibilityLabel="Early settlement remaining principal" value={principal} onChangeText={setPrincipal} placeholder="Enter remaining principal" keyboardType="decimal-pad" />
        <TextField label="Pre-termination fee" accessibilityLabel="Pre-termination fee" value={fee} onChangeText={setFee} placeholder="Enter pre-termination fee" keyboardType="decimal-pad" />
        <PickerField label="Settlement date" accessibilityLabel="Select early settlement date" value={date} onPress={() => setPicker(true)} />
        {picker ? <DateTimePicker value={new Date(`${date}T12:00:00`)} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={(event, value) => { if (event.type === "set" && value) setDate(`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`); if (Platform.OS !== "ios") setPicker(false); }} /> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button flex variant="ghost" label="Cancel" onPress={() => setEditing(null)} />
          <Button flex label="Save settlement" accessibilityLabel="Save early settlement" onPress={() => { settle().catch(() => {}); }} />
        </View>
      </View> : null}
    </FormCard>)}
  </View>;
}
