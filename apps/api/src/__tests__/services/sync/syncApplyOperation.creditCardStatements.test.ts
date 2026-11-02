import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";

function createSupabaseStub() {
  return {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => {
          if (table === "credit_card_cycles") {
            return { data: { id: "cycle-1", cycle_start_date: "2026-01-01", statement_date: null, account_id: "card-1" }, error: null };
          }
          if (table === "credit_card_statements") {
            return { data: { id: "statement-1", cycle_id: "cycle-1" }, error: null };
          }
          return { data: { id: "card-1" }, error: null };
        },
      };
      return query;
    },
  } as never;
}

const statementOperation = {
  operation_id: "operation-1", entity: "credit_card_statements", record_id: "statement-1",
  operation_type: "create" as const, base_version: null,
  changed_fields: ["cycle_id", "statement_date", "statement_balance_centavos", "minimum_due_centavos", "due_date"],
};

it("prepares a valid credit-card statement create", async () => {
  const prepared = await prepareOperation(createSupabaseStub(), "user-1", {
    ...statementOperation,
    payload: {
      cycle_id: "cycle-1", statement_date: "2026-02-01", due_date: "2026-02-20",
      statement_balance_centavos: 10000, minimum_due_centavos: 1000,
    },
  });
  expect(prepared.payload).toEqual({
    cycle_id: "cycle-1", statement_date: "2026-02-01", due_date: "2026-02-20",
    statement_balance_centavos: 10000, minimum_due_centavos: 1000, finance_charge_centavos: 0,
    authoritative: true,
  });
});

it("rejects a statement whose minimum due exceeds the balance", async () => {
  await expect(prepareOperation(createSupabaseStub(), "user-1", {
    ...statementOperation,
    payload: {
      cycle_id: "cycle-1", statement_date: "2026-02-01", due_date: "2026-02-20",
      statement_balance_centavos: 1000, minimum_due_centavos: 1001,
    },
  })).rejects.toThrow("minimum_due_centavos must be <= statement_balance_centavos");
});

const updateOperation = {
  operation_id: "operation-2", entity: "credit_card_statements", record_id: "statement-1",
  operation_type: "update" as const, base_version: 1,
  changed_fields: ["statement_date", "due_date", "statement_balance_centavos", "minimum_due_centavos", "finance_charge_centavos"],
};

it("prepares a valid credit-card statement update", async () => {
  const payload = {
    statement_date: "2026-02-02", due_date: "2026-02-21",
    statement_balance_centavos: 12000, minimum_due_centavos: 1000, finance_charge_centavos: 250,
  };
  const prepared = await prepareOperation(createSupabaseStub(), "user-1", {
    ...updateOperation,
    payload,
  });
  expect(prepared.payload).toEqual(payload);
});

it("rejects a statement update whose minimum due exceeds the balance", async () => {
  await expect(prepareOperation(createSupabaseStub(), "user-1", {
    ...updateOperation,
    payload: {
      statement_date: "2026-02-02", due_date: "2026-02-21",
      statement_balance_centavos: 1000, minimum_due_centavos: 1001, finance_charge_centavos: 0,
    },
  })).rejects.toThrow("minimum_due_centavos must be <= statement_balance_centavos");
});

it("rejects a statement update on the billing cycle start", async () => {
  await expect(prepareOperation(createSupabaseStub(), "user-1", {
    ...updateOperation,
    payload: {
      statement_date: "2026-01-01", due_date: "2026-02-21",
      statement_balance_centavos: 12000, minimum_due_centavos: 1000, finance_charge_centavos: 0,
    },
  })).rejects.toThrow("statement_date must be after the billing cycle start and no later than today");
});

it("rejects a statement update that touches immutable fields", async () => {
  await expect(prepareOperation(createSupabaseStub(), "user-1", {
    ...updateOperation,
    changed_fields: ["cycle_id"],
    payload: { cycle_id: "cycle-2" },
  })).rejects.toThrow(/cycle_id|immutable|not allowed/i);
});
