import * as Notifications from "expo-notifications";
import type { DashboardReminders } from "../../dashboard/types";
import { cancelReminderNotifications, reminderTargetFromNotification, syncReminderNotifications } from "../reminderNotifications";

type Mocked = Record<"getPermissionsAsync" | "requestPermissionsAsync" | "getAllScheduledNotificationsAsync" | "scheduleNotificationAsync" | "cancelScheduledNotificationAsync" | "setNotificationChannelAsync", jest.Mock>;
const mocked = Notifications as unknown as Mocked;
const now = new Date("2026-11-11T08:00:00+08:00");
const reminders: DashboardReminders = {
  attention: { items: [], unavailable: false },
  upcoming: { items: [{ id: "savings:g1:2026-11-13", title: "Emergency fund", detail: "Savings contribution", amountCentavos: 500_00, date: "2026-11-13", target: { kind: "savings", id: "g1" } }], unavailable: false },
};

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getPermissionsAsync.mockResolvedValue({ granted: true, status: "granted", canAskAgain: true });
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([]);
});

describe("syncReminderNotifications", () => {
  it("creates the Android channel and schedules each planned reminder with its target", async () => {
    await syncReminderNotifications(reminders, now);
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith("reminders", expect.objectContaining({ name: "Reminders" }));
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: "reminder:upcoming:savings:g1:2026-11-13:2026-11-12",
      content: { title: "Emergency fund is due tomorrow", body: "Savings contribution", data: { target: { kind: "savings", id: "g1" } } },
      trigger: { type: "date", date: new Date("2026-11-12T09:00:00+08:00"), channelId: "reminders" },
    });
  });

  it("cancels its own stale reminders but leaves other notifications alone", async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: "reminder:upcoming:paid-off:2026-11-12" },
      { identifier: "reminder:upcoming:savings:g1:2026-11-13:2026-11-12" },
      { identifier: "something-else" },
    ]);
    await syncReminderNotifications(reminders, now);
    expect(mocked.cancelScheduledNotificationAsync.mock.calls).toEqual([["reminder:upcoming:paid-off:2026-11-12"]]);
  });

  it("asks for permission once while undetermined", async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, status: "undetermined", canAskAgain: true });
    await syncReminderNotifications(reminders, now);
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalled();
  });

  it("respects a denial without asking again or scheduling", async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, status: "denied", canAskAgain: true });
    await syncReminderNotifications(reminders, now);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe("cancelReminderNotifications", () => {
  it("cancels every reminder and nothing else", async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValue([{ identifier: "reminder:attention:x:2026-11-12" }, { identifier: "other" }]);
    await cancelReminderNotifications();
    expect(mocked.cancelScheduledNotificationAsync.mock.calls).toEqual([["reminder:attention:x:2026-11-12"]]);
  });
});

describe("reminderTargetFromNotification", () => {
  const response = (identifier: string, data: unknown, actionIdentifier = Notifications.DEFAULT_ACTION_IDENTIFIER) =>
    ({ actionIdentifier, notification: { request: { identifier, content: { data } } } }) as unknown as Notifications.NotificationResponse;

  it("reads the target from a tapped reminder", () => {
    expect(reminderTargetFromNotification(response("reminder:upcoming:a", { target: { kind: "debt", id: "loan" } }))).toEqual({ kind: "debt", id: "loan" });
  });

  it("ignores other notifications, other actions, and malformed targets", () => {
    expect(reminderTargetFromNotification(response("other", { target: { kind: "debt", id: "loan" } }))).toBeNull();
    expect(reminderTargetFromNotification(response("reminder:a", { target: { kind: "debt", id: "loan" } }, "dismiss"))).toBeNull();
    expect(reminderTargetFromNotification(response("reminder:a", { target: { kind: "unknown", id: "x" } }))).toBeNull();
    expect(reminderTargetFromNotification(response("reminder:a", {}))).toBeNull();
  });
});
