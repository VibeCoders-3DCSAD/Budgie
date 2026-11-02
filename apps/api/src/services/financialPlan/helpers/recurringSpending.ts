import { detectRecurringPayments, type SpendingRecurrence } from "@odin/spending-insights";
import { normalizeRecurrenceMonths, recurringMonthSpend, resolveRecurringPayments, type ResolvedRecurringPayment } from "@odin/spending-insights/recurringMonths.js";

export type AnomalyEvaluation = { transaction_id: string; is_anomaly: boolean; recurrence: SpendingRecurrence | null; recurrence_months?: unknown };

type EvaluatedTransaction = { id: string; amount_centavos: number; transaction_date: string; transaction_type: string; subcategory_id: string | null; anomaly_evaluations: AnomalyEvaluation[] | null };

type CategoryAmount = { category: string; amountCentavos: number };

type RecurringSpend = { id: string; key: string; subcategoryId: string; transactionDate: string; amountCentavos: number; months: number[] | null };

type UnusualSpending = {
  // Unusual spending the user has not said recurs; it stays out of the plan and its forecast.
  oneOffIds: Set<string>;
  // Every payment that comes back in certain months, which spending history leaves out.
  recurringIds: Set<string>;
  // Those payments with the months each still stands for; a newer one replaces an older one's months.
  recurring: ResolvedRecurringPayment<RecurringSpend>[];
};

// Like the Spending Forecast, unusual spending stays out unless the user said it will be frequent or comes back
// in certain months. Those come back in their months, along with later payments their answer covers.
export function unusualSpending(transactions: EvaluatedTransaction[]): UnusualSpending {
  const evaluations = transactions.flatMap((transaction) => (transaction.anomaly_evaluations ?? []).filter((evaluation) => evaluation.is_anomaly));
  const recurrences = new Map(evaluations.map((evaluation) => [evaluation.transaction_id, evaluation.recurrence]));
  const months = new Map(evaluations.flatMap((evaluation) => {
    const chosen = evaluation.recurrence === "yearly" ? normalizeRecurrenceMonths(evaluation.recurrence_months) : null;
    return chosen ? [[evaluation.transaction_id, chosen] as const] : [];
  }));
  const spending = transactions.flatMap((transaction) => transaction.transaction_type === "expense" && transaction.subcategory_id && transaction.amount_centavos > 0
    ? [{ id: transaction.id, transactionDate: transaction.transaction_date, amountCentavos: transaction.amount_centavos, subcategoryId: transaction.subcategory_id, subcategoryLabel: "", accountName: null }]
    : []);
  const payments = detectRecurringPayments(spending, recurrences, months);
  return {
    oneOffIds: new Set(evaluations.filter((evaluation) => evaluation.recurrence !== "frequent" && evaluation.recurrence !== "yearly").map((evaluation) => evaluation.transaction_id)),
    recurringIds: new Set(payments.map((payment) => payment.id)),
    recurring: resolveRecurringPayments(payments.map(({ id, subcategoryId, transactionDate, amountCentavos, months: chosen }) => ({ id, key: subcategoryId, subcategoryId, transactionDate, amountCentavos, months: chosen }))),
  };
}

// What recurring payments expect in month (YYYY-MM) for each forecast category slug.
export function recurringSpendBySlug(recurring: UnusualSpending["recurring"], categorySlugBySubcategoryId: Map<string, string | undefined>, month: string): Map<string, number> {
  const bySlug = new Map<string, number>();
  for (const slug of new Set(recurring.map((payment) => categorySlugBySubcategoryId.get(payment.subcategoryId) ?? "Other"))) {
    const amount = recurringMonthSpend(recurring.filter((payment) => (categorySlugBySubcategoryId.get(payment.subcategoryId) ?? "Other") === slug), month);
    if (amount > 0) bySlug.set(slug, amount);
  }
  return bySlug;
}

// The forecast's categories with recurring payments added back in their month.
export function withRecurringSpend(categoryForecasts: CategoryAmount[], added: Map<string, number>): CategoryAmount[] {
  return [
    ...categoryForecasts.map((point) => added.has(point.category) ? { ...point, amountCentavos: point.amountCentavos + added.get(point.category)! } : point),
    ...[...added].filter(([category]) => !categoryForecasts.some((point) => point.category === category)).map(([category, amountCentavos]) => ({ category, amountCentavos })),
  ];
}
