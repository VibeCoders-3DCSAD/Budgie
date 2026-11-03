import { initDatabase } from "../../client";
import { addDays, dueDatesBetween, localToday, type PaymentSchedule } from "../../../features/billers/schedule";
import { buildUpcomingDebtPayments } from "../../../features/debt-manager/helpers/upcomingDebtPayments";
import { buildSavingsReminders } from "../../../features/dashboard/helpers/savingsReminders";
import type { DashboardReminder, DashboardReminderSection, DashboardReminders } from "../../../features/dashboard/types";
import { listDebtAccounts } from "../debts/debtAccounts";
import { listAllDebtPayments } from "../debts/debtPayments";
import { listAccountOptions, listFinancialAccounts } from "../foundations/financialFoundations";
import { listCreditCardCycles } from "../credit-cards/creditCardCycles";
import { listCreditCardStatements } from "../credit-cards/creditCardStatements";
import { listCreditCardPayments } from "../credit-cards/creditCardPayments";
import { listCreditCardStrategies } from "../credit-cards/creditCardRepaymentPlans";
import { listSavingsGoals } from "../savings/savingsGoals";
import { listSavingsGoalActivitiesByGoal } from "../savings/savingsGoalActivities";
import { listPersistedUnusualSpendings } from "../alerts/unusualSpending";
import { listScheduledPayments, scheduledPaymentPostIds } from "../scheduled-payments/scheduledPayments";
import { listPaidByOccurrence } from "../scheduled-payments/scheduledPaymentRecords";
import { recurringIncomePostIds } from "../foundations/recurringIncome";

type IncomeSchedule = PaymentSchedule & { id: string; sourceId: string; name: string; accountName: string; amountCentavos: number };

export async function listUpcomingIncome(userId: string, today: string, through: string): Promise<DashboardReminder[]> {
  const db = await initDatabase();
  const [schedules, occurrences, transactions] = await Promise.all([
    db.getAllAsync<IncomeSchedule>(`SELECT t.id, s.id AS sourceId, s.name, a.name AS accountName,
        t.amount_centavos AS amountCentavos, t.frequency, t.day_of_month AS dueDayOfMonth,
        t.second_day_of_month AS dueSecondDayOfMonth, t.day_of_week AS dueDayOfWeek,
        NULL AS dueMonth, t.starts_on AS startsOn, t.ends_on AS endsOn
      FROM recurring_transaction_templates t
      JOIN income_sources s ON s.recurring_template_id = t.id AND s.user_id = t.user_id AND s.deleted = 0 AND s.is_active = 1
      JOIN financial_accounts a ON a.id = t.destination_account_id AND a.user_id = t.user_id AND a.deleted = 0 AND a.status = 'active'
      WHERE t.user_id = ? AND t.deleted = 0 AND t.status = 'active' AND t.transaction_type = 'income'`, userId),
    db.getAllAsync<{ recurring_template_id: string; scheduled_date: string; status: string }>(`SELECT recurring_template_id, scheduled_date, status FROM recurring_transaction_occurrences WHERE user_id = ? AND scheduled_date BETWEEN ? AND ?`, userId, today, through),
    db.getAllAsync<{ id: string; recurring_template_id: string | null; transaction_date: string }>(`SELECT id, recurring_template_id, transaction_date FROM transactions WHERE user_id = ? AND transaction_date BETWEEN ? AND ?`, userId, today, through),
  ]);
  const posted = new Set(occurrences.filter((row) => row.status === "posted" || row.status === "skipped").map((row) => `${row.recurring_template_id}:${row.scheduled_date}`));
  const transactionIds = new Set(transactions.map((row) => row.id));
  for (const transaction of transactions) {
    if (transaction.recurring_template_id) posted.add(`${transaction.recurring_template_id}:${transaction.transaction_date}`);
  }
  return schedules.flatMap((schedule) => dueDatesBetween(schedule, today, through).flatMap((date) => {
    if (posted.has(`${schedule.id}:${date}`) || transactionIds.has(recurringIncomePostIds(schedule.id, date).transactionId)) return [];
    return [{ id: `income:${schedule.id}:${date}`, title: schedule.name, detail: `Expected income · ${schedule.accountName}`, amountCentavos: schedule.amountCentavos, date, target: { kind: "income" as const, id: schedule.sourceId } }];
  }));
}

