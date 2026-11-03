import { addDays } from "../../../lib/dates";
import { localToday } from "../../../features/billers/schedule";
type DateParts = { year: number; month: number; day: number };

function parseIsoDate(value: string, field: string): DateParts {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must be a valid ISO date`);
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${field} must be a valid ISO date`);
  }
  return { year, month, day };
}

export function validateIsoDate(value: string, field: string): void {
  parseIsoDate(value, field);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function effectiveDay(year: number, month: number, day: number): string {
  return formatDate(new Date(Date.UTC(year, month - 1, Math.min(day, daysInMonth(year, month)))));
}

function previousMonth(year: number, month: number): DateParts {
  return month === 1 ? { year: year - 1, month: 12, day: 1 } : { year, month: month - 1, day: 1 };
}

function nextMonth(year: number, month: number): DateParts {
  return month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
}

export type CreditCardCycleDateDefaults = {
  account_id: string;
  cutoff_day: number | string;
};

function normalizeDay(value: number | string, field: string): number {
  const day = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`${field} must be an integer between 1 and 31`);
  }
  return day;
}

export function calculateCurrentCreditCardCycle(
  defaults: CreditCardCycleDateDefaults,
  asOfDate = localToday(),
) {
  const cutoffDay = normalizeDay(defaults.cutoff_day, "cutoff_day");
  const { year, month } = parseIsoDate(asOfDate, "asOfDate");
  const thisMonthCutoff = effectiveDay(year, month, cutoffDay);
  const cutoffDate = thisMonthCutoff < asOfDate
    ? (() => { const next = nextMonth(year, month); return effectiveDay(next.year, next.month, cutoffDay); })()
    : thisMonthCutoff;
  const cutoffParts = parseIsoDate(cutoffDate, "cutoff_date");
  const previous = previousMonth(cutoffParts.year, cutoffParts.month);
  const previousCutoff = effectiveDay(previous.year, previous.month, cutoffDay);
  const cycleStartDate = addDays(previousCutoff, 1);
  return { account_id: defaults.account_id, cycle_start_date: cycleStartDate, cutoff_date: cutoffDate, statement_date: null };
}

export function calculateSuccessorCreditCardCycle(cutoffDate: string, cutoffDay: number | string) {
  const cutoffParts = parseIsoDate(cutoffDate, "cutoffDate");
  const endDay = normalizeDay(cutoffDay, "cutoff_day");
  const next = nextMonth(cutoffParts.year, cutoffParts.month);
  const cycle_start_date = addDays(cutoffDate, 1);
  return { cycle_start_date, cutoff_date: effectiveDay(next.year, next.month, endDay) };
}

export function validateCreditCardCycleDates(input: {
  cycle_start_date: string;
  cutoff_date: string;
  statement_date?: string | null;
  allowSameDay?: boolean;
}): void {
  parseIsoDate(input.cycle_start_date, "cycle_start_date");
  parseIsoDate(input.cutoff_date, "cutoff_date");
  if (input.statement_date != null) parseIsoDate(input.statement_date, "statement_date");
  if (input.cycle_start_date > input.cutoff_date) throw new Error("cycle_start_date must be on or before cutoff_date");
  if (input.statement_date != null && (input.statement_date < input.cutoff_date || (input.statement_date === input.cutoff_date && !input.allowSameDay))) {
    throw new Error("statement_date must be on or after cutoff_date");
  }
}
