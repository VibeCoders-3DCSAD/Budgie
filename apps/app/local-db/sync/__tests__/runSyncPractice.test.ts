import { jest } from "@jest/globals";
import type { SQLiteDatabase } from "expo-sqlite";

const mockInitDatabase = jest.fn<(...args: any[]) => any>();
jest.mock("../../client", () => ({ initDatabase: (...args: any[]) => mockInitDatabase(...args) }));
// babel-preset-expo rewrites EXPO_PUBLIC_* reads into this ESM module, which Jest does not transform.
jest.mock("expo/virtual/env", () => ({ env: process.env }));

describe("runSync during Practice Mode", () => {
  const originalFetch = global.fetch;

  afterEach(() => { global.fetch = originalFetch; });

  it("neither reads the database nor reaches the server", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { startPracticeMode, stopPracticeMode } = await import("../../../services/practiceMode");
    const { runSync } = await import("../runSync");
    startPracticeMode({} as SQLiteDatabase, jest.fn<(...args: any[]) => any>());
    try {
      const result = await runSync("user-1", "device-1", "token");
      expect(result).toEqual({ pushed: 0, pulled: 0, errors: 0, pendingPushes: 0, awaitingUser: 0, successful: true, hasMore: false });
      expect(mockInitDatabase).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      stopPracticeMode();
    }
  });

  it("reports idle when no sync is running", async () => {
    const { waitForSyncIdle } = await import("../runSync");
    await expect(waitForSyncIdle()).resolves.toBeUndefined();
  });
});
