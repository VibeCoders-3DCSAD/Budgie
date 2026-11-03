// Due-date math for scheduled payments. Dates are ISO YYYY-MM-DD strings handled in UTC so device time zones never shift a due day.

export type ScheduledPaymentFrequency = "daily" | "weekly" | "biweekly" | "semi_monthly" | "monthly" | "quarterly" | "yearly" | "once";

export type PaymentSchedule = {
  frequency: ScheduledPaymentFrequency;
  dueDayOfMonth: number | null;
  dueSecondDayOfMonth: number | null;
  dueDayOfWeek: number | null;
  dueMonth: number | null;
  startsOn: string;
  endsOn: string | null;
};

export type OccurrenceStatus = "paid" | "partially_paid" | "overdue" | "upcoming";

export type Occurrence = {
  dueDate: string;
  scheduledCentavos: number;
  paidCentavos: number;
  remainingCentavos: number;
  status: OccurrenceStatus;
};

const DAY_MS = 86_400_000;
// Long enough to always contain one yearly occurrence.
const SEARCH_WINDOW_DAYS = 400;

function toTime(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

function toDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return toDate(toTime(date) + days * DAY_MS);
}

function monthDay(year: number, monthIndex: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return toDate(Date.UTC(year, monthIndex, Math.min(day, lastDay)));
}

function monthlyDays(schedule: PaymentSchedule, year: number, monthIndex: number): string[] {
  const startMonth = Number(schedule.startsOn.slice(5, 7)) - 1;
  const day = schedule.dueDayOfMonth;
  if (day == null) return [];
  switch (schedule.frequency) {
    case "monthly":
      return [monthDay(year, monthIndex, day)];
    case "semi_monthly":
      return schedule.dueSecondDayOfMonth == null ? [] : [day, schedule.dueSecondDayOfMonth].sort((a, b) => a - b).map((d) => monthDay(year, monthIndex, d));
    case "quarterly":
      return (((monthIndex - startMonth) % 3) + 3) % 3 === 0 ? [monthDay(year, monthIndex, day)] : [];
    case "yearly":
      return schedule.dueMonth === monthIndex + 1 ? [monthDay(year, monthIndex, day)] : [];
    default:
      return [];
  }
}

// Every due date in [from, to], inclusive, clipped to the schedule's start and end.
export function dueDatesBetween(schedule: PaymentSchedule, from: string, to: string): string[] {
  const start = from > schedule.startsOn ? from : schedule.startsOn;
  const end = schedule.endsOn && schedule.endsOn < to ? schedule.endsOn : to;
  if (start > end) return [];
  const inRange = (date: string) => date >= start && date <= end && date >= schedule.startsOn;

  if (schedule.frequency === "once") return inRange(schedule.startsOn) ? [schedule.startsOn] : [];

  if (schedule.frequency === "daily") {
    const dates: string[] = [];
    for (let time = toTime(start); time <= toTime(end); time += DAY_MS) dates.push(toDate(time));
    return dates;
  }

  if (schedule.frequency === "weekly" || schedule.frequency === "biweekly") {
    if (schedule.dueDayOfWeek == null) return [];
    const step = schedule.frequency === "weekly" ? 7 : 14;
    const startTime = toTime(schedule.startsOn);
    let time = startTime + (((schedule.dueDayOfWeek - new Date(startTime).getUTCDay()) + 7) % 7) * DAY_MS;
    const startOfRange = toTime(start);
    if (time < startOfRange) time += Math.ceil((startOfRange - time) / (step * DAY_MS)) * step * DAY_MS;
    const dates: string[] = [];
    for (; time <= toTime(end); time += step * DAY_MS) dates.push(toDate(time));
    return dates;
  }

  const dates: string[] = [];
  let year = Number(start.slice(0, 4));
  let monthIndex = Number(start.slice(5, 7)) - 1;
  while (monthDay(year, monthIndex, 1) <= end) {
    dates.push(...monthlyDays(schedule, year, monthIndex).filter(inRange));
    monthIndex += 1;
    if (monthIndex === 12) { monthIndex = 0; year += 1; }
  }
  return dates;
}

export function nextDueDate(schedule: PaymentSchedule, onOrAfter: string): string | null {
  return dueDatesBetween(schedule, onOrAfter, addDays(onOrAfter, SEARCH_WINDOW_DAYS))[0] ?? null;
}

export function previousDueDate(schedule: PaymentSchedule, onOrBefore: string): string | null {
  return dueDatesBetween(schedule, addDays(onOrBefore, -SEARCH_WINDOW_DAYS), onOrBefore).at(-1) ?? null;
}

export function occurrenceStatus(scheduledCentavos: number, paidCentavos: number, dueDate: string, today: string): OccurrenceStatus {
  if (paidCentavos >= scheduledCentavos) return "paid";
  if (dueDate < today) return "overdue";
  return paidCentavos > 0 ? "partially_paid" : "upcoming";
}

// The occurrence the user should act on: the latest past one while it is unpaid, otherwise the next one due.
// Due dates in settledDueDates were marked paid in full, so they count as paid whatever was paid against them.
export function currentOccurrence(schedule: PaymentSchedule, scheduledCentavos: number, paidByDueDate: ReadonlyMap<string, number>, today: string, settledDueDates: ReadonlySet<string> = new Set()): Occurrence | null {
  const previous = previousDueDate(schedule, addDays(today, -1));
  const previousPaid = previous ? paidByDueDate.get(previous) ?? 0 : 0;
  const dueDate = previous && previousPaid < scheduledCentavos && !settledDueDates.has(previous) ? previous : nextDueDate(schedule, today);
  if (!dueDate) return null;
  const paidCentavos = paidByDueDate.get(dueDate) ?? 0;
  const settled = settledDueDates.has(dueDate);
  return {
    dueDate,
    scheduledCentavos,
    paidCentavos,
    remainingCentavos: settled ? 0 : Math.max(scheduledCentavos - paidCentavos, 0),
    status: settled ? "paid" : occurrenceStatus(scheduledCentavos, paidCentavos, dueDate, today),
  };
}

// Occurrences a payment can be recorded against: up to three unpaid past due dates, then the next upcoming ones.
export function occurrenceChoices(schedule: PaymentSchedule, scheduledCentavos: number, paidByDueDate: ReadonlyMap<string, number>, today: string, upcoming = 3): string[] {
  const unpaidPast = dueDatesBetween(schedule, addDays(today, -SEARCH_WINDOW_DAYS), addDays(today, -1))
    .filter((date) => (paidByDueDate.get(date) ?? 0) < scheduledCentavos)
    .slice(-3);
  return [...unpaidPast, ...dueDatesBetween(schedule, today, addDays(today, SEARCH_WINDOW_DAYS)).slice(0, upcoming)];
}
