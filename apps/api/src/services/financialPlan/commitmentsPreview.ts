import type { SupabaseClient } from "@supabase/supabase-js";
import { financialPlanPeriod } from "./period.js";
import { FinancialPlanUnavailableError } from "./errors.js";
import { DEBT_COMMITMENT_FIELDS, SAVINGS_COMMITMENT_FIELDS, debtCommitments, savingsCommitments, statementCommitments } from "./commitments.js";
import { scheduledPaymentReservations, type ScheduledPaymentRow } from "./scheduledPaymentDates.js";
export async function getFinancialPlanCommitments(userId: string, supabase: SupabaseClient, planMonth?: string) {
  const period = financialPlanPeriod(planMonth);
  const results = await Promise.all([
    supabase.from("debt_accounts").select(DEBT_COMMITMENT_FIELDS).eq("user_id", userId).in("status", ["active", "paid_off"]).eq("deleted", false).limit(100),
    supabase.from("savings_goals").select(SAVINGS_COMMITMENT_FIELDS).eq("user_id", userId).eq("status", "active").eq("deleted", false).limit(100),
    supabase.from("credit_card_statements").select("id, minimum_due_centavos, due_date").eq("user_id", userId).eq("authoritative", true).eq("deleted", false).gte("due_date", period.start).lte("due_date", period.end).limit(100),
    supabase.from("scheduled_payments").select("id, name, amount_centavos, frequency, due_day_of_month, due_second_day_of_month, due_day_of_week, due_month, starts_on, ends_on").eq("user_id", userId).eq("status", "active").eq("deleted", false).limit(200),
  ]);
  if (results.some((result) => result.error)) throw new FinancialPlanUnavailableError("Commitments could not be loaded");
  return {
    period,
    debtReservations: [...debtCommitments((results[0]!.data ?? []) as unknown as Parameters<typeof debtCommitments>[0], period), ...statementCommitments((results[2]!.data ?? []) as unknown as Parameters<typeof statementCommitments>[0])],
    savingsReservations: savingsCommitments((results[1]!.data ?? []) as unknown as Parameters<typeof savingsCommitments>[0], period),
    obligations: scheduledPaymentReservations((results[3]!.data ?? []) as ScheduledPaymentRow[], period)
      .map((reservation) => ({ ...reservation, label: ((results[3]!.data ?? []) as Array<{ id: string; name: string }>).find((payment) => payment.id === reservation.scheduledPaymentId)?.name })),
  };
}
