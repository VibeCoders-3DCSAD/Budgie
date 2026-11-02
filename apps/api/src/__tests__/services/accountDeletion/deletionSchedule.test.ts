import { describe, expect, it } from "@jest/globals";
import { resolveScheduledDeleteAt } from "../../../services/accountDeletion/deletionSchedule.js";

describe("resolveScheduledDeleteAt", () => {
  const now = new Date("2026-11-02T00:00:00.000Z");

  it("defaults to 30 days after now", () => {
    expect(resolveScheduledDeleteAt(undefined, now)).toEqual({ scheduledDeleteAt: "2026-12-02T00:00:00.000Z" });
  });

  it("accepts a date at least 30 days away", () => {
    expect(resolveScheduledDeleteAt("2027-01-15T00:00:00.000Z", now)).toEqual({ scheduledDeleteAt: "2027-01-15T00:00:00.000Z" });
  });

  it("rejects an earlier or invalid date", () => {
    expect(resolveScheduledDeleteAt("2026-11-20T00:00:00.000Z", now)).toEqual({ error: "scheduled_delete_at must be at least 30 days from now" });
    expect(resolveScheduledDeleteAt("not-a-date", now)).toEqual({ error: "scheduled_delete_at must be a valid date string" });
  });
});
