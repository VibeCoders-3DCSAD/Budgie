import { ACCOUNT_IDS, accountRows, openingBalances, savingsAccountDetailRows } from "./accounts";
import { replayBalances } from "./balances";
import { billersPart } from "./billers";
import { practiceMonths, type Row, type SeedContext, type SeedPart } from "./context";
import { creditCardPart } from "./creditCard";
import { debtsPart } from "./debts";
import { incomePart } from "./income";
import { savingsPart } from "./savings";
import { spendingPart } from "./spending";

export type { SeedContext } from "./context";

// Tables in the order they must be written, parents before the rows that reference them.
export const PRACTICE_TABLE_ORDER = [
  "financial_accounts", "savings_account_details", "credit_card_details", "credit_card_repayment_preferences",
  "income_sources", "scheduled_payments", "savings_goals", "debt_accounts", "debt_strategy_preferences",
  "transactions", "credit_card_cycles", "credit_card_transactions", "credit_card_statements", "credit_card_payments",
  "scheduled_payment_records", "savings_goal_activities", "debt_payments",
] as const;

export type PracticeTable = typeof PRACTICE_TABLE_ORDER[number];
export type PracticeSeed = Record<PracticeTable, Row[]>;

// Andrea Cruz ("healthy-worker"): three months of history up to today, built fresh for each tour.
export function buildPracticeSeed(ctx: SeedContext): PracticeSeed {
  const months = practiceMonths(ctx.today);
  const parts: SeedPart[] = [incomePart, billersPart, spendingPart, savingsPart, debtsPart, creditCardPart].map((build) => build(ctx, months));
  const transactions = parts.flatMap((part) => part.transactions);
  const replayed = replayBalances(openingBalances(), transactions, [ACCOUNT_IDS.payroll, ACCOUNT_IDS.wallet]);
  const balances = Object.assign(replayed, ...parts.map((part) => part.balances ?? {}));
  const seed = Object.fromEntries(PRACTICE_TABLE_ORDER.map((table) => [table, [] as Row[]])) as PracticeSeed;
  seed.financial_accounts = accountRows(ctx, months[0], balances);
  seed.savings_account_details = savingsAccountDetailRows(ctx);
  seed.transactions = transactions;
  for (const part of parts) {
    for (const [table, rows] of Object.entries(part.tables)) seed[table as PracticeTable].push(...rows);
  }
  return seed;
}
