export const MANILA_TIME_ZONE = "Asia/Manila";

// The calendar month containing `now` in Manila time, as YYYY-MM-DD start and end dates.
export function currentCalendarMonth(now = new Date()): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TIME_ZONE, year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  return { start: new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
}
