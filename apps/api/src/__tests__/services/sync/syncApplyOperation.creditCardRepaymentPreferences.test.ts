import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";

function createSupabaseStub() {
  return {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: { id: "card-1" }, error: null }),
      };
      return query;
    },
  } as never;
}

const operation = {
  operation_id: "operation-1",
  entity: "credit_card_repayment_preferences",
  record_id: "card-1",
  changed_fields: ["account_id", "strategy", "custom_amount_centavos", "percentage_bps"],
};

it("prepares a custom repayment preference", async () => {
  const prepared = await prepareOperation(createSupabaseStub(), "user-1", {
    ...operation,
    operation_type: "create",
    base_version: null,
    payload: {
      account_id: "card-1",
      strategy: "custom_payment",
      custom_amount_centavos: 5000,
      percentage_bps: null,
    },
  });

  expect(prepared.payload).toEqual({
    account_id: "card-1",
    strategy: "custom_payment",
    custom_amount_centavos: 5000,
    percentage_bps: null,
  });
});

it("rejects an invalid percentage repayment preference", async () => {
  await expect(prepareOperation(createSupabaseStub(), "user-1", {
    ...operation,
    operation_type: "update",
    base_version: 1,
    payload: {
      account_id: "card-1",
      strategy: "percentage_of_statement",
      custom_amount_centavos: null,
      percentage_bps: 10_001,
    },
  })).rejects.toThrow("percentage_bps must be between 1 and 10000");
});
