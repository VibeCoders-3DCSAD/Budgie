import { detectUnusualSpendings } from "@odin/spending-insights";
import { buildSeedData, requiredSubcategorySlugs } from "../history.js";
import { buildSeedHolidayPurchases, buildSeedRecurringSpending, buildSeedTuitionMonths } from "../recurring-spending.js";
import { buildPersonaSeedData } from "../personas.js";
import { recurringMonthSpend, resolveRecurringPayments } from "@odin/spending-insights/recurringMonths.js";

const userId = "seed-user";
const subcategoryIds = new Map(requiredSubcategorySlugs.map((slug) => [slug, `subcategory-${slug}`]));

it("keeps seeded medicine purchases in the forecast after frequent-spending confirmations", () => {
  const today = "2026-10-21";
  const data = buildSeedData({ userId, today, seed: 42, subcategoryIds });
  const confirmations = buildSeedRecurringSpending(userId, data.transactions, subcategoryIds, today);
  expect(confirmations.length).toBeGreaterThan(0);
  const medicines = data.transactions.filter((row) => row.subcategory_id === subcategoryIds.get("health_medicines") && row.transaction_date >= "2025-10-21");
  const recurrences = new Map(confirmations.map((row) => [row.transaction_id, "frequent" as const]));
  expect(confirmations.every((row) => row.user_id === userId && row.recurrence === "frequent" && row.confirmed_recurring_at === `${today}T12:00:00+08:00`)).toBe(true);
  expect(confirmations.every((row) => medicines.some((transaction) => transaction.id === row.transaction_id && transaction.amount_centavos === row.amount_centavos))).toBe(true);
  const remainingOneOffs = detectUnusualSpendings(medicines.map((row) => ({
    id: row.id, transactionDate: row.transaction_date, amountCentavos: row.amount_centavos,
    subcategoryId: row.subcategory_id!, subcategoryLabel: "Medicines", accountName: null,
  })), recurrences).filter((insight) => !insight.confirmedRecurring);
  expect(remainingOneOffs).toEqual([]);
  expect(confirmations.some((row) => row.amount_centavos === 84644)).toBe(true);
  expect(confirmations.some((row) => row.amount_centavos === 86412)).toBe(true);
  expect(confirmations.some((row) => row.amount_centavos === 49733)).toBe(true);
});

it("does not confirm another user's purchases or other subcategories", () => {
  const today = "2026-10-21";
  const data = buildSeedData({ userId, today, seed: 42, subcategoryIds });
  expect(buildSeedRecurringSpending("another-user", data.transactions, subcategoryIds, today)).toEqual([]);
  expect(buildSeedRecurringSpending(userId, data.transactions, new Map(), today)).toEqual([]);
});

it("expects the seasonal mom's tuition for all four children in January through June only", () => {
  const today = "2026-10-21";
  const data = buildPersonaSeedData({ userId, today, seed: 42, subcategoryIds, persona: "seasonal-mom" });
  const answers = buildSeedTuitionMonths(userId, data.transactions, subcategoryIds, today);
  // Four children a month, January through June 2026; last year's payments are outside the thirteen-month window.
  expect(answers).toHaveLength(24);
  expect(answers.every((row) => row.recurrence === "yearly" && row.recurrence_months.join() === "1,2,3,4,5,6" && row.should_alert_user === false)).toBe(true);
  const byId = new Map(data.transactions.map((row) => [row.id, row]));
  const resolved = resolveRecurringPayments(answers.map((row) => ({ key: row.subcategory_id, transactionDate: byId.get(row.transaction_id)!.transaction_date, amountCentavos: row.amount_centavos, months: row.recurrence_months })));
  expect(recurringMonthSpend(resolved, "2027-01")).toBe(1_400_000);
  expect(recurringMonthSpend(resolved, "2027-06")).toBe(1_400_000);
  expect(recurringMonthSpend(resolved, "2026-11")).toBe(0);
});

it("finds no tuition to flag for a persona without school fees", () => {
  const today = "2026-10-21";
  const data = buildPersonaSeedData({ userId, today, seed: 42, subcategoryIds, persona: "healthy-worker" });
  expect(buildSeedTuitionMonths(userId, data.transactions, subcategoryIds, today)).toEqual([]);
});

it("expects the holiday clothes purchase again in the month it was bought", () => {
  const today = "2026-10-27";
  const data = buildSeedData({ userId, today, seed: 42, subcategoryIds });
  const answers = buildSeedHolidayPurchases(userId, data.transactions, subcategoryIds, today);
  // The November 2025 SM Department Store purchase, from the billing cycle that closes in December.
  expect(answers).toHaveLength(1);
  expect(answers[0]).toMatchObject({ recurrence: "yearly", recurrence_months: [11], amount_centavos: 677_179, should_alert_user: false });
  const byId = new Map(data.transactions.map((row) => [row.id, row]));
  const resolved = resolveRecurringPayments(answers.map((row) => ({ key: row.subcategory_id, transactionDate: byId.get(row.transaction_id)!.transaction_date, amountCentavos: row.amount_centavos, months: row.recurrence_months })));
  expect(recurringMonthSpend(resolved, "2026-11")).toBe(677_179);
  expect(recurringMonthSpend(resolved, "2026-12")).toBe(0);
});
