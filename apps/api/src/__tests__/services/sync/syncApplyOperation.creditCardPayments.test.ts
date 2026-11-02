import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";

function createSupabaseStub() {
  return {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        neq: () => query,
        maybeSingle: async () => {
          if (table === "credit_card_statements") return { data: { id: "statement-1", authoritative: true }, error: null };
          if (table === "financial_accounts") return { data: { id: "source-1" }, error: null };
          if (table === "transactions") return { data: { id: "transaction-1" }, error: null };
          return { data: null, error: null };
        },
      };
      return query;
    },
  } as never;
}

const paymentOperation = {
  operation_id: "operation-1", entity: "credit_card_payments", record_id: "payment-1",
  operation_type: "create" as const, base_version: null,
  changed_fields: ["cycle_id", "statement_id", "transaction_id", "amount_centavos", "payment_date", "source_account_id", "client_mutation_id"],
};

it("prepares a transaction-linked credit-card payment", async () => {
  const prepared = await prepareOperation(createSupabaseStub(), "user-1", {
    ...paymentOperation,
    payload: {
      cycle_id: "cycle-1", statement_id: "statement-1", transaction_id: "transaction-1",
      amount_centavos: 10000, payment_date: "2026-02-20", source_account_id: "source-1",
      client_mutation_id: "mutation-1", forecast_recorded_at: "2026-02-20T00:00:00.000Z",
    },
  });
  expect(prepared.payload).toMatchObject({ issuer_recognized: false, amount_centavos: 10000 });
});

it("rejects a non-positive credit-card payment", async () => {
  await expect(prepareOperation(createSupabaseStub(), "user-1", {
    ...paymentOperation,
    payload: {
      cycle_id: "cycle-1", statement_id: "statement-1", transaction_id: "transaction-1",
      amount_centavos: 0, payment_date: "2026-02-20", source_account_id: "source-1", client_mutation_id: "mutation-1", forecast_recorded_at: "2026-02-20T00:00:00.000Z",
    },
  })).rejects.toThrow("amount_centavos must be a positive integer");
});
