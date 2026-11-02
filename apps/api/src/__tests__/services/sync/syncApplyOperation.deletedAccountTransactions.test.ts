import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";

function createSupabaseStub(deleted: boolean) {
  let requiresActiveAccount = false;
  let table = "";
  const query = {
    select: () => query,
    eq: (field: string, value: unknown) => {
      if (table === "financial_accounts" && field === "deleted" && value === false) {
        requiresActiveAccount = true;
      }
      return query;
    },
    or: () => query,
    maybeSingle: async () => ({
      data: deleted && !requiresActiveAccount ? { id: "account-1" } : null,
      error: null,
    }),
  };
  return { from: (nextTable: string) => { table = nextTable; return query; } } as never;
}

const transaction = {
  operation_id: "operation-1",
  entity: "transactions",
  record_id: "transaction-1",
  operation_type: "create" as const,
  base_version: null,
  changed_fields: [],
  payload: {
    transaction_type: "expense",
    transaction_date: "2026-09-07",
    amount_centavos: 1000,
    source_account_id: "account-1",
    subcategory_id: "subcategory-1",
  },
};

it("allows historical transactions to sync after their account is deleted", async () => {
  const prepared = await prepareOperation(createSupabaseStub(true), "user-1", transaction);

  expect(prepared.payload).toMatchObject({
    source_account_id: "account-1",
    transaction_type: "expense",
  });
});

it("still rejects an inaccessible account", async () => {
  await expect(
    prepareOperation(createSupabaseStub(false), "user-1", transaction),
  ).rejects.toThrow("account not found or inaccessible");
});

it("rejects moving an existing transaction onto a deleted account", async () => {
  await expect(
    prepareOperation(createSupabaseStub(true), "user-1", {
      ...transaction,
      operation_id: "operation-2",
      operation_type: "update",
      changed_fields: ["source_account_id"],
      payload: { source_account_id: "account-1" },
    }),
  ).rejects.toThrow("account not found or inaccessible");
});
