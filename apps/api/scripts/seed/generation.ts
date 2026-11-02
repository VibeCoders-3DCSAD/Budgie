// Shared calendar, amount, and deterministic random helpers for seed generators.
export const DAY_MS = 86_400_000;

export function toTime(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number) {
  return new Date(toTime(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function monthStartOf(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(monthStart: string, months: number) {
  const date = new Date(toTime(monthStart));
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)).toISOString().slice(0, 10);
}

// The given day of the month, clamped to the month's last day.
export function monthDate(monthStart: string, day: number) {
  const date = new Date(toTime(monthStart));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function daysOfMonth(monthStart: string) {
  const days: string[] = [];
  for (let date = monthStart; date.slice(0, 7) === monthStart.slice(0, 7); date = addDays(date, 1)) days.push(date);
  return days;
}

// The first date on the given day of the month that falls after today.
export function nextMonthlyDate(today: string, day: number) {
  const thisMonth = monthDate(monthStartOf(today), day);
  return thisMonth > today ? thisMonth : monthDate(addMonths(monthStartOf(today), 1), day);
}

export function manilaNoon(date: string) {
  return `${date}T12:00:00+08:00`;
}

// Due dates follow the Asia/Manila calendar day, the same day the server's auto-post job uses.
export function manilaToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function centavos(pesos: number) {
  return Math.round(pesos * 100);
}
