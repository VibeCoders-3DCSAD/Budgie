// Default for tests that load reminder scheduling without a native module. Permission starts undetermined
// and the request is granted; tests replace any of these with their own mockResolvedValue.
export const PermissionStatus = { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" };
export const AndroidImportance = { HIGH: 4 };
export const SchedulableTriggerInputTypes = { DATE: "date" };
export const DEFAULT_ACTION_IDENTIFIER = "expo.modules.notifications.actions.DEFAULT";
export const setNotificationHandler = jest.fn();
export const setNotificationChannelAsync = jest.fn(async () => null);
export const getPermissionsAsync = jest.fn(async () => ({ granted: false, status: "undetermined", canAskAgain: true }));
export const requestPermissionsAsync = jest.fn(async () => ({ granted: true, status: "granted", canAskAgain: true }));
export const getAllScheduledNotificationsAsync = jest.fn(async (): Promise<{ identifier: string }[]> => []);
export const scheduleNotificationAsync = jest.fn(async (request: { identifier: string }) => request.identifier);
export const cancelScheduledNotificationAsync = jest.fn(async () => undefined);
export const useLastNotificationResponse = jest.fn(() => null);
export const clearLastNotificationResponse = jest.fn();
