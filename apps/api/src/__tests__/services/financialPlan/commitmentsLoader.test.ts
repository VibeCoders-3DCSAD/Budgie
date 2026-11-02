import type { SupabaseClient } from "@supabase/supabase-js";
import { getFinancialPlanCommitments } from "../../../services/financialPlan/commitmentsLoader.js";

it("scopes every preview read to its user and lists every commitment in the month at its full amount", async () => {
  const rows: Record<string, unknown[]> = {
    debt_accounts: [
      { id: "loan", status: "active", current_balance_centavos: 100_000, minimum_payment_centavos: 20_000, next_due_date: "2026-11-10", payment_frequency: "monthly", payment_schedule: {} },
      { id: "paid-this-month", status: "paid_off", paid_off_at: "2026-11-08T03:00:00Z", current_balance_centavos: 0, minimum_payment_centavos: 15_000, next_due_date: "2026-12-05", payment_frequency: "monthly", payment_schedule: {} },
      { id: "paid-last-month", status: "paid_off", paid_off_at: "2026-10-20T03:00:00Z", current_balance_centavos: 0, minimum_payment_centavos: 15_000, next_due_date: "2026-11-20", payment_frequency: "monthly", payment_schedule: {} },
    ],
    savings_goals: [{ id: "goal", planned_contribution_amount_centavos: 5_000, next_contribution_date: "2026-11-12", contribution_frequency: "weekly" }],
    credit_card_statements: [{ id: "statement", minimum_due_centavos: 10_000, due_date: "2026-11-20" }],
    scheduled_payments: [{ id: "rent", amount_centavos: 30_000, frequency: "monthly", due_day_of_month: 15, starts_on: "2026-01-15", ends_on: null }],
  };
  const queries: Array<{ eq: jest.Mock; in: jest.Mock; limit: jest.Mock }> = [];
  const client = { from: jest.fn((table: string) => {
    const query = { select: jest.fn(() => query), eq: jest.fn(() => query), in: jest.fn(() => query), gte: jest.fn(() => query), lte: jest.fn(() => query), limit: jest.fn(() => Promise.resolve({ data: rows[table], error: null })) };
    queries.push(query);
    return query;
  }) };
  const result = await getFinancialPlanCommitments("owner", client as unknown as SupabaseClient, "2026-11");
  // A debt paid off this month keeps the payment that cleared it; one paid off before the month has nothing left.
  expect(result.debtReservations.map((row) => [row.debtAccountId ?? row.creditCardStatementId, row.dueDate, row.amountCentavos])).toEqual([["loan", "2026-11-10", 20_000], ["paid-this-month", "2026-11-05", 15_000], ["statement", "2026-11-20", 10_000]]);
  expect(queries[0]!.in).toHaveBeenCalledWith("status", ["active", "paid_off"]);
  // Every weekly contribution in the month joins into one commitment due on the first.
  expect(result.savingsReservations).toEqual([{ savingsGoalId: "goal", amountCentavos: 20_000, dueDate: "2026-11-05" }]);
  expect(result.obligations).toEqual([{ scheduledPaymentId: "rent", amountCentavos: 30_000, dueDate: "2026-11-15" }]);
  for (const query of queries) {
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(query.eq).toHaveBeenCalledWith("deleted", false);
    expect(query.limit).toHaveBeenCalled();
  }
});
