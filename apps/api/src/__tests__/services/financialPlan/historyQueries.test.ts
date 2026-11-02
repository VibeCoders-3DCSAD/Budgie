import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORY_PAGE_SIZE, MAX_HISTORY_ROWS, readAllPages, readExpenseHistory, readScheduledPaymentHistory } from "../../../services/financialPlan/historyQueries.js";
import { FinancialPlanUnavailableError } from "../../../services/financialPlan/errors.js";

type Call = [string, ...unknown[]];

// Serves rows a page at a time like PostgREST, capped at max_rows, and records every filter.
function pagedClient(rows: unknown[], maxRows = HISTORY_PAGE_SIZE) {
  const calls: Call[] = [];
  const client = { from: (table: string) => {
    calls.push(["from", table]);
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "gte", "not", "order"]) {
      builder[name] = (...args: unknown[]) => { calls.push([name, ...args]); return builder; };
    }
    builder.range = (from: number, to: number) => {
      calls.push(["range", from, to]);
      const end = Math.min(to + 1, from + maxRows);
      return Promise.resolve({ data: rows.slice(from, end), error: null });
    };
    return builder;
  } } as unknown as SupabaseClient;
  return { client, calls };
}

const expenses = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `t-${index}` }));

describe("financial plan history reads", () => {
  it("reads every expense since the history start, past the per-request row limit", async () => {
    const { client, calls } = pagedClient(expenses(2_500));

    const result = await readExpenseHistory(client, "user-1", "2025-11-01", "id");

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2_500);
    expect(calls.filter(([name]) => name === "range")).toEqual([["range", 0, 999], ["range", 1_000, 1_999], ["range", 2_000, 2_999], ["range", 2_500, 3_499]]);
    expect(calls).toEqual(expect.arrayContaining([
      ["eq", "user_id", "user-1"],
      ["eq", "transaction_type", "expense"],
      ["gte", "transaction_date", "2025-11-01"],
      ["order", "transaction_date", { ascending: false }],
      ["order", "id", { ascending: false }],
    ]));
  });

  it("keeps reading when the server caps pages below the requested size", async () => {
    const { client, calls } = pagedClient(expenses(1_200), 500);

    const result = await readExpenseHistory(client, "user-1", "2025-11-01", "id");

    expect(result.data).toHaveLength(1_200);
    expect(calls.filter(([name]) => name === "range").map(([, from]) => from)).toEqual([0, 500, 1_000, 1_200]);
  });

  it("stops after an exactly full final page with one empty read", async () => {
    const { client, calls } = pagedClient(expenses(HISTORY_PAGE_SIZE));

    const result = await readScheduledPaymentHistory(client, "user-1", "2025-11-01");

    expect(result.data).toHaveLength(HISTORY_PAGE_SIZE);
    expect(calls.filter(([name]) => name === "range")).toHaveLength(2);
  });

  it("returns the page error instead of partial history", async () => {
    const error = { message: "down", code: "500", details: "", hint: "", name: "PostgrestError" };
    let page = 0;
    const result = await readAllPages(() => Promise.resolve(page++ === 0
      ? { data: expenses(HISTORY_PAGE_SIZE), error: null }
      : { data: null, error }));

    expect(result).toEqual({ data: null, error });
  });

  it("refuses history beyond the ceiling instead of truncating it", async () => {
    await expect(readAllPages(() => Promise.resolve({ data: expenses(HISTORY_PAGE_SIZE), error: null })))
      .rejects.toBeInstanceOf(FinancialPlanUnavailableError);
  });

  it("accepts history of exactly the ceiling", async () => {
    const { client } = pagedClient(expenses(MAX_HISTORY_ROWS));

    await expect(readScheduledPaymentHistory(client, "user-1", "2025-11-01")).resolves.toMatchObject({ error: null });
  });
});
