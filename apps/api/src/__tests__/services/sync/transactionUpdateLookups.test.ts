import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";

// Every table read, with each owned row found and the transaction a transfer.
function countingStub() {
  const reads: string[] = [];
  return {
    reads,
    client: {
      from: (table: string) => {
        reads.push(table);
        const query = {
          select: () => query,
          eq: () => query,
          neq: () => query,
          maybeSingle: async () => ({ data: { id: "row", transaction_type: "transfer" }, error: null }),
        };
        return query;
      },
    } as never,
  };
}

it("checks each account on a transaction update once", async () => {
  const { reads, client } = countingStub();

  await prepareOperation(client, "user-1", {
    operation_id: "operation-1",
    entity: "transactions",
    record_id: "transaction-1",
    operation_type: "update",
    base_version: 1,
    changed_fields: ["source_account_id", "destination_account_id"],
    payload: { source_account_id: "account-1", destination_account_id: "account-2" },
  });

  expect(reads.filter((table) => table === "financial_accounts")).toHaveLength(2);
  expect(reads.filter((table) => table === "transactions")).toHaveLength(1);
});
