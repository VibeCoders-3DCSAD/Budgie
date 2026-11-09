import { ACCOUNT_IDS } from "./accounts";
import { monthDay, transaction, type SeedContext, type SeedPart, type Transaction } from "./context";

// Fixed spreads instead of randomness, so the tour always shows the same believable month.
const GROCERY_PESOS = [820, 640, 910, 700, 760, 880, 690];
const COMMUTE_PESOS = [180, 210, 160, 240, 190];
const MEAL_PESOS = [320, 450, 280, 390];
const REGULAR_FACTORS = [0.85, 1.05, 1.15, 0.95];

const REGULAR = [
  { key: "clothes", slug: "clothing_womens", pesos: 1_500, days: [7], name: "Shopee clothes haul" },
  { key: "dinner", slug: "restaurants_casual_dining", pesos: 1_400, days: [9, 24], name: "Dinner out with friends" },
  { key: "home", slug: "household_kitchenware", pesos: 600, days: [13], name: "Kitchen and home supplies" },
];

// Everyday groceries, commute (GCash), and meals; a few regular treats; one unusual purchase two months ago.
export function spendingPart(ctx: SeedContext, months: [string, ...string[]]): SeedPart {
  const transactions: Transaction[] = [];
  for (const month of months) {
    for (let day = 1; day <= daysInMonth(month); day += 1) {
      const date = monthDay(month, day);
      if (date > ctx.today) break;
      const key = `${month}:${day}`;
      if (day % 3 === 1) transactions.push(transaction(ctx, { key: `groceries:${key}`, date, type: "expense", pesos: GROCERY_PESOS[day % GROCERY_PESOS.length]!, slug: "food_groceries", source: ACCOUNT_IDS.payroll, merchant: day % 2 ? "SM Supermarket" : "Puregold" }));
      if (isWeekday(date)) transactions.push(transaction(ctx, { key: `commute:${key}`, date, type: "expense", pesos: COMMUTE_PESOS[day % COMMUTE_PESOS.length]!, slug: "transport_public", source: ACCOUNT_IDS.wallet, merchant: "MRT and jeepney" }));
      if (day % 4 === 2) transactions.push(transaction(ctx, { key: `meals:${key}`, date, type: "expense", pesos: MEAL_PESOS[day % MEAL_PESOS.length]!, slug: "restaurants_fast_food", source: ACCOUNT_IDS.wallet, merchant: "Jollibee" }));
    }
    REGULAR.forEach((spend, index) => spend.days.forEach((day, dayIndex) => {
      const date = monthDay(month, day);
      if (date > ctx.today) return;
      const factor = REGULAR_FACTORS[(index + dayIndex + months.indexOf(month)) % REGULAR_FACTORS.length]!;
      transactions.push(transaction(ctx, { key: `${spend.key}:${month}:${day}`, date, type: "expense", pesos: Math.round(spend.pesos * factor), slug: spend.slug, source: ACCOUNT_IDS.payroll, merchant: spend.name }));
    }));
  }
  // Well above her usual home spending, so Financial Reports flags it as unusual.
  transactions.push(transaction(ctx, { key: "unusual:air-fryer", date: monthDay(months[1]!, 22), type: "expense", pesos: 9_500, slug: "household_kitchenware", source: ACCOUNT_IDS.payroll, merchant: "Air fryer and rice cooker" }));
  // Monthly GCash top-up from payroll for commute and meals.
  for (const month of months) {
    const date = monthDay(month, 3);
    if (date <= ctx.today) transactions.push(transaction(ctx, { key: `topup:${month}`, date, type: "transfer", pesos: 3_000, source: ACCOUNT_IDS.payroll, destination: ACCOUNT_IDS.wallet, merchant: "GCash cash-in" }));
  }
  return { tables: {}, transactions };
}

function daysInMonth(monthStart: string): number {
  return new Date(Date.UTC(Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)), 0)).getUTCDate();
}

function isWeekday(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}
