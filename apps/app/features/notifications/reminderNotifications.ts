import * as Notifications from "expo-notifications";
import type { DashboardItemTarget, DashboardReminders } from "../dashboard/types";
import { planReminderNotifications, REMINDER_NOTIFICATION_PREFIX } from "./reminderNotificationPlan";

const CHANNEL_ID = "reminders";
const TARGET_KINDS = new Set<DashboardItemTarget["kind"]>(["biller", "income", "debt", "credit_card", "savings", "observation"]);

let setup: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();

// Android 13+ only shows the permission prompt once a channel exists, so the channel comes first.
function ensureSetup(): Promise<void> {
  setup ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: "Reminders", importance: Notifications.AndroidImportance.HIGH });
  })().catch((error: unknown) => {
    setup = null;
    throw error;
  });
  return setup;
}

// Asks only while the user has never answered, so a denial is respected.
async function hasPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.status !== Notifications.PermissionStatus.UNDETERMINED || !current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function scheduledReminderIds(): Promise<string[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.map((request) => request.identifier).filter((id) => id.startsWith(REMINDER_NOTIFICATION_PREFIX));
}

// Calls run one at a time, so two dashboard refreshes never interleave cancels and schedules.
function enqueue(task: () => Promise<void>): Promise<void> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

// Replaces the scheduled reminders with the current Needs Attention and Upcoming items.
// The app cannot run in the background, so this runs whenever the dashboard reloads them.
export function syncReminderNotifications(reminders: DashboardReminders, now = new Date()): Promise<void> {
  return enqueue(async () => {
    await ensureSetup();
    if (!(await hasPermission())) return;
    const planned = planReminderNotifications(reminders, now);
    const keep = new Set(planned.map((notification) => notification.identifier));
    const stale = (await scheduledReminderIds()).filter((id) => !keep.has(id));
    await Promise.all(stale.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    // Rescheduling an existing identifier replaces it, which picks up a renamed item.
    await Promise.all(planned.map((notification) => Notifications.scheduleNotificationAsync({
      identifier: notification.identifier,
      content: { title: notification.title, body: notification.body, data: { target: notification.target } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notification.fireAt, channelId: CHANNEL_ID },
    })));
  });
}

// Sign-out: the next account on this device must not receive this user's reminders.
export function cancelReminderNotifications(): Promise<void> {
  return enqueue(async () => {
    const ids = await scheduledReminderIds();
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  });
}

// The dashboard target stored on a reminder notification, or null for any other notification.
export function reminderTargetFromNotification(response: Notifications.NotificationResponse): DashboardItemTarget | null {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const { request } = response.notification;
  if (!request.identifier.startsWith(REMINDER_NOTIFICATION_PREFIX)) return null;
  const target = request.content.data?.target as Partial<DashboardItemTarget> | undefined;
  if (!target || typeof target.id !== "string" || !target.kind || !TARGET_KINDS.has(target.kind)) return null;
  return { kind: target.kind, id: target.id };
}
