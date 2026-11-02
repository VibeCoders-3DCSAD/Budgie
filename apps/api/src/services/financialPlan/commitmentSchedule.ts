function addScheduleDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function addScheduleMonths(date: string, months: number, dayOfMonth?: number | null): string {
  const next = new Date(`${date}T00:00:00Z`);
  const day = dayOfMonth ?? next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next.toISOString().slice(0, 10);
}

function dateAtScheduleDay(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

type RecurrenceSchedule = { dayOfMonth?: number | null; intervalCount?: number | null; customIntervalDays?: number | null; semiMonthlyDays?: [number, number] | null };

function advanceReservationDate(date: string, frequency: string, schedule: RecurrenceSchedule): string | null {
  const interval = schedule.intervalCount && schedule.intervalCount > 0 ? schedule.intervalCount : 1;
  if (frequency === "daily") return addScheduleDays(date, interval);
  if (frequency === "weekly") return addScheduleDays(date, 7 * interval);
  if (frequency === "biweekly") return addScheduleDays(date, 14 * interval);
  if (frequency === "monthly") return addScheduleMonths(date, interval, schedule.dayOfMonth);
  if (frequency === "quarterly") return addScheduleMonths(date, 3 * interval, schedule.dayOfMonth);
  if (frequency === "yearly") return addScheduleMonths(date, 12 * interval, schedule.dayOfMonth);
  if (frequency === "custom") return schedule.customIntervalDays && schedule.customIntervalDays > 0 ? addScheduleDays(date, schedule.customIntervalDays) : null;
  if (frequency !== "semi_monthly") return null;

  const days = [...(schedule.semiMonthlyDays ?? [1, 15])].sort((left, right) => left - right);
  const current = new Date(`${date}T00:00:00Z`);
  const candidates = days.map((day) => dateAtScheduleDay(current.getUTCFullYear(), current.getUTCMonth(), day));
  return candidates.find((candidate) => candidate > date) ?? dateAtScheduleDay(current.getUTCFullYear(), current.getUTCMonth() + interval, days[0]!);
}

function retreatReservationDate(date: string, frequency: string, schedule: RecurrenceSchedule): string | null {
  const interval = schedule.intervalCount && schedule.intervalCount > 0 ? schedule.intervalCount : 1;
  if (frequency === "daily") return addScheduleDays(date, -interval);
  if (frequency === "weekly") return addScheduleDays(date, -7 * interval);
  if (frequency === "biweekly") return addScheduleDays(date, -14 * interval);
  if (frequency === "monthly") return addScheduleMonths(date, -interval, schedule.dayOfMonth);
  if (frequency === "quarterly") return addScheduleMonths(date, -3 * interval, schedule.dayOfMonth);
  if (frequency === "yearly") return addScheduleMonths(date, -12 * interval, schedule.dayOfMonth);
  if (frequency === "custom") return schedule.customIntervalDays && schedule.customIntervalDays > 0 ? addScheduleDays(date, -schedule.customIntervalDays) : null;
  if (frequency !== "semi_monthly") return null;

  const days = [...(schedule.semiMonthlyDays ?? [1, 15])].sort((left, right) => left - right);
  const current = new Date(`${date}T00:00:00Z`);
  const candidates = days.map((day) => dateAtScheduleDay(current.getUTCFullYear(), current.getUTCMonth(), day)).reverse();
  return candidates.find((candidate) => candidate < date) ?? dateAtScheduleDay(current.getUTCFullYear(), current.getUTCMonth() - interval, days[days.length - 1]!);
}

// The next date only anchors the schedule: a plan covers the whole period, so occurrences before it in the period count too.
export function scheduledReservationDates(nextDate: string | null, frequency: string | null, period: { start: string; end: string }, schedule: RecurrenceSchedule = {}): string[] {
  if (!nextDate || !frequency) return [];
  let anchor = nextDate;
  for (let index = 0; anchor > period.start && index < 10_000; index += 1) {
    const previous = retreatReservationDate(anchor, frequency, schedule);
    if (!previous || previous < period.start) break;
    anchor = previous;
  }
  const dates: string[] = [];
  let date: string | null = anchor;
  for (let index = 0; date && date <= period.end && index < 10_000; index += 1) {
    if (date >= period.start) dates.push(date);
    date = advanceReservationDate(date, frequency, schedule);
  }
  return dates;
}
