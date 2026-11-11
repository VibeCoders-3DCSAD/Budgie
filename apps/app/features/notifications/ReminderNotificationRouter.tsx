import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { usePracticeModeStore } from "../../services/practiceMode";
import { reminderTargetHref } from "../dashboard/helpers/reminderTargets";
import { reminderTargetFromNotification } from "./reminderNotifications";

// Opens the item a tapped reminder points to. Mounted inside the signed-in shell, so a tap that
// launched or woke the app waits for unlock and the first sync. It also waits out the guided tour,
// whose practice data does not contain the user's items.
export function ReminderNotificationRouter() {
  const response = Notifications.useLastNotificationResponse();
  const practice = usePracticeModeStore((state) => state.active);
  useEffect(() => {
    if (!response || practice) return;
    Notifications.clearLastNotificationResponse();
    const target = reminderTargetFromNotification(response);
    if (target) router.navigate(reminderTargetHref(target));
  }, [response, practice]);
  return null;
}
