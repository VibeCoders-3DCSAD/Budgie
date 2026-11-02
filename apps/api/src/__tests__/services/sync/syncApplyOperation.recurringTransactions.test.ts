import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";

type Row = Record<string, unknown> | null;

// Records each table lookup and answers with the row configured for that table.
function createSupabaseStub(rows: Record<string, Row>) {
  const lookups: string[] = [];
  const supabase = {
    from: (table: string) => {
      lookups.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return query;
    },
  };
  return { supabase: supabase as never, lookups };
}

function update(entity: string, payload: Record<string, unknown>) {
  return {
    operation_id: "operation-1",
    entity,
    record_id: "record-1",
    operation_type: "update" as const,
    base_version: 1,
    changed_fields: Object.keys(payload),
    payload,
  };
}

describe("recurring occurrence updates", () => {
  it("accepts a scheduled date and a generated transaction", async () => {
    const { supabase, lookups } = createSupabaseStub({ transactions: { id: "transaction-1" } });
    const prepared = await prepareOperation(supabase, "user-1", update("recurring_transaction_occurrences", { scheduled_date: "2026-11-15", generated_transaction_id: "transaction-1" }));
    expect(prepared.payload).toEqual({ scheduled_date: "2026-11-15", generated_transaction_id: "transaction-1" });
    expect(lookups).toEqual(["transactions"]);
  });

  it("allows clearing the generated transaction", async () => {
    const { supabase, lookups } = createSupabaseStub({});
    const prepared = await prepareOperation(supabase, "user-1", update("recurring_transaction_occurrences", { generated_transaction_id: null }));
    expect(prepared.payload).toEqual({ generated_transaction_id: null });
    expect(lookups).toEqual([]);
  });

  it("rejects a generated transaction the user does not own", async () => {
    const { supabase } = createSupabaseStub({});
    await expect(prepareOperation(supabase, "user-1", update("recurring_transaction_occurrences", { generated_transaction_id: "transaction-2" }))).rejects.toThrow("generated_transaction_id not found or inaccessible");
  });

  it("rejects an empty scheduled date or an inaccessible template", async () => {
    const { supabase } = createSupabaseStub({});
    await expect(prepareOperation(supabase, "user-1", update("recurring_transaction_occurrences", { scheduled_date: "" }))).rejects.toThrow("scheduled_date is required");
    await expect(prepareOperation(supabase, "user-1", update("recurring_transaction_occurrences", { recurring_template_id: "template-2" }))).rejects.toThrow("recurring template not found or inaccessible");
  });
});

describe("recurring template updates", () => {
  it("checks each changed account and subcategory once", async () => {
    const { supabase, lookups } = createSupabaseStub({
      recurring_transaction_templates: { id: "template-1", transaction_type: "expense", source_account_id: "account-1", destination_account_id: null, subcategory_id: "subcategory-1", starts_on: "2026-11-01", ends_on: null },
      financial_accounts: { id: "account-2" },
      subcategories: { id: "subcategory-2" },
    });
    await prepareOperation(supabase, "user-1", update("recurring_transaction_templates", { source_account_id: "account-2", subcategory_id: "subcategory-2" }));
    expect(lookups).toEqual(["recurring_transaction_templates", "subcategories", "financial_accounts"]);
  });
});
