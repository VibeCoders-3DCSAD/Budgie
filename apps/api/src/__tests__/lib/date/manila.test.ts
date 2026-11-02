import { currentCalendarMonth, manilaMonthStart, manilaToday, manilaYearMonth } from "../../../lib/date/manila.js";
import { forecastHistoryStart } from "../../../services/financialPlan/period.js";

// 16:30 UTC on Oct 31 is already Nov 1 in Manila.
const MANILA_NEW_MONTH = new Date("2026-10-31T16:30:00.000Z");

describe("Manila dates", () => {
  it("uses the Manila date for today", () => {
    expect(manilaToday(new Date("2026-10-14T16:30:00.000Z"))).toBe("2026-10-15");
  });

  it("uses the Manila month, not the UTC month", () => {
    expect(manilaYearMonth(MANILA_NEW_MONTH)).toEqual({ year: 2026, monthIndex: 10 });
    expect(currentCalendarMonth(MANILA_NEW_MONTH)).toEqual({ start: "2026-11-01", end: "2026-11-30" });
  });

  it("counts months back across a year boundary", () => {
    expect(manilaMonthStart(0, MANILA_NEW_MONTH)).toBe("2026-11-01");
    expect(manilaMonthStart(11, MANILA_NEW_MONTH)).toBe("2025-12-01");
    expect(forecastHistoryStart(MANILA_NEW_MONTH)).toBe("2025-11-01");
  });
});
