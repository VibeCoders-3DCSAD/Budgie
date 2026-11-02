import { jest } from "@jest/globals";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import m001 from "../../migrations/001_sync_tables";

const mockInitDatabase = jest.fn<(...args: any[]) => any>();
jest.mock("../../client", () => ({ initDatabase: (...args: any[]) => mockInitDatabase(...args) }));
// babel-preset-expo rewrites EXPO_PUBLIC_* reads into this ESM module, which Jest does not transform.
jest.mock("expo/virtual/env", () => ({ env: process.env }));

type PushOperation = { operation_id: string };
type PushReply = (operation: PushOperation) => Record<string, unknown>;

let sqlite: DatabaseSync;

// The queue runs on real SQLite; sync state is stubbed so the run goes straight to the push.
function makeDb() {
  return {
    execAsync: async (sql: string) => { sqlite.exec(sql); },
    runAsync: async (sql: string, ...args: SQLInputValue[]) => sqlite.prepare(sql).run(...args),
    getAllAsync: async (sql: string, ...args: SQLInputValue[]) => sqlite.prepare(sql).all(...args),
    getFirstAsync: async (sql: string, ...args: SQLInputValue[]) => {
      if (sql.includes("FROM sync_state")) return { device_id: "device-1", pull_cursor: null, pull_pending: 0 };
      if (sql.includes("FROM categories")) return { count: 1 };
      return sqlite.prepare(sql).get(...args) ?? null;
    },
  };
}

function enqueue(id: string, entity = "transactions", createdAt = "2026-11-01T00:00:00.000Z") {
  sqlite.prepare(
    `INSERT INTO sync_queue (operation_id, user_id, device_id, entity, record_id, operation_type, created_at)
     VALUES (?, 'user-1', 'device-1', ?, ?, 'update', ?)`,
  ).run(id, entity, `record-${id}`, createdAt);
}

function queueRow(id: string) {
  return sqlite.prepare("SELECT status, attempts FROM sync_queue WHERE operation_id = ?").get(id) as { status: string; attempts: number };
}

