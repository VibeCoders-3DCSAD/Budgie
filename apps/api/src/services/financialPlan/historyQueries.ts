import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { FinancialPlanUnavailableError } from "./errors.js";

// PostgREST returns at most max_rows per request, so one large .limit() silently stops there. Each
// request asks for this many rows, but the server may return fewer: the next page starts after the rows
// actually received, and only an empty page ends the read, so a lower hosted max_rows cannot cut it short.
export const HISTORY_PAGE_SIZE = 1_000;

// Far beyond a year of manual entries. Past it the plan fails loudly instead of using part of the history.
export const MAX_HISTORY_ROWS = 50_000;

type Page<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

// Reads every row of a query. readPage must apply a stable order so pages neither skip nor repeat rows.
export async function readAllPages<T>(readPage: (from: number, to: number) => Page<T>): Promise<{ data: T[] | null; error: PostgrestError | null }> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await readPage(rows.length, rows.length + HISTORY_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const page = data ?? [];
    if (page.length === 0) return { data: rows, error: null };
    rows.push(...page);
    if (rows.length > MAX_HISTORY_ROWS) {
      throw new FinancialPlanUnavailableError(`Financial plan history has more than ${MAX_HISTORY_ROWS} rows`);
    }
  }
}

const ANOMALY_EVALUATIONS = "anomaly_evaluations!anomaly_evaluations_transaction_id_fkey(transaction_id, is_anomaly, recurrence, recurrence_months)";

// Posted expenses from historyStart, with only the evaluations that flagged them unusual. The plan and its
// forecast read nothing older or of another type, so filtering here keeps income and transfers from
// taking rows the history needs.
export function readExpenseHistory<T>(supabase: SupabaseClient, userId: string, historyStart: string, columns: string) {
  // The column list is built at runtime, which the client cannot type, so the caller names the row type.
  return readAllPages<T>((from, to) => supabase
    .from("transactions")
    .select(`${columns}, ${ANOMALY_EVALUATIONS}`)
    .eq("user_id", userId)
    .eq("status", "posted")
    .eq("deleted", false)
    .eq("transaction_type", "expense")
    .gte("transaction_date", historyStart)
    .eq("anomaly_evaluations.is_anomaly", true)
    .order("transaction_date", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to) as unknown as Page<T>);
}

// Transactions that paid a biller or remittance since historyStart; their categories are reserved, not forecast.
export function readScheduledPaymentHistory(supabase: SupabaseClient, userId: string, historyStart: string) {
  return readAllPages<{ transaction_id: string }>((from, to) => supabase
    .from("scheduled_payment_records")
    .select("transaction_id")
    .eq("user_id", userId)
    .eq("deleted", false)
    .gte("payment_date", historyStart)
    .not("transaction_id", "is", null)
    .order("id", { ascending: true })
    .range(from, to));
}
