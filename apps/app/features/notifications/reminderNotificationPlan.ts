import { addDays, manilaToday } from "../../lib/dates";
import type { DashboardItemTarget, DashboardReminder, DashboardReminders } from "../dashboard/types";

export type PlannedReminderNotification = {
  identifier: string;
  title: string;
  body: string;
  fireAt: Date;
  target: DashboardItemTarget;
};

// Every reminder notification's identifier starts with this, so a resync only touches its own.
export const REMINDER_NOTIFICATION_PREFIX = "reminder:";
// iOS keeps at most 64 pending local notifications per app; stay under it.
export const MAX_SCHEDULED_REMINDERS = 60;
const ATTENTION_DAYS = 7;

// 9:00 AM on the Asia/Manila calendar. The Philippines has no daylight saving time, so +08:00 is exact.
function manilaMorning(date: string): Date {
  return new Date(`${date}T09:00:00+08:00`);
}

function dueVerb(item: DashboardReminder): string {
  return item.target.kind === "income" ? "is expected" : "is due";
}

// Lock-screen text names the item but never shows an amount.
function upcomingNotifications(item: DashboardReminder): PlannedReminderNotification[] {
  const dayBefore = { when: "tomorrow", date: addDays(item.date, -1) };
  const dueDay = { when: "today", date: item.date };
  return [dayBefore, dueDay].map(({ when, date }) => ({
    identifier: `${REMINDER_NOTIFICATION_PREFIX}upcoming:${item.id}:${date}`,
    title: `${item.title} ${dueVerb(item)} ${when}`,
    body: item.detail,
    fireAt: manilaMorning(date),
    target: item.target,
  }));
}

// Needs Attention repeats each morning while the item stays unresolved; a resync drops it once resolved.
function attentionNotifications(item: DashboardReminder, firstDate: string): PlannedReminderNotification[] {
  return Array.from({ length: ATTENTION_DAYS }, (_, offset) => {
    const date = addDays(firstDate, offset);
    return {
      identifier: `${REMINDER_NOTIFICATION_PREFIX}attention:${item.id}:${date}`,
      title: `Needs attention: ${item.title}`,
      body: item.detail,
      fireAt: manilaMorning(date),
      target: item.target,
    };
  });
}

export function planReminderNotifications(reminders: DashboardReminders, now = new Date()): PlannedReminderNotification[] {
  const today = manilaToday(now);
  const firstAttentionDate = manilaMorning(today) > now ? today : addDays(today, 1);
  const planned = [
    ...reminders.attention.items.flatMap((item) => attentionNotifications(item, firstAttentionDate)),
    ...reminders.upcoming.items.flatMap(upcomingNotifications),
  ];
  return planned
    .filter((notification) => notification.fireAt > now)
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || a.identifier.localeCompare(b.identifier))
    .slice(0, MAX_SCHEDULED_REMINDERS);
}
