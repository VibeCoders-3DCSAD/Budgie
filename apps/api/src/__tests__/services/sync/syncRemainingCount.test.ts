import { jest } from "@jest/globals";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countRemainingChanges, SYNCED_TABLES } from "../../../services/sync/syncService.js";

type CountResult = { count: number | null; error: unknown };

function makeSupabase(countFor: (table: string) => CountResult) {
  const calls: { table: string; select: unknown[]; eq: unknown[][]; or: string[] }[] = [];
  const from = jest.fn((table: string) => {
    const call = { table, select: [] as unknown[], eq: [] as unknown[][], or: [] as string[] };
    calls.push(call);
    const builder = {
      select: (...args: unknown[]) => { call.select = args; return builder; },
      eq: (...args: unknown[]) => { call.eq.push(args); return builder; },
      or: (filters: string) => { call.or.push(filters); return builder; },
      then: (resolve: (value: CountResult) => unknown) => Promise.resolve(countFor(table)).then(resolve),
    };
    return builder;
  });
  return { client: { from } as unknown as SupabaseClient, calls };
}

describe("countRemainingChanges", () => {
  it("counts every synced table for the user without fetching rows", async () => {
    const { client, calls } = makeSupabase((table) => ({ count: table === "transactions" ? 1200 : 3, error: null }));

    const remaining = await countRemainingChanges(client, "user-1", {});

    expect(Object.keys(remaining).sort()).toEqual([...SYNCED_TABLES].sort());
    expect(remaining.transactions).toBe(1200);
    expect(calls.every((call) => call.eq.some(([column, value]) => column === "user_id" && value === "user-1"))).toBe(true);
    expect(calls.every((call) => (call.select[1] as { head?: boolean })?.head === true)).toBe(true);
    expect(calls.every((call) => call.or.length === 0)).toBe(true);
  });

  it("counts only rows after an advanced table cursor", async () => {
    const { client, calls } = makeSupabase(() => ({ count: 10, error: null }));
    const cursor = { ts: "2026-01-01T00:00:00.000Z", id: "00000000-0000-0000-0000-000000000002" };

    await countRemainingChanges(client, "user-1", { transactions: cursor });

    const transactions = calls.find((call) => call.table === "transactions")!;
    expect(transactions.or).toEqual([
      `updated_at.gt.${cursor.ts},and(updated_at.eq.${cursor.ts},id.gt.${cursor.id})`,
    ]);
  });

  it("treats a failed count as zero so the pull itself still proceeds", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { client } = makeSupabase((table) => (table === "categories" ? { count: null, error: new Error("boom") } : { count: 1, error: null }));

    const remaining = await countRemainingChanges(client, "user-1", {});

    expect(remaining.categories).toBe(0);
    expect(remaining.transactions).toBe(1);
  });
});
