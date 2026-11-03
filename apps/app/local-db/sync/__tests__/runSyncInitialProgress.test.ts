import { jest } from "@jest/globals";

const mockInitDatabase = jest.fn<(...args: any[]) => any>();
jest.mock("../../client", () => ({ initDatabase: (...args: any[]) => mockInitDatabase(...args) }));
// babel-preset-expo rewrites EXPO_PUBLIC_* reads into this ESM module, which Jest does not transform.
jest.mock("expo/virtual/env", () => ({ env: process.env }));
jest.mock("../pullConvergence", () => ({
  SYNCED_TABLES: ["transactions"],
  normalizePullRow: (_table: string, row: unknown) => row,
  applyPullRow: jest.fn(async () => {}),
}));

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

function page(rows: number, hasMore: boolean, remaining?: number) {
  const changes = { transactions: Array.from({ length: rows }, (_, index) => ({ id: `row-${index}` })) };
  const payload = { changes, has_more: { transactions: hasMore }, cursors: {}, successful: true, ...(remaining === undefined ? {} : { remaining: { transactions: remaining } }) };
  return Response.json({ payload }, { status: 200 });
}

describe("runSync initial sync progress", () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock<(...args: any[]) => any>;

  beforeEach(() => {
    jest.resetModules();
    mockInitDatabase.mockReset();
    mockInitDatabase.mockResolvedValue(makeDb());
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("pages past the per-sync cap and reports progress against the first page's total", async () => {
    for (let index = 0; index < 4; index++) fetchMock.mockResolvedValueOnce(page(500, true, index === 0 ? 2100 : undefined));
    fetchMock.mockResolvedValueOnce(page(100, false));
    const onProgress = jest.fn();

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token", { untilComplete: true, onProgress });

    const pullUrls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/sync/pull"));
    expect(pullUrls).toHaveLength(5);
    expect(pullUrls[0]).toContain("include_remaining=1");
    expect(pullUrls.slice(1).every((url) => !url.includes("include_remaining"))).toBe(true);
    expect(onProgress).toHaveBeenNthCalledWith(1, { received: 0, total: 2100 });
    expect(onProgress).toHaveBeenCalledWith({ received: 25, total: 2100 });
    expect(onProgress).toHaveBeenCalledWith({ received: 500, total: 2100 });
    expect(onProgress).toHaveBeenLastCalledWith({ received: 2100, total: 2100 });
    expect(result.hasMore).toBe(false);
  });

  it("keeps the normal page cap and skips the count when no progress is requested", async () => {
    fetchMock.mockImplementation(async () => page(500, true));

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token");

    const pullUrls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/sync/pull"));
    expect(pullUrls).toHaveLength(3);
    expect(pullUrls.every((url) => !url.includes("include_remaining"))).toBe(true);
    expect(result.hasMore).toBe(true);
  });
});
