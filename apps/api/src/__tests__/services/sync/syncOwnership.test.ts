import type { SupabaseClient } from "@supabase/supabase-js";
import { findOwnedRow, requireOwnedRow } from "../../../services/sync/syncOwnership.js";

function client(result: { data: unknown; error: { message: string } | null }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq"]) query[method] = (...args: unknown[]) => { calls.push([method, ...args]); return query; };
  query.maybeSingle = async () => result;
  const supabase = { from: (table: string) => { calls.push(["from", table]); return query; } } as unknown as SupabaseClient;
  return { supabase, calls };
}

const lookup = { table: "transactions", match: { id: "tx-1", transaction_type: "expense" }, errorPrefix: "payment transaction validation" };

describe("findOwnedRow", () => {
  it("scopes the row to the user, its filters, and live rows", async () => {
    const { supabase, calls } = client({ data: { id: "tx-1" }, error: null });
    await expect(findOwnedRow(supabase, "owner", { ...lookup, notMatch: { kind: "credit_card" } })).resolves.toEqual({ id: "tx-1" });
    expect(calls).toEqual([
      ["from", "transactions"], ["select", "id"], ["eq", "user_id", "owner"],
      ["eq", "id", "tx-1"], ["eq", "transaction_type", "expense"], ["neq", "kind", "credit_card"], ["eq", "deleted", false],
    ]);
  });

  it("also matches deleted rows when asked", async () => {
    const { supabase, calls } = client({ data: null, error: null });
    await expect(findOwnedRow(supabase, "owner", { ...lookup, includeDeleted: true })).resolves.toBeNull();
    expect(calls).not.toContainEqual(["eq", "deleted", false]);
  });

  it("names the failed check when the query fails", async () => {
    const { supabase } = client({ data: null, error: { message: "timeout" } });
    await expect(findOwnedRow(supabase, "owner", lookup)).rejects.toThrow("payment transaction validation failed: timeout");
  });
});

describe("requireOwnedRow", () => {
  it("throws the caller's message when the user has no matching row", async () => {
    const { supabase } = client({ data: null, error: null });
    await expect(requireOwnedRow(supabase, "owner", { ...lookup, notFound: "payment transaction must match its amount and source account" }))
      .rejects.toThrow("payment transaction must match its amount and source account");
  });
});
