import { jest } from "@jest/globals";

const mockInitDatabase = jest.fn<(...args: any[]) => any>();
jest.mock("../../client", () => ({ initDatabase: (...args: any[]) => mockInitDatabase(...args) }));
// babel-preset-expo rewrites EXPO_PUBLIC_* reads into this ESM module, which Jest does not transform.
jest.mock("expo/virtual/env", () => ({ env: process.env }));

function makeDb() {
  return {
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql.includes("FROM sync_state")) return { device_id: "device-1", pull_cursor: null, pull_pending: 0 };
      if (sql.includes("FROM categories")) return { count: 1 };
      return null;
    }),
    getAllAsync: jest.fn(async () => []),
    runAsync: jest.fn(async () => ({ changes: 0 })),
  };
}

describe("runSync push-only mode", () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock<(...args: any[]) => any>;

  beforeEach(() => {
    jest.resetModules();
    mockInitDatabase.mockReset();
    fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ payload: { changes: {}, has_more: false, cursors: {} } }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("skips the pull and leaves the pull cursors untouched", async () => {
    const db = makeDb();
    mockInitDatabase.mockResolvedValue(db);

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token", { pull: false });

    expect(result).toEqual({ pushed: 0, pulled: 0, errors: 0, pendingPushes: 0, successful: true, hasMore: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it("still pulls by default", async () => {
    mockInitDatabase.mockResolvedValue(makeDb());

    const { runSync } = await import("../runSync");
    await runSync("user-1", "device-1", "token");

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/odin/api/sync/pull"), expect.anything());
  });

  it("runs a requested pull after an in-flight push-only sync instead of reusing it", async () => {
    mockInitDatabase.mockResolvedValue(makeDb());

    const { runSync } = await import("../runSync");
    const pushOnly = runSync("user-1", "device-1", "token", { pull: false });
    const full = runSync("user-1", "device-1", "token");
    await Promise.all([pushOnly, full]);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/odin/api/sync/pull"), expect.anything());
  });
});
