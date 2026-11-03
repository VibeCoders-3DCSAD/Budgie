import { manilaToday } from "../../../../lib/dates";

export type DebtTrendRange = "month" | "year" | "payoff" | "all";

export function currentDebtTrendWindow(range: DebtTrendRange, payoffDate?: string, today = new Date()): { start: string; end: string } {
  const philippineToday = manilaToday(today);
  const [year, month, day] = philippineToday.split("-").map(Number) as [number, number, number];
  if (range === "payoff") return { start: philippineToday, end: payoffDate ?? philippineToday };
  if (range === "year") {
    const lastDayNextYear = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
    return { start: philippineToday, end: `${year + 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDayNextYear)).padStart(2, "0")}` };
  }
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  return { start, end };
}

export function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function filterDebtTrendPoints<T extends { date: string }>(points: T[], range: DebtTrendRange, payoffDate?: string): T[] {
  if (range === "all") return payoffDate ? points.filter((point) => point.date <= payoffDate) : points;
  const { start, end } = currentDebtTrendWindow(range, payoffDate);
  return points.filter((point) => point.date >= start && point.date <= end);
}
