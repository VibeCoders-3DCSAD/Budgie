import { MAX_SYNC_ATTEMPTS, syncQueueEligibleStatusesClause } from "../queueOrder";

describe("runSync queue selection", () => {
  it("keeps failed rows eligible until they exhaust their attempts", () => {
    expect(syncQueueEligibleStatusesClause).toBe(`status IN ('pending', 'failed') AND attempts < ${MAX_SYNC_ATTEMPTS}`);
  });
});
