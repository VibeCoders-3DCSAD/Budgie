import { prepareOperation } from "../../../services/sync/syncApplyOperation.js";

describe("savings allocation preference sync validation", () => {
  it("accepts an update to the allocation strategy", async () => {
    await expect(prepareOperation({} as never, "user-1", {
      operation_id: "operation-1",
      entity: "savings_allocation_preferences",
      record_id: "user-1",
      operation_type: "update",
      base_version: 1,
      changed_fields: ["strategy"],
      payload: { strategy: "avalanche" },
    })).resolves.toMatchObject({ payload: { strategy: "avalanche" } });
  });
});