export async function listBlockedAutoPosts(userId: string, today: string): Promise<DashboardReminder[]> {
  const db = await initDatabase();
  const [schedules, accounts, paid, records, transactions] = await Promise.all([
    listScheduledPayments(userId),
    listAccountOptions(userId),
    listPaidByOccurrence(userId),
    db.getAllAsync<{ id: string }>("SELECT id FROM scheduled_payment_records WHERE user_id = ? AND source = 'auto'", userId),
    db.getAllAsync<{ id: string }>("SELECT id FROM transactions WHERE user_id = ? AND client_mutation_id LIKE 'scheduled-payment:%'", userId),
  ]);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const recordIds = new Set(records.map((row) => row.id));
  const transactionIds = new Set(transactions.map((row) => row.id));
  return schedules.flatMap((schedule) => {
    const account = accountById.get(schedule.sourceAccountId);
    if (!schedule.autoPost || !schedule.autoPostFrom || !account || account.kind === "credit_card") return [];
    return dueDatesBetween(schedule, schedule.autoPostFrom, today).flatMap((date) => {
      const ids = scheduledPaymentPostIds(schedule.id, date);
      const amountCentavos = Math.max(0, schedule.amountCentavos - (paid.get(schedule.id)?.get(date) ?? 0));
      if (!amountCentavos || amountCentavos <= account.currentBalanceCentavos || recordIds.has(ids.recordId) || transactionIds.has(ids.transactionId)) return [];
      return [{ id: `biller:${schedule.id}:${date}`, title: schedule.name, detail: `Auto-post failed · ${account.name} has insufficient funds`, amountCentavos, date, target: { kind: "biller" as const, id: schedule.id } }];
    });
  });
}

// Only active credit cards have obligations, so the other accounts are never read.
async function listUpcomingDebt(userId: string, today: string, through: string): Promise<DashboardReminder[]> {
  const [debts, debtPayments, creditCards, creditCardCycles, creditCardStatements, creditCardPayments, creditCardStrategies] = await Promise.all([
    listDebtAccounts(userId), listAllDebtPayments(userId), listFinancialAccounts(userId, { kind: "credit_card", status: "active" }), listCreditCardCycles(userId), listCreditCardStatements(userId), listCreditCardPayments(userId), listCreditCardStrategies(userId),
  ]);
  const items: DashboardReminder[] = [];
  // Calculate each calendar month separately so payments from this month never cover next month's obligation.
  let periodStart = `${today.slice(0, 7)}-01`;
  while (periodStart <= through) {
    const nextMonth = new Date(`${periodStart}T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const nextStart = nextMonth.toISOString().slice(0, 10);
    const payments = buildUpcomingDebtPayments({ periodStart, periodEnd: addDays(nextStart, -1), debts, debtPayments, creditCards, creditCardCycles, creditCardStatements, creditCardPayments, creditCardStrategies, creditCardCycleTransactions: [] }, today);
    for (const payment of payments) {
      if (payment.dueDate < today || payment.dueDate > through) continue;
      items.push({ id: payment.id, title: payment.name, detail: payment.kind === "non_credit_card" ? "Debt repayment" : "Credit-card payment", amountCentavos: payment.remainingCentavos, date: payment.dueDate, target: { kind: payment.kind === "non_credit_card" ? "debt" : "credit_card", id: payment.accountId } });
    }
    periodStart = nextStart;
  }
  return items;
}

async function listUpcomingSavings(userId: string, today: string, through: string) {
  const goals = await listSavingsGoals(userId);
  const activities = await listSavingsGoalActivitiesByGoal(userId, goals.map((goal) => goal.id));
  return buildSavingsReminders(goals, activities, today, through);
}

async function listAttentionObservations(userId: string): Promise<DashboardReminder[]> {
  return (await listPersistedUnusualSpendings(userId)).filter((item) => item.recurrence === null).map((item) => ({ id: `observation:${item.transactionId}`, title: `Unusual ${item.subcategoryLabel} spending`, detail: "Will this be a frequent expense?", amountCentavos: item.amountCentavos, date: item.transactionDate, target: { kind: "observation", id: item.transactionId } }));
}

async function section(sources: Promise<DashboardReminder[]>[]): Promise<DashboardReminderSection> {
  const results = await Promise.allSettled(sources);
  return { items: results.flatMap((result) => result.status === "fulfilled" ? result.value : []).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)), unavailable: results.some((result) => result.status === "rejected") };
}

export async function getDashboardReminders(userId: string, today = localToday()): Promise<DashboardReminders> {
  const through = addDays(today, 7);
  const [attention, upcoming] = await Promise.all([
    section([listBlockedAutoPosts(userId, today), listAttentionObservations(userId)]),
    section([listUpcomingIncome(userId, today, through), listUpcomingDebt(userId, today, through), listUpcomingSavings(userId, today, through)]),
  ]);
  return { attention, upcoming };
}
