import * as SQLite from "expo-sqlite";
import { API_BASE, fetchWithTimeout } from "./syncRequest";

// Registers the device unless this user's sync state already holds it. That state is written by pulls
// too, so a push answered device_not_registered calls registerDevice directly.
export async function ensureDeviceRegistered(
  db: SQLite.SQLiteDatabase,
  userId: string,
  deviceId: string,
  accessToken: string,
): Promise<void> {
  const existing = await db.getFirstAsync<{ device_id: string }>(
    "SELECT device_id FROM sync_state WHERE user_id = ?",
    userId,
  );
  if (existing?.device_id === deviceId) return;
  await registerDevice(deviceId, accessToken);
}

export async function registerDevice(deviceId: string, accessToken: string): Promise<void> {
  const response = await fetchWithTimeout(`${API_BASE}/odin/api/sync/register-device`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ payload: { device_id: deviceId } }),
  });

  if (!response.ok) {
    throw new Error(`device registration failed: ${response.status}`);
  }
}
