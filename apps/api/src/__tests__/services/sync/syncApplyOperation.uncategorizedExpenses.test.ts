import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";
import { DatabaseSync } from "node:sqlite";
import { syncQueueOrderByClause } from "../../../../../app/local-db/sync/queueOrder.js";

const PAYMENT = "5d000000-0000-4000-8000-0000000000b1";

// Accounts always resolve; a scheduled payment resolves only when it is in ownedPayments.
function createSupabaseStub(ownedPayments: string[]) {
  let table = "";
  let id: unknown;
  const query = {
    select: () => query,
    eq: (field: string, value: unknown) => { if (field === "id") id = value; return query; },
    or: () => query,
    maybeSingle: async () => ({ data: table !== "scheduled_payments" || ownedPayments.includes(id as string) ? { id } : null, error: null }),
  };
  return { from: (nextTable: string) => { table = nextTable; return query; } } as never;
}

function expense(payload: Record<string, unknown>) {
  return {
    operation_id: "operation-1", entity: "transactions", record_id: "transaction-1", operation_type: "create" as const, base_version: null, changed_fields: [],
    payload: { transaction_type: "expense", transaction_date: "2026-11-02", amount_centavos: 1000, source_account_id: "account-1", ...payload },
  };
}

describe("uncategorized expenses", () => {
  it("are rejected unless they pay a biller or remittance", async () => {
    await expect(prepareOperation(createSupabaseStub([PAYMENT]), "user-1", expense({}))).rejects.toThrow("expense requires a category unless it pays a biller or remittance");
    await expect(prepareOperation(createSupabaseStub([PAYMENT]), "user-1", expense({ client_mutation_id: "debt-payment:1" }))).rejects.toThrow("expense requires a category");
  });

  it("are rejected when the named biller belongs to someone else", async () => {
    await expect(prepareOperation(createSupabaseStub([]), "user-1", expense({ client_mutation_id: `scheduled-payment:${PAYMENT}:2026-11-02` })))
      .rejects.toThrow("biller or remittance not found or inaccessible");
  });

  it("are accepted for the user's own biller payment", async () => {
    await expect(prepareOperation(createSupabaseStub([PAYMENT]), "user-1", expense({ client_mutation_id: `scheduled-payment:${PAYMENT}:2026-11-02` })))
      .resolves.toMatchObject({ payload: { client_mutation_id: `scheduled-payment:${PAYMENT}:2026-11-02` } });
  });

  it.each(["record:record-1", "2026-11-02"])("syncs a new uncategorized biller before its payment (%s)", async (suffix) => {
    const sqlite = new DatabaseSync(":memory:");
    const ownedPayments: string[] = [];
    const supabase = createSupabaseStub(ownedPayments);
    const operations = [
      {
        ...expense({}), entity: "scheduled_payments", record_id: PAYMENT,
        payload: { name: "Family remittance", source_account_id: "account-1", subcategory_id: null,
          amount_centavos: 1000, frequency: "once", starts_on: "2026-11-02" },
      },
      expense({ subcategory_id: null, client_mutation_id: `scheduled-payment:${PAYMENT}:${suffix}` }),
      {
        ...expense({}), entity: "scheduled_payment_records", record_id: "record-1",
        payload: { scheduled_payment_id: PAYMENT, transaction_id: "transaction-1", occurrence_date: "2026-11-02",
          payment_date: "2026-11-02", amount_centavos: 1000 },
      },
    ];
    try {
      sqlite.exec("CREATE TABLE sync_queue (entity TEXT, operation_type TEXT, created_at TEXT, operation_index INTEGER)");
      const insert = sqlite.prepare("INSERT INTO sync_queue VALUES (?, 'create', '2026-11-02T00:00:00Z', ?)");
      operations.forEach((operation, index) => insert.run(operation.entity, index));
      const rows = sqlite.prepare(`SELECT operation_index FROM sync_queue ORDER BY ${syncQueueOrderByClause}`).all();
      for (const row of rows) {
        const operation = operations[Number(row.operation_index)]!;
        await prepareOperation(supabase, "user-1", operation);
        if (operation.entity === "scheduled_payments") ownedPayments.push(operation.record_id);
      }
      expect(rows.map((row) => operations[Number(row.operation_index)]!.entity))
        .toEqual(["scheduled_payments", "transactions", "scheduled_payment_records"]);
    } finally {
      sqlite.close();
    }
  });
});
