import type { ForecastPayload } from "../forecast/forecastService.js";
import { currentCalendarMonth, manilaMonthStart } from "../../lib/date/manila.js";
import { FinancialPlanInputError } from "./errors.js";

// The most history transactions read. Matches the most a forecast request accepts, so a busy year is not cut short.
export const MAX_HISTORY = 2_000;

// The first day of the twelfth Manila month before this one, where the Spending Forecast's history starts.
export function forecastHistoryStart(now = new Date()): string {
  return manilaMonthStart(12, now);
}

// The plan's calendar month. Development builds may override it with a YYYY-MM month.
export function financialPlanPeriod(planMonth?: string): { start: string; end: string } {
  if (planMonth === undefined) return currentCalendarMonth();
  if (process.env.NODE_ENV === "production" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(planMonth)) {
    throw new FinancialPlanInputError("Plan month overrides are only available in development with a valid YYYY-MM month");
  }
  return currentCalendarMonth(new Date(`${planMonth}-01T00:00:00+08:00`));
}

// The budget optimizer rejects a forecast whose month differs from the plan period.
export function forecastCoversPlanPeriod(forecast: ForecastPayload, period: { start: string }): boolean {
  return forecast.snapshot.month === period.start.slice(0, 7);
}
