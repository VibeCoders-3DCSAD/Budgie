import { randomUUID } from "node:crypto";
import { detectUnusualSpendings, UNUSUAL_SPENDING_MODEL_VERSION } from "@odin/spending-insights";
import type { Transaction } from "./history.js";

// Medicine purchases in the generated history are regular spending, even when IQR flags their variation.
export function buildSeedRecurringSpending(userId: string, transactions: Transaction[], subcategoryIds: Map<string, string>, today: string) {
  const medicineId = subcategoryIds.get("health_medicines");
  if (!medicineId) return [];
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - 12);
  const fromDate = start.toISOString().slice(0, 10);
  const medicines = transactions.filter((transaction) => transaction.user_id === userId
    && transaction.transaction_type === "expense" && transaction.subcategory_id === medicineId
    && transaction.transaction_date >= fromDate && transaction.transaction_date <= today
    && transaction.amount_centavos > 0);
  const insights = detectUnusualSpendings(medicines.map((transaction) => ({
    id: transaction.id, transactionDate: transaction.transaction_date, amountCentavos: transaction.amount_centavos,
    subcategoryId: medicineId, subcategoryLabel: "Medicines", accountName: null,
  })));
  const timestamp = `${today}T12:00:00+08:00`;
  return insights.map((insight) => ({
    id: randomUUID(), user_id: userId, transaction_id: insight.transactionId,
    subcategory_id: insight.subcategoryId, amount_centavos: insight.amountCentavos,
    evaluated_at: timestamp, confirmed_recurring_at: timestamp, recurrence: "frequent",
    model_version: UNUSUAL_SPENDING_MODEL_VERSION, profile_label: null,
    history_days: insight.usableHistoryCount, raw_anomaly_score: insight.severity,
    is_anomaly: true, should_alert_user: false, review_status: "not_alerted",
    feature_vector: {
      usual_spending_centavos: insight.usualSpendingCentavos,
      lower_bound_centavos: insight.lowerBoundCentavos,
      upper_bound_centavos: insight.upperBoundCentavos,
    },
    baseline_snapshot: { scope: "category_iqr" }, version: 1, deleted: false, updated_at: timestamp,
  }));
}

// The seasonal mom's tuition is paid January through June each school year, so every payment the app's
// unusual-spending window still reads is answered "in certain months" for those months. The forecast then
// expects it in that season only, and Preferences lists it for editing.
const TUITION_MONTHS = [1, 2, 3, 4, 5, 6];

export function buildSeedTuitionMonths(userId: string, transactions: Transaction[], subcategoryIds: Map<string, string>, today: string) {
  const tuitionId = subcategoryIds.get("education_tuition");
  if (!tuitionId) return [];
  // Thirteen months, the same window the app reads unusual spending from.
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - 13);
  const fromDate = start.toISOString().slice(0, 10);
  const timestamp = `${today}T12:00:00+08:00`;
  return transactions.filter((transaction) => transaction.user_id === userId
    && transaction.transaction_type === "expense" && transaction.subcategory_id === tuitionId
    && transaction.transaction_date >= fromDate && transaction.transaction_date <= today
    && transaction.amount_centavos > 0).map((transaction) => ({
    id: randomUUID(), user_id: userId, transaction_id: transaction.id,
    subcategory_id: tuitionId, amount_centavos: transaction.amount_centavos,
    evaluated_at: timestamp, confirmed_recurring_at: null, recurrence: "yearly", recurrence_months: TUITION_MONTHS,
    model_version: UNUSUAL_SPENDING_MODEL_VERSION, profile_label: null,
    history_days: 0, raw_anomaly_score: 0,
    is_anomaly: true, should_alert_user: false, review_status: "not_alerted",
    // Outside the school season the family spends nothing on tuition.
    feature_vector: { usual_spending_centavos: 0, lower_bound_centavos: 0, upper_bound_centavos: 0 },
    baseline_snapshot: { scope: "seasonal_tuition" }, version: 1, deleted: false, updated_at: timestamp,
  }));
}

// The generated history's holiday clothes purchase on the Rewards Visa is answered "in certain months" for the
// month it was bought, November or December by its billing cycle, so the forecast expects it then next year
// instead of reading it as ordinary spending, and Preferences lists it for editing.
export function buildSeedHolidayPurchases(userId: string, transactions: Transaction[], subcategoryIds: Map<string, string>, today: string) {
  const childrensClothingId = subcategoryIds.get("clothing_childrens");
  if (!childrensClothingId) return [];
  // Thirteen months, the same window the app reads unusual spending from.
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - 13);
  const fromDate = start.toISOString().slice(0, 10);
  const timestamp = `${today}T12:00:00+08:00`;
  return transactions.filter((transaction) => transaction.user_id === userId
    && transaction.transaction_type === "expense" && transaction.subcategory_id === childrensClothingId
    && transaction.transaction_date >= fromDate && transaction.transaction_date <= today
    && transaction.amount_centavos > 0).map((transaction) => ({
    id: randomUUID(), user_id: userId, transaction_id: transaction.id,
    subcategory_id: childrensClothingId, amount_centavos: transaction.amount_centavos,
    evaluated_at: timestamp, confirmed_recurring_at: null, recurrence: "yearly", recurrence_months: [Number(transaction.transaction_date.slice(5, 7))],
    model_version: UNUSUAL_SPENDING_MODEL_VERSION, profile_label: null,
    history_days: 0, raw_anomaly_score: 0,
    is_anomaly: true, should_alert_user: false, review_status: "not_alerted",
    // Children's clothes are bought only for the holidays, so there is no usual range.
    feature_vector: { usual_spending_centavos: 0, lower_bound_centavos: 0, upper_bound_centavos: 0 },
    baseline_snapshot: { scope: "seasonal_holiday" }, version: 1, deleted: false, updated_at: timestamp,
  }));
}
