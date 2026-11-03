import { isCalendarDate } from "../../../lib/date/calendarDate.js";

describe("isCalendarDate", () => {
  it("accepts real days, including leap days", () => {
    expect(isCalendarDate("2026-01-31")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true);
  });

  it("rejects days a month does not have, which Date would roll over", () => {
    for (const value of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-02-32", "2026-13-01", "2026-00-10"]) expect(isCalendarDate(value)).toBe(false);
  });

  it("rejects other shapes and non-strings", () => {
    for (const value of ["2026-9-1", "2026-09-01T00:00:00Z", "", null, 20260901]) expect(isCalendarDate(value)).toBe(false);
  });
});
