import { publicSyncReason } from "../../../services/sync/syncReasons.js";

describe("publicSyncReason", () => {
  it.each([
    ["debt priority version changed", "version_conflict"],
    ["savings goal version changed", "version_conflict"],
    ["record is deleted", "record_deleted"],
    ["record not found", "record_not_found"],
    ["preference not found", "record_not_found"],
    ["source account not found or inaccessible", "reference_unavailable"],
    ["settlement installment is not accessible", "reference_unavailable"],
    ["category_id does not reference an accessible active category", "reference_unavailable"],
    ["entity secret_table not supported", "sync_rejected"],
    ["operation belongs to another user", "sync_rejected"],
    [null, "sync_rejected"],
  ])("maps %p to %p", (reason, expected) => {
    expect(publicSyncReason(reason)).toBe(expected);
  });
});
