import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ArrowCounterClockwise, Archive, PencilSimple, Plus, TrashSimple } from "phosphor-react-native";
import { AmountHero, Banner, FormCard, Note, styles as ui, v4 } from "../../../../components/BudgieForm";
import KebabMenu, { type KebabAction } from "../../../../components/KebabMenu";
import { archiveDebtAccount, markDebtAccountDeleted, restoreDebtAccount, type DebtAccount } from "../../../../local-db/repositories/debts/debtAccounts";
import { deleteTransactionDebtPayment, listDebtPayments, type DebtPayment } from "../../../../local-db/repositories/debts/debtPayments";
import { getDebtPaymentProgress, getDebtRepaymentForecast } from "../../forecast/helpers/debtForecast";
import { INTEREST_PERIOD_OPTIONS } from "../../debtTypes";
import { Button, FLUSH_LIST, InfoRow, LinkButton, Pill, Pills, ProgressBar, formatPeso as money, formatShortDate, type Tone } from "../../components/debtUi";
import { TourTarget } from "../../../onboarding-tour/components/TourTarget";

const PAYMENT_LIMIT = 3;

type Props = {
  userId: string;
  deviceId: string;
  debt: DebtAccount;
  onEdit: (debt: DebtAccount) => void;
  onRecordPayment: (debtId: string) => void;
  onEditPayment: (payment: DebtPayment) => void;
  onChanged: () => void;
};

const STATUS_PILLS: Record<DebtAccount["status"], { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "ok" },
  archived: { label: "Archived", tone: "neutral" },
  paid_off: { label: "Paid off", tone: "ok" },
  deleted: { label: "Deleted", tone: "err" },
};

function progressPill(debt: DebtAccount, payments: DebtPayment[] | null): { label: string; tone: Tone } | null {
  if (debt.status === "paid_off") return null;
  const progress = payments === null ? debt.progress : getDebtPaymentProgress(debt, payments.map((payment) => ({ paymentDate: payment.payment_date, amountCentavos: payment.amount_centavos })));
  if (progress === "ahead") return { label: "Ahead", tone: "ok" };
  if (progress === "on_schedule") return { label: "On Schedule", tone: "ok" };
  if (progress === "behind") return { label: "Behind", tone: "warn" };
  if (progress === "finished") return null;
  return { label: "No payments yet", tone: "neutral" };
}
function repaymentLabel(status: ReturnType<typeof getDebtRepaymentForecast>["status"]) { const label = status.replaceAll("_", " "); return label.charAt(0).toUpperCase() + label.slice(1); }
function interestLabel(debt: DebtAccount): string {
  if (debt.interestMethod === "no_interest" || debt.annualInterestRateBps <= 0) return "No interest";
  const period = INTEREST_PERIOD_OPTIONS.find((option) => option.value === debt.interestPeriod)?.label.toLowerCase();
  return `${(debt.annualInterestRateBps / 100).toLocaleString("en-PH", { maximumFractionDigits: 2 })}%${period && period !== "none" ? ` ${period}` : ""}`;
}

