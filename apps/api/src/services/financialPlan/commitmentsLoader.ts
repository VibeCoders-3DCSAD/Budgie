import type { SupabaseClient } from "@supabase/supabase-js";
import { financialPlanPeriod } from "./period.js";
import { FinancialPlanUnavailableError } from "./errors.js";
import { readAllPages } from "./historyQueries.js";
import { DEBT_COMMITMENT_FIELDS, SAVINGS_COMMITMENT_FIELDS, debtCommitments, savingsCommitments, statementCommitments } from "./commitments.js";
import { scheduledPaymentReservations, type ScheduledPaymentRow } from "./scheduledPaymentDates.js";

type Period = { start: string; end: string };
type ScheduledPayment = ScheduledPaymentRow & { name: string; subcategory_id: string | null };

const SCHEDULED_PAYMENT_COMMITMENT_FIELDS = "id, name, subcategory_id, amount_centavos, frequency, due_day_of_month, due_second_day_of_month, due_day_of_week, due_month, starts_on, ends_on";

// The rows behind a period's commitments. Each result keeps its error so callers can report the failing source.
// Every list is read in full, page by page in id order: a missing row would leave its payment unreserved.
export async function queryCommitmentRows(supabase: SupabaseClient, userId: string, period: Period) {
  const [debts, savingsGoals, statements, scheduledPayments] = await Promise.all([
    readAllPages((from, to) => supabase.from("debt_accounts").select(DEBT_COMMITMENT_FIELDS).eq("user_id", userId).in("status", ["active", "paid_off"]).eq("deleted", false).order("id").range(from, to)),
    readAllPages((from, to) => supabase.from("savings_goals").select(SAVINGS_COMMITMENT_FIELDS).eq("user_id", userId).eq("status", "active").eq("deleted", false).order("id").range(from, to)),
    readAllPages((from, to) => supabase.from("credit_card_statements").select("id, minimum_due_centavos, due_date").eq("user_id", userId).eq("authoritative", true).eq("deleted", false).gte("due_date", period.start).lte("due_date", period.end).order("id").range(from, to)),
    readAllPages((from, to) => supabase.from("scheduled_payments").select(SCHEDULED_PAYMENT_COMMITMENT_FIELDS).eq("user_id", userId).eq("status", "active").eq("deleted", false).order("id").range(from, to)),
  ]);
  return { debts, savingsGoals, statements, scheduledPayments };
}

export type CommitmentRows = Awaited<ReturnType<typeof queryCommitmentRows>>;

// Every debt, statement, savings and biller payment due in the period, at its full amount.
export function dueCommitments(rows: CommitmentRows, period: Period) {
  const scheduledPayments = (rows.scheduledPayments.data ?? []) as unknown as ScheduledPayment[];
  const scheduledPaymentById = new Map(scheduledPayments.map((payment) => [payment.id, payment]));
  return {
    debts: debtCommitments((rows.debts.data ?? []) as unknown as Parameters<typeof debtCommitments>[0], period),
    statements: statementCommitments((rows.statements.data ?? []) as unknown as Parameters<typeof statementCommitments>[0]),
    savings: savingsCommitments((rows.savingsGoals.data ?? []) as unknown as Parameters<typeof savingsCommitments>[0], period),
    obligations: scheduledPaymentReservations(scheduledPayments, period).map((reservation) => {
      const payment = scheduledPaymentById.get(reservation.scheduledPaymentId);
      return { ...reservation, label: payment?.name, subcategoryId: payment?.subcategory_id };
    }),
    scheduledPayments,
  };
}

export async function getFinancialPlanCommitments(userId: string, supabase: SupabaseClient, planMonth?: string) {
  const period = financialPlanPeriod(planMonth);
  const rows = await queryCommitmentRows(supabase, userId, period);
  if (Object.values(rows).some((result) => result.error)) throw new FinancialPlanUnavailableError("Commitments could not be loaded");
  const due = dueCommitments(rows, period);
  return {
    period,
    debtReservations: [...due.debts, ...due.statements],
    savingsReservations: due.savings,
    obligations: due.obligations,
  };
}
