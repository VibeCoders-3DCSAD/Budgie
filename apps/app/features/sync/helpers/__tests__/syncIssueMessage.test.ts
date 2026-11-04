import { syncIssueMessage } from "../syncIssueMessage";

describe("syncIssueMessage", () => {
  it("explains a change that is too large to sync", () => {
    expect(syncIssueMessage({ failure_message: "This change could not be synced.", last_error: "payload_too_large" }))
      .toBe("This change is too big and can't be synced with the server. Discard this to continue.");
  });

  it("keeps the queued message for any other reason", () => {
    expect(syncIssueMessage({ failure_message: "Category could not be updated.", last_error: "invalid_operation" })).toBe("Category could not be updated.");
    expect(syncIssueMessage({ failure_message: "Category could not be updated.", last_error: null })).toBe("Category could not be updated.");
  });
});
