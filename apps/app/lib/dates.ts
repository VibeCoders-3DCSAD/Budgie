// Calendar-date helpers on "YYYY-MM-DD" strings, computed in UTC so the device time zone never shifts a day.

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

// Short months clamp to their last day. With dayOfMonth, months return to that day after a short month instead
// of drifting to the clamped date.
export function addMonths(date: string, months: number, dayOfMonth?: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  const day = dayOfMonth ?? next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next.toISOString().slice(0, 10);
}

// `month` is 0-based; the day clamps to the month's last day.
export function dateAtDay(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

// Today on the Asia/Manila calendar on every device, the same day the server's auto-post job uses.
// The Philippines has no daylight saving time, so a fixed +08:00 offset is exact.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export function manilaToday(now = new Date()): string {
  return new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

// The date's day on the device's own calendar. Not the Asia/Manila day manilaToday uses.
export function formatDeviceDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
