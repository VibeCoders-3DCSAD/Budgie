import type { FinancialPlanReservation } from "../../../financial-plan/types";
import type { CommitmentPreview } from "../../../financial-plan/helpers/commitmentBudget";
import { monthDay } from "../seed/context";
import { planPeriod, type PracticeData } from "./practiceData";

type Row = Record<string, unknown>;

// Every debt, card statement, savings contribution, and bill due this month, at its full amount.
export function practiceCommitments(data: PracticeData): CommitmentPreview {
  const period = planPeriod(data.today);
  const inPeriod = (date: string) => date >= period.start && date <= period.end;
  const debtReservations: FinancialPlanReservation[] = [
    ...data.seed.debt_accounts.map((debt) => ({ debtAccountId: String(debt.id), creditCardStatementId: null, amountCentavos: Math.min(Number(debt.current_balance_centavos), Number(debt.minimum_payment_centavos)), dueDate: monthDay(period.start, dueDay(debt)) })),
    ...data.seed.credit_card_statements.filter((row) => inPeriod(String(row.due_date))).map((statement) => ({ debtAccountId: null, creditCardStatementId: String(statement.id), amountCentavos: Number(statement.statement_balance_centavos), dueDate: String(statement.due_date) })),
  ];
  const savingsReservations = data.seed.savings_goals.filter((goal) => Number(goal.planned_contribution_amount_centavos ?? 0) > 0).map((goal) => ({
    savingsGoalId: String(goal.id), amountCentavos: Number(goal.planned_contribution_amount_centavos), dueDate: monthDay(period.start, Number(goal.contribution_day_of_month)),
  }));
  const obligations = data.seed.scheduled_payments.map((payment) => ({
    scheduledPaymentId: String(payment.id), amountCentavos: Number(payment.amount_centavos), dueDate: monthDay(period.start, Number(payment.due_day_of_month)),
    label: String(payment.name), subcategoryId: payment.subcategory_id as string | null,
  }));
  return { period, debtReservations, savingsReservations, obligations };
}

function dueDay(debt: Row): number {
  const schedule = debt.payment_schedule as { dayOfMonth?: number } | undefined;
  return schedule?.dayOfMonth ?? Number(String(debt.next_due_date).slice(8, 10));
}