export default function NonCreditDebtCard({ userId, deviceId, debt, onEdit, onRecordPayment, onEditPayment, onChanged }: Props) {
  const [payments, setPayments] = useState<DebtPayment[] | null>(null);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(null);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const finished = debt.status === "paid_off";
  const deleted = debt.status === "deleted";
  const archived = debt.status === "archived";

  function loadPayments() { listDebtPayments(userId, debt.id).then(setPayments).catch(() => setPayments([])); }
  useEffect(() => { setShowAllPayments(false); loadPayments(); }, [debt.id, userId]);

  async function changeDebt(action: "archive" | "delete" | "restore") {
    try {
      if (action === "archive") await archiveDebtAccount(userId, deviceId, debt.id);
      else if (action === "restore") await restoreDebtAccount(userId, deviceId, debt.id);
      else await markDebtAccountDeleted(userId, deviceId, debt.id);
      setConfirming(null);
      onChanged();
    } catch { setMessage("Your debt changes could not be completed. Review the debt details and try again."); }
  }

  const visiblePayments = showAllPayments ? payments : payments?.slice(0, PAYMENT_LIMIT);
  const forecast = getDebtRepaymentForecast(debt);
  const paidCentavos = Math.max(0, debt.originalBalanceCentavos - debt.currentBalanceCentavos);
  const status = STATUS_PILLS[debt.status];
  const progress = progressPill(debt, payments);
  const actions: KebabAction[] = deleted ? [] : [
    ...(!finished && !archived ? [{ label: "Edit debt", icon: <PencilSimple size={17} color={v4.ink2} />, onClick: () => onEdit(debt) }] : []),
    archived
      ? { label: "Restore", icon: <ArrowCounterClockwise size={17} color={v4.ink2} />, onClick: () => { changeDebt("restore").catch(() => {}); } }
      : { label: "Archive", icon: <Archive size={17} color={v4.ink2} />, onClick: () => setConfirming("archive") },
    { label: "Delete", icon: <TrashSimple size={17} color={v4.error} />, onClick: () => setConfirming("delete") },
  ];

  return <View style={{ gap: 14 }}>
    <TourTarget id="debt-balance" fill><AmountHero label="BALANCE LEFT" amountCentavos={debt.currentBalanceCentavos} detail={debt.lenderName ?? "No lender listed"} /></TourTarget>

    <TourTarget id="debt-summary" fill>
    <FormCard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}><Pills><Pill label={status.label} tone={status.tone} />{progress ? <Pill label={progress.label} tone={progress.tone} /> : null}</Pills></View>
        {actions.length ? <KebabMenu actions={actions} /> : null}
      </View>
      {debt.originalBalanceCentavos > 0 ? <ProgressBar label="Paid off" valueLabel={`${money(paidCentavos)} of ${money(debt.originalBalanceCentavos)}`} ratio={paidCentavos / debt.originalBalanceCentavos} /> : null}
      <InfoRow label="Next payment" value={debt.nextDueDate && !finished ? `${money(debt.minimumPaymentCentavos)} on ${formatShortDate(debt.nextDueDate)}` : "Not scheduled"} />
      <InfoRow label="Repayment forecast" value={repaymentLabel(forecast.status)} tone={forecast.status === "underpaid" ? "warn" : undefined} />
      <InfoRow label="Estimated payoff" value={forecast.estimatedPayoffDate ? formatShortDate(forecast.estimatedPayoffDate) : "Not scheduled"} />
      <InfoRow label="Interest rate" value={interestLabel(debt)} />
      <InfoRow label="Lender" value={debt.lenderName ?? "No lender listed"} />
      {message ? <Banner tone="error">{message}</Banner> : null}
      {confirming ? <View style={{ gap: 10 }}>
        <Banner tone={confirming === "delete" ? "error" : "warn"}>{confirming === "delete" ? `Delete ${debt.name}? It moves to Deleted and leaves your plans.` : `Archive ${debt.name}? It leaves active planning, and its history is kept.`}</Banner>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button flex variant="ghost" label="Cancel" onPress={() => setConfirming(null)} />
          <Button flex variant={confirming === "delete" ? "danger" : "primary"} label={confirming === "delete" ? "Confirm delete" : "Confirm archive"} onPress={() => { changeDebt(confirming).catch(() => {}); }} />
        </View>
      </View> : null}
    </FormCard>
    </TourTarget>

    {archived ? <Button label="Restore to active planning" accessibilityLabel={`Restore ${debt.name} to active planning`} icon={<ArrowCounterClockwise size={17} color="#FFFFFF" weight="bold" />} onPress={() => { changeDebt("restore").catch(() => {}); }} /> : null}
    {!finished && !archived && !deleted ? <TourTarget id="debt-record-payment" fill><Button label="Record payment" accessibilityLabel={`Record payment for ${debt.name}`} icon={<Plus size={17} color="#FFFFFF" weight="bold" />} onPress={() => onRecordPayment(debt.id)} /></TourTarget> : null}

    <TourTarget id="debt-payments" fill>
    <FormCard title="Payments" right={<Note>{payments === null ? "Loading..." : `${payments.length} recorded`}</Note>}>
      {payments !== null && payments.length === 0 ? <Note>No payments recorded yet.</Note> : null}
      {visiblePayments?.length ? <View style={FLUSH_LIST}>{visiblePayments.map((payment, index) => <View key={payment.id} style={index > 0 ? ui.listRowDivider : null}>
        <View style={[ui.listRow, { paddingRight: 4 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit payment on ${payment.payment_date}`} onPress={() => onEditPayment(payment)} style={[ui.listRowMain, { paddingRight: 4 }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={ui.listTitle}>{formatShortDate(payment.payment_date)}</Text>
              <Text style={ui.listSubtitle}>Tap to edit the linked transaction</Text>
            </View>
            <Text style={[ui.listTitle, { fontWeight: "700", fontVariant: ["tabular-nums"] }]}>{money(payment.amount_centavos)}</Text>
          </Pressable>
          <KebabMenu actions={[
            { label: "Edit payment", icon: <PencilSimple size={17} color={v4.ink2} />, onClick: () => onEditPayment(payment) },
            { label: "Delete", icon: <TrashSimple size={17} color={v4.error} />, onClick: () => setConfirmingPaymentId(payment.id) },
          ]} />
        </View>
        {confirmingPaymentId === payment.id ? <View style={{ gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
          <Banner tone="error">Delete this payment and its related transaction?</Banner>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button flex variant="ghost" label="Cancel" onPress={() => setConfirmingPaymentId(null)} />
            <Button flex variant="danger" label={deletingPaymentId === payment.id ? "Deleting..." : "Confirm delete"} accessibilityLabel={`Delete payment on ${payment.payment_date}`} disabled={deletingPaymentId === payment.id} onPress={() => { setDeletingPaymentId(payment.id); deleteTransactionDebtPayment(userId, deviceId, payment.id).then(() => { setConfirmingPaymentId(null); loadPayments(); onChanged(); }).catch(() => setMessage("Your debt payment could not be completed. Review the payment details and try again.")).finally(() => setDeletingPaymentId(null)); }} />
          </View>
        </View> : null}
      </View>)}</View> : null}
      {payments !== null && payments.length > PAYMENT_LIMIT ? <LinkButton label={showAllPayments ? "Show fewer payments" : `Load ${payments.length - PAYMENT_LIMIT} more payment${payments.length - PAYMENT_LIMIT === 1 ? "" : "s"}`} accessibilityLabel={`Show ${showAllPayments ? "fewer" : "all"} payments for ${debt.name}`} onPress={() => setShowAllPayments((current) => !current)} /> : null}
    </FormCard>
    </TourTarget>
  </View>;
}
