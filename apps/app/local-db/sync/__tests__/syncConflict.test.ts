import { markSyncConflict, rebaseLegacyDebtPriorityConflict } from "../syncConflict";

describe("markSyncConflict", () => {
  it("keeps a repayment-strategy version conflict visible for resolution", async () => {
    const db = { runAsync: jest.fn(async () => ({ changes: 1 })) };

    await markSyncConflict(db, {
      operation_id: "operation-1",
      reason: "credit-card version changed",
      current_version: 3,
      conflicted_fields: ["repayment_strategy"],
    });

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed', attempts = attempts + 1"),
      JSON.stringify({
        reason: "credit-card version changed",
        currentVersion: 3,
        conflictedFields: ["repayment_strategy"],
      }),
      "operation-1",
    );
  });
});

describe("rebaseLegacyDebtPriorityConflict", () => {
  it("retries a legacy priority operation with the server version", async () => {
    const db = { runAsync: jest.fn(async () => ({ changes: 1 })) };

    await expect(rebaseLegacyDebtPriorityConflict(db, {
      operation_id: "operation-1",
      entity: "user_debt_priorities",
      base_version: null,
    }, {
      operation_id: "operation-1",
      reason: "version_conflict",
      current_version: 3,
    })).resolves.toBe(true);

    expect(db.runAsync).toHaveBeenCalledWith(
      "UPDATE sync_queue SET base_version = ?, status = 'pending', last_error = NULL WHERE operation_id = ?",
      3,
      "operation-1",
    );
  });

  it("leaves a normal priority conflict for explicit resolution", async () => {
    const db = { runAsync: jest.fn(async () => ({ changes: 1 })) };

    await expect(rebaseLegacyDebtPriorityConflict(db, {
      operation_id: "operation-1",
      entity: "user_debt_priorities",
      base_version: 2,
    }, {
      operation_id: "operation-1",
      reason: "version_conflict",
      current_version: 3,
    })).resolves.toBe(false);

    expect(db.runAsync).not.toHaveBeenCalled();
  });
});
