import { addMonths, dateAtDay } from "../../../../lib/dates";
import { uuidV5 } from "../../../../local-db/uuid";

// Shared building blocks for the tour's practice data: Andrea Cruz, the "healthy-worker" demo persona.
export type Row = Record<string, unknown>;

export type SeedContext = {
  userId: string;
  // Asia/Manila "YYYY-MM-DD"; the history runs up to and including this day.
  today: string;
  // The user's own subcategory id for a system slug, so practice rows use the real taxonomy.
  subcategoryId: (slug: string) => string;
};

export type Transaction = Row & {
  id: string;
  transaction_type: "income" | "expense" | "transfer";
  transaction_date: string;
  amount_centavos: number;
  source_account_id: string | null;
  destination_account_id: string | null;
};

const PRACTICE_NAMESPACE = "7c0f4a52-3c1e-4b8e-9d2a-6f1b0e5d9a41";
const HISTORY_MONTHS = 3;

// Stable ids, so tour steps can open a known record (for example a debt's detail screen).
export function practiceId(name: string): string {
  return uuidV5(name, PRACTICE_NAMESPACE);
}

export function centavos(pesos: number): number {
  return Math.round(pesos * 100);
}

// The sync columns every server row carries.
export function synced(ctx: SeedContext): Row {
  const stamp = noonManila(ctx.today);
  return { user_id: ctx.userId, version: 1, deleted: false, created_at: stamp, updated_at: stamp };
}

// First day of each month on record: three full months, then the current month to date.
export function practiceMonths(today: string): [string, ...string[]] {
  const current = `${today.slice(0, 7)}-01`;
  const months = Array.from({ length: HISTORY_MONTHS + 1 }, (_, index) => addMonths(current, index - HISTORY_MONTHS));
  return months as [string, ...string[]];
}

export function monthDay(monthStart: string, day: number): string {
  return dateAtDay(Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)) - 1, day);
}

// The next date on or after today that falls on `day` of a month.
export function nextMonthlyDate(today: string, day: number): string {
  const thisMonth = monthDay(`${today.slice(0, 7)}-01`, day);
  return thisMonth >= today ? thisMonth : monthDay(addMonths(`${today.slice(0, 7)}-01`, 1), day);
}

export function noonManila(date: string): string {
  return `${date}T04:00:00.000Z`;
}

type TransactionInput = {
  key: string; date: string; type: Transaction["transaction_type"]; pesos?: number; amount?: number;
  slug?: string; source?: string; destination?: string; merchant?: string; notes?: string; extra?: Row;
};

export function transaction(ctx: SeedContext, input: TransactionInput): Transaction {
  const id = practiceId(`transaction:${input.key}`);
  return {
    ...synced(ctx), id, transaction_type: input.type, status: "posted", entry_source: "manual",
    transaction_date: input.date, posted_at: noonManila(input.date), amount_centavos: input.amount ?? centavos(input.pesos ?? 0),
    subcategory_id: input.slug ? ctx.subcategoryId(input.slug) : null,
    source_account_id: input.source ?? null, destination_account_id: input.destination ?? null,
    merchant_name: input.merchant ?? null, notes: input.notes ?? null, client_mutation_id: id, metadata: { practice: true },
    ...input.extra,
  };
}

// One domain's contribution: its own table rows, the ledger transactions behind them, and any account
// balance the ledger replay cannot derive (a card's balance is what is still owed, not what was spent).
export type SeedPart = { tables: Record<string, Row[]>; transactions: Transaction[]; balances?: Record<string, number> };
