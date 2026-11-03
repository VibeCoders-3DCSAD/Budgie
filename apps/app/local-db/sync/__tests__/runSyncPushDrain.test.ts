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

function exhaust(id: string) {
  sqlite.prepare("UPDATE sync_queue SET status = 'failed', attempts = 3 WHERE operation_id = ?").run(id);
}

// A full sync also pulls; the server has nothing new to send.
function answerPullsWithNothing() {
  // Later migrations add these; only the parts a pull with no changes touches are created here.
  sqlite.exec("CREATE TABLE sync_pull_failures (user_id TEXT, table_name TEXT, record_id TEXT, payload TEXT, updated_at TEXT)");
  sqlite.exec("ALTER TABLE sync_state ADD COLUMN pull_pending INTEGER NOT NULL DEFAULT 0");
  const respondToPush = (global.fetch as unknown as jest.Mock<(...args: any[]) => any>).getMockImplementation()!;
  global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url).includes("/sync/pull")) return Response.json({ payload: { changes: {}, has_more: {}, cursors: {} } });
    return respondToPush(url, init);
  }) as unknown as typeof fetch;
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
      return Response.json({ payload: { results: operations.map(reply) } }, { status: 200 });
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
    global.fetch = jest.fn(async () => Response.json({}, { status: 400 })) as unknown as typeof fetch;

    const { runSync } = await import("../runSync");
    for (let run = 0; run < 4; run++) await runSync("user-1", "device-1", "token", { pull: false });

    expect(queueRow("inactive-device")).toEqual({ status: "pending", attempts: 0 });
  });

  it("registers the device again and resends the batch when the server no longer knows it", async () => {
    enqueue("after-lost-registration");
    const calls: string[] = [];
    let registered = false;
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).endsWith("/sync/register-device")) {
        calls.push("register");
        registered = true;
        return Response.json({}, { status: 200 });
      }
      calls.push("push");
      if (!registered) return Response.json({ code: "device_not_registered" }, { status: 400 });
      const operations = JSON.parse(String(init?.body)).payload.operations as PushOperation[];
      return Response.json({ payload: { results: operations.map(reply) } }, { status: 200 });
    }) as unknown as typeof fetch;

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token", { pull: false });

    expect(calls).toEqual(["push", "register", "push"]);
    expect(queueRow("after-lost-registration")).toEqual({ status: "synced", attempts: 0 });
    expect(result).toMatchObject({ pushed: 1, errors: 0, pendingPushes: 0, successful: true });
  });

  it("registers again only once per run", async () => {
    enqueue("still-unregistered");
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: unknown) => {
      calls.push(String(url).endsWith("/sync/register-device") ? "register" : "push");
      if (String(url).endsWith("/sync/register-device")) return Response.json({}, { status: 200 });
      return Response.json({ code: "device_not_registered" }, { status: 400 });
    }) as unknown as typeof fetch;

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token", { pull: false });

    expect(calls).toEqual(["push", "register", "push"]);
    expect(queueRow("still-unregistered")).toEqual({ status: "pending", attempts: 0 });
    expect(result).toMatchObject({ pushed: 0, pendingPushes: 1, successful: false });
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

  it("resends a batch over the body limit in smaller batches within the same run", async () => {
    for (let index = 0; index < 50; index++) enqueue(`op-${String(index).padStart(2, "0")}`);
    const respond = (global.fetch as unknown as jest.Mock<(...args: any[]) => any>).getMockImplementation()!;
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const operations = JSON.parse(String(init?.body)).payload.operations as PushOperation[];
      if (operations.length > 25) {
        pushedBatches.push(operations.map((operation) => operation.operation_id));
        return Response.json({ error: "Payload Too Large" }, { status: 413 });
      }
      return respond(url, init);
    }) as unknown as typeof fetch;

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token", { pull: false });

    expect(pushedBatches.map((batch) => batch.length)).toEqual([50, 25, 25]);
    expect(queueRow("op-00")).toEqual({ status: "synced", attempts: 0 });
    expect(result).toMatchObject({ pushed: 50, errors: 0, pendingPushes: 0, successful: true });
  });

  it("sends an operation that is too large even alone to Sync Issues and still pushes the rest", async () => {
    enqueue("huge");
    enqueue("after-1", "transactions", "2026-11-02T00:00:00.000Z");
    enqueue("after-2", "transactions", "2026-11-02T00:00:00.000Z");
    const respond = (global.fetch as unknown as jest.Mock<(...args: any[]) => any>).getMockImplementation()!;
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const operations = JSON.parse(String(init?.body)).payload.operations as PushOperation[];
      if (operations.some((operation) => operation.operation_id === "huge")) {
        pushedBatches.push(operations.map((operation) => operation.operation_id));
        return Response.json({ error: "Payload Too Large" }, { status: 413 });
      }
      return respond(url, init);
    }) as unknown as typeof fetch;

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token", { pull: false });

    expect(pushedBatches).toEqual([["huge", "after-1", "after-2"], ["huge"], ["after-1"], ["after-2"]]);
    expect(queueRow("huge")).toEqual({ status: "failed", attempts: 3 });
    expect(queueRow("after-1").status).toBe("synced");
    expect(queueRow("after-2").status).toBe("synced");
    expect(result).toMatchObject({ pushed: 2, errors: 1, pendingPushes: 1, successful: false });

    // The exhausted row waits for the user instead of being sent again on the next run.
    pushedBatches = [];
    await runSync("user-1", "device-1", "token", { pull: false });
    expect(pushedBatches).toEqual([]);
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

  it("stops after 5,000 operations in one run and leaves the rest for the next run", async () => {
    const insert = sqlite.prepare(
      `INSERT INTO sync_queue (operation_id, user_id, device_id, entity, record_id, operation_type, created_at)
       VALUES (?, 'user-1', 'device-1', 'transactions', ?, 'update', '2026-11-01T00:00:00.000Z')`,
    );
    for (let index = 0; index <= 5_000; index++) {
      const id = `op-${String(index).padStart(4, "0")}`;
      insert.run(id, `record-${id}`);
    }

    const { runSync } = await import("../runSync");
    const first = await runSync("user-1", "device-1", "token", { pull: false });

    expect(pushedBatches.flat()).toHaveLength(5_000);
    expect(first).toMatchObject({ pushed: 5_000, errors: 0, pendingPushes: 1, successful: false });

    pushedBatches = [];
    const second = await runSync("user-1", "device-1", "token", { pull: false });
    expect(pushedBatches).toEqual([["op-5000"]]);
    expect(second).toMatchObject({ pushed: 1, pendingPushes: 0, successful: true });
  });

  it("lets a full sync succeed when the only unsent change waits in Sync Issues", async () => {
    enqueue("waiting");
    exhaust("waiting");
    enqueue("valid", "transactions", "2026-11-02T00:00:00.000Z");
    answerPullsWithNothing();

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token");

    expect(pushedBatches).toEqual([["valid"]]);
    expect(result).toMatchObject({ pushed: 1, errors: 0, pendingPushes: 1, awaitingUser: 1, successful: true });
  });

  it("keeps a push-only sync unsuccessful while a change waits in Sync Issues", async () => {
    enqueue("waiting");
    exhaust("waiting");

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token", { pull: false });

    expect(pushedBatches).toEqual([]);
    expect(result).toMatchObject({ pushed: 0, errors: 0, pendingPushes: 1, awaitingUser: 1, successful: false });
  });

  it("still fails a full sync when a change is rejected during it", async () => {
    enqueue("rejected");
    reply = (operation) => ({ operation_id: operation.operation_id, status: "rejected", reason: "invalid_operation" });
    answerPullsWithNothing();

    const { runSync } = await import("../runSync");
    const result = await runSync("user-1", "device-1", "token");

    expect(result).toMatchObject({ errors: 1, pendingPushes: 1, awaitingUser: 1, successful: false });
  });
});