describe("runSync push draining", () => {
  const originalFetch = global.fetch;
  let pushedBatches: string[][];
  let reply: PushReply;

  beforeEach(async () => {
    jest.resetModules();
    sqlite = new DatabaseSync(":memory:");
    await m001.up(makeDb() as never);
    mockInitDatabase.mockResolvedValue(makeDb());
    pushedBatches = [];
    reply = (operation) => ({ operation_id: operation.operation_id, status: "applied" });
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      const operations = JSON.parse(String(init?.body)).payload.operations as PushOperation[];
      pushedBatches.push(operations.map((operation) => operation.operation_id));
      return { ok: true, status: 200, json: async () => ({ payload: { results: operations.map(reply) } }) };
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    sqlite.close();
  });

  it("pushes past the first batch before a push-only sync reports success", async () => {
    for (let index = 0; index < 51; index++) enqueue(`op-${String(index).padStart(2, "0")}`);

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token", { pull: false });

    expect(pushedBatches.map((batch) => batch.length)).toEqual([50, 1]);
    expect(result).toMatchObject({ pushed: 51, errors: 0, pendingPushes: 0, successful: true });
  });

  it("still pushes later changes when a full first batch is permanently rejected", async () => {
    for (let index = 0; index < 50; index++) enqueue(`conflict-${String(index).padStart(2, "0")}`, "categories");
    enqueue("valid", "transactions", "2026-11-02T00:00:00.000Z");
    reply = (operation) => operation.operation_id.startsWith("conflict")
      ? { operation_id: operation.operation_id, status: "rejected", reason: "version_conflict" }
      : { operation_id: operation.operation_id, status: "applied" };

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token", { pull: false });

    expect(queueRow("valid").status).toBe("synced");
    expect(queueRow("conflict-00")).toEqual({ status: "failed", attempts: 3 });
    expect(result).toMatchObject({ pushed: 1, errors: 50, pendingPushes: 50, successful: false });

    // Exhausted rows wait for the user in Sync Issues instead of taking the next run's batch.
    pushedBatches = [];
    await runSync("user-1", "device-1", "token", { pull: false });
    expect(pushedBatches).toEqual([]);
  });

  it("retries a missing reference on later runs until it exhausts its attempts", async () => {
    enqueue("needs-parent");
    reply = (operation) => ({ operation_id: operation.operation_id, status: "rejected", reason: "reference_unavailable" });

    const { runSync } = await import("../runSync");
    await runSync("user-1", "device-1", "token", { pull: false });
    expect(queueRow("needs-parent")).toEqual({ status: "failed", attempts: 1 });
    expect(pushedBatches).toHaveLength(1);

    await runSync("user-1", "device-1", "token", { pull: false });
    await runSync("user-1", "device-1", "token", { pull: false });
    await runSync("user-1", "device-1", "token", { pull: false });
    expect(queueRow("needs-parent")).toEqual({ status: "failed", attempts: 3 });
    expect(pushedBatches).toHaveLength(3);
  });

  it("does not spend attempts on a network failure", async () => {
    enqueue("offline");
    global.fetch = jest.fn(async () => { throw new TypeError("Network request failed"); }) as unknown as typeof fetch;

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token", { pull: false });

    expect(queueRow("offline")).toEqual({ status: "pending", attempts: 0 });
    expect(result).toMatchObject({ pushed: 0, pendingPushes: 1, successful: false });
  });

  it("does not spend attempts when the server rejects the request itself", async () => {
    enqueue("inactive-device");
    global.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({}) })) as unknown as typeof fetch;

    const { runSync } = await import("../runSync");
    for (let run = 0; run < 4; run++) await runSync("user-1", "device-1", "token", { pull: false });

    expect(queueRow("inactive-device")).toEqual({ status: "pending", attempts: 0 });
  });

  it("sends a malformed operation straight to Sync Issues without holding back the rest", async () => {
    enqueue("malformed");
    enqueue("valid");
    reply = (operation) => operation.operation_id === "malformed"
      ? { operation_id: operation.operation_id, status: "rejected", reason: "invalid_operation" }
      : { operation_id: operation.operation_id, status: "applied" };

    const { runSync } = await import("../runSync");
    await runSync("user-1", "device-1", "token", { pull: false });

    expect(queueRow("malformed")).toEqual({ status: "failed", attempts: 3 });
    expect(queueRow("valid").status).toBe("synced");
  });

  it("leaves changes queued during a run for the next run", async () => {
    enqueue("before");
    reply = (operation) => {
      if (operation.operation_id === "before") enqueue("during");
      return { operation_id: operation.operation_id, status: "applied" };
    };

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token", { pull: false });

    expect(pushedBatches).toEqual([["before"]]);
    expect(queueRow("during").status).toBe("pending");
    expect(result).toMatchObject({ pendingPushes: 0, successful: true });
  });

  it("runs a push-only sync again after an in-flight one so later changes are sent", async () => {
    enqueue("first");
    let releaseFirstPush: () => void = () => {};
    const firstPushHeld = new Promise<void>((resolve) => { releaseFirstPush = resolve; });
    const fetchMock = global.fetch as unknown as jest.Mock<(...args: any[]) => any>;
    const respond = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementationOnce(async (...args: any[]) => {
      await firstPushHeld;
      return respond(...args);
    });

    const { runSync } = await import("../runSync");
    const inFlight = runSync("user-1", "device-1", "token", { pull: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    enqueue("second");
    const later = runSync("user-1", "device-1", "token", { pull: false });
    releaseFirstPush();
    await inFlight;

    await expect(later).resolves.toMatchObject({ pendingPushes: 0, successful: true });
    expect(pushedBatches).toEqual([["first"], ["second"]]);
  });
});
