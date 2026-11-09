import { ACCOUNT_IDS } from "./accounts";
import { centavos, monthDay, nextMonthlyDate, practiceId, synced, transaction, type SeedContext, type SeedPart } from "./context";

const SALARY_ID = practiceId("income:salary");
const FREELANCE_ID = practiceId("income:freelance");

// Net salary of PHP 75,000 paid twice a month, plus a small monthly freelance design job paid to GCash.
export function incomePart(ctx: SeedContext, months: [string, ...string[]]): SeedPart {
  const incomeSources = [
    { ...synced(ctx), id: SALARY_ID, name: "Salary — Andrea Cruz", frequency: "semi_monthly", expected_amount_centavos: centavos(37_500), payday_day_of_month: 1, payday_second_day_of_month: 16, next_expected_date: [nextMonthlyDate(ctx.today, 1), nextMonthlyDate(ctx.today, 16)].sort()[0], destination_account_id: ACCOUNT_IDS.payroll, subcategory_id: ctx.subcategoryId("income_salary"), is_active: true, notes: "Net take-home pay, twice monthly." },
    { ...synced(ctx), id: FREELANCE_ID, name: "Freelance design", frequency: "monthly", expected_amount_centavos: centavos(6_000), payday_day_of_month: 25, next_expected_date: nextMonthlyDate(ctx.today, 25), destination_account_id: ACCOUNT_IDS.wallet, subcategory_id: ctx.subcategoryId("income_freelance"), is_active: true, notes: "Logo and social media work for small businesses." },
  ];
  const paydays = months.flatMap((month) => [
    { key: `salary:${month}:1`, date: monthDay(month, 1), pesos: 37_500, slug: "income_salary", destination: ACCOUNT_IDS.payroll, merchant: "Net salary" },
    { key: `salary:${month}:16`, date: monthDay(month, 16), pesos: 37_500, slug: "income_salary", destination: ACCOUNT_IDS.payroll, merchant: "Net salary" },
    { key: `freelance:${month}`, date: monthDay(month, 25), pesos: 6_000, slug: "income_freelance", destination: ACCOUNT_IDS.wallet, merchant: "Freelance design client" },
  ]);
  const transactions = paydays.filter((payday) => payday.date <= ctx.today).map((payday) => transaction(ctx, { ...payday, type: "income" }));
  return { tables: { income_sources: incomeSources }, transactions };
}
