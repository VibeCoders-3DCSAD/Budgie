import { FinancialPlanInputError } from "./errors.js";
import { scheduledReservationDates } from "./commitmentSchedule.js";

export const DEBT_COMMITMENT_FIELDS = "id, status, paid_off_at, current_balance_centavos, minimum_payment_centavos, payment_frequency, payment_schedule, next_due_date, annual_interest_rate_bps, allows_extra_payments, updated_at";
export const SAVINGS_COMMITMENT_FIELDS = "id, planned_contribution_amount_centavos, contribution_frequency, contribution_interval_count, contribution_day_of_month, contribution_second_day_of_month, custom_interval_days, next_contribution_date, is_emergency_fund, target_amount_centavos, current_amount_centavos, updated_at";
type Period = { start: string; end: string };
type Debt = { id: string; status?: string; paid_off_at?: string | null; current_balance_centavos: number; minimum_payment_centavos: number; next_due_date: string | null; payment_frequency: string; payment_schedule: { semiMonthlyDays?: [number, number]; customIntervalDays?: number; dayOfMonth?: number } | null };
type Goal = { id: string; planned_contribution_amount_centavos: number | null; next_contribution_date: string | null; contribution_frequency: string | null; contribution_day_of_month: number | null; contribution_second_day_of_month: number | null; contribution_interval_count: number | null; custom_interval_days: number | null };
export type Commitment = { debtAccountId?: string | null; creditCardStatementId?: string | null; savingsGoalId?: string | null; scheduledPaymentId?: string | null; dueDate: string; amountCentavos: number };
export type CommitmentBudget = { key: string; amountCentavos: number };

export function commitmentKey(row: Commitment): string {
  return `${row.debtAccountId ? `debt:${row.debtAccountId}` : row.creditCardStatementId ? `statement:${row.creditCardStatementId}` : row.scheduledPaymentId ? `scheduled:${row.scheduledPaymentId}` : `savings:${row.savingsGoalId}`}:${row.dueDate}`;
}

// A debt paid off during the period keeps its payments in the plan, like any other occurrence already paid.
function paidOffInPeriod(debt: Debt, period: Period): boolean {
  return debt.status === "paid_off" && !!debt.paid_off_at && debt.paid_off_at.slice(0, 10) >= period.start;
}

export function debtCommitments(debts: Debt[], period: Period): Commitment[] {
  return debts.flatMap((debt) => debt.current_balance_centavos > 0 || paidOffInPeriod(debt, period) ? scheduledReservationDates(debt.next_due_date, debt.payment_frequency, period, debt.payment_schedule ?? {}).map((dueDate) => ({ debtAccountId: debt.id, creditCardStatementId: null, amountCentavos: debt.current_balance_centavos > 0 ? Math.min(debt.current_balance_centavos, debt.minimum_payment_centavos) : debt.minimum_payment_centavos, dueDate })) : []);
}

// A goal saved more than once a month is one commitment for the month's total, due on its first contribution.
export function savingsCommitments(goals: Goal[], period: Period): Commitment[] {
  return goals.flatMap((goal) => {
    if ((goal.planned_contribution_amount_centavos ?? 0) <= 0) return [];
    const dates = scheduledReservationDates(goal.next_contribution_date, goal.contribution_frequency, period, { dayOfMonth: goal.contribution_day_of_month, intervalCount: goal.contribution_interval_count, customIntervalDays: goal.custom_interval_days, semiMonthlyDays: goal.contribution_day_of_month != null && goal.contribution_second_day_of_month != null ? [goal.contribution_day_of_month, goal.contribution_second_day_of_month] : null });
    return dates.length ? [{ savingsGoalId: goal.id, amountCentavos: goal.planned_contribution_amount_centavos! * dates.length, dueDate: dates[0]! }] : [];
  });
}

// A plan covers the whole month, so a statement keeps its full minimum due even after it is paid.
export function statementCommitments(statements: { id: string; minimum_due_centavos: number; due_date: string }[]): Commitment[] {
  return statements.flatMap((statement) => statement.minimum_due_centavos > 0 ? [{ debtAccountId: null, creditCardStatementId: statement.id, amountCentavos: statement.minimum_due_centavos, dueDate: statement.due_date }] : []);
}

export function applyCommitmentBudgets<T extends Commitment>(rows: T[], budgets: CommitmentBudget[]): T[] {
  const amounts = new Map(budgets.map((budget) => [budget.key, budget.amountCentavos]));
  return rows.map((row) => ({ ...row, amountCentavos: amounts.get(commitmentKey(row)) ?? row.amountCentavos }));
}

export function validateCommitmentBudgets(value: unknown): CommitmentBudget[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) throw new FinancialPlanInputError("Commitment budgets are invalid");
  const budgets = value.map((row): CommitmentBudget => {
    if (!row || typeof row !== "object" || typeof row.key !== "string" || row.key.length > 180 || !/^(debt|statement|savings|scheduled):[^:]+:\d{4}-\d{2}-\d{2}$/.test(row.key) || !Number.isSafeInteger(row.amountCentavos) || row.amountCentavos < 0 || row.amountCentavos > 100_000_000_000) throw new FinancialPlanInputError("Commitment budget is invalid");
    return { key: row.key, amountCentavos: row.amountCentavos };
  });
  if (new Set(budgets.map((row) => row.key)).size !== budgets.length) throw new FinancialPlanInputError("Duplicate commitment budgets");
  return budgets;
}

