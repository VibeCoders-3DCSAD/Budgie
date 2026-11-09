jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
}));

import * as SQLite from "expo-sqlite";
import { closeDatabase, getDatabase, openMigratedDatabase, type Migration } from "../client";
import { startPracticeMode, stopPracticeMode } from "../../services/practiceMode";

const openDatabaseAsync = SQLite.openDatabaseAsync as jest.Mock;

function createDatabase() {
  return {
    execAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]),
    runAsync: jest.fn().mockResolvedValue(undefined),
    withTransactionAsync: jest.fn(async (work: () => Promise<void>) => work()),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  };
}

describe("local database initialization", () => {
  afterEach(async () => {
    await closeDatabase();
    jest.clearAllMocks();
  });

  it("retries a migration when SQLite temporarily reports a lock", async () => {
    const database = createDatabase();
    openDatabaseAsync.mockResolvedValue(database);
    const migration: Migration = {
      version: 1,
      up: jest
        .fn()
        .mockRejectedValueOnce(new Error("database is locked"))
        .mockResolvedValue(undefined),
    };

    await getDatabase([migration]);

    expect(migration.up).toHaveBeenCalledTimes(2);
    expect(database.runAsync).toHaveBeenCalledWith(
      "INSERT INTO _migrations (version) VALUES (?)",
      1,
    );
  });

  it("allows a new initialization attempt after a non-retryable failure", async () => {
    const failedDatabase = createDatabase();
    const workingDatabase = createDatabase();
    openDatabaseAsync
      .mockResolvedValueOnce(failedDatabase)
      .mockResolvedValueOnce(workingDatabase);
    const migration: Migration = {
      version: 1,
      up: jest.fn().mockRejectedValueOnce(new Error("invalid migration")),
    };

    await expect(getDatabase([migration])).rejects.toThrow("invalid migration");
    await getDatabase([]);

    expect(failedDatabase.closeAsync).toHaveBeenCalledTimes(1);
    expect(openDatabaseAsync).toHaveBeenCalledTimes(2);
  });

  it("returns the practice database while Practice Mode is active", async () => {
    const practice = createDatabase();
    startPracticeMode(practice as never, jest.fn());
    try {
      await expect(getDatabase([])).resolves.toBe(practice);
      expect(openDatabaseAsync).not.toHaveBeenCalled();
    } finally {
      stopPracticeMode();
    }
  });

  it("opens a separate migrated database without replacing the user's handle", async () => {
    const separate = createDatabase();
    openDatabaseAsync.mockResolvedValueOnce(separate);
    const migration: Migration = { version: 1, up: jest.fn().mockResolvedValue(undefined) };
    await expect(openMigratedDatabase(":memory:", [migration])).resolves.toBe(separate);
    expect(migration.up).toHaveBeenCalledWith(separate);
    expect(openDatabaseAsync).toHaveBeenCalledWith(":memory:");
    const user = createDatabase();
    openDatabaseAsync.mockResolvedValueOnce(user);
    await expect(getDatabase([])).resolves.toBe(user);
  });
});
