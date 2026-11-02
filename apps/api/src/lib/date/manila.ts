export const MANILA_TIME_ZONE = "Asia/Manila";

function isoDate(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

// The Manila calendar year and zero-based month containing `now`.
export function manilaYearMonth(now = new Date()): { year: number; monthIndex: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TIME_ZONE, year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  return { year, monthIndex: month - 1 };
}

// The calendar month containing `now` in Manila time, as YYYY-MM-DD start and end dates.
export function currentCalendarMonth(now = new Date()): { start: string; end: string } {
  const { year, monthIndex } = manilaYearMonth(now);
  return { start: isoDate(Date.UTC(year, monthIndex, 1)), end: isoDate(Date.UTC(year, monthIndex + 1, 0)) };
}

// The first day, as YYYY-MM-DD, of the Manila month `monthsBack` months before the one containing `now`.
export function manilaMonthStart(monthsBack: number, now = new Date()): string {
  const { year, monthIndex } = manilaYearMonth(now);
  return isoDate(Date.UTC(year, monthIndex - monthsBack, 1));
}

// Today's Manila calendar date as YYYY-MM-DD.
export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
