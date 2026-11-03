import { createSqliteHarness } from "../../__tests__/sqliteHarness";
import { createSavingsGoal, getSavingsGoal, updateSavingsGoal } from "../savingsGoals";
import { listActiveSavingsGoalAccounts } from "../savingsGoalAccounts";

let harness: ReturnType<typeof createSqliteHarness>;
let mockSqlite: ReturnType<typeof createSqliteHarness>["sqlite"];
let mockDb: ReturnType<typeof createSqliteHarness>["db"];
jest.mock("../../../client", () => ({ initDatabase: async () => mockDb }));

const input = { name: "Travel", linkedAccountId: "active-account", goalType: "custom" as const, targetAmountCentavos: 100_000, startingAmountCentavos: 0, targetDate: "2026-12-31", priority: "high" as const };

describe("savings goal account persistence in SQLite", () => {
  beforeEach(async () => {
    // The app's full migration chain, so the fixture cannot drift from the schema the repositories write.
    harness = createSqliteHarness();
    await harness.migrateAll();
    mockSqlite = harness.sqlite;
    mockDb = harness.db;
    mockSqlite.exec(`
      INSERT INTO financial_accounts (id, user_id, name, kind, status, deleted, created_at, updated_at) VALUES
        ('active-account', 'user-1', 'Main account', 'bank', 'active', 0, '2026-10-01', '2026-10-01'),
        ('other-account', 'user-2', 'Other user', 'bank', 'active', 0, '2026-10-01', '2026-10-01'),
        ('archived-account', 'user-1', 'Archived', 'bank', 'archived', 0, '2026-10-01', '2026-10-01'),
        ('deleted-account', 'user-1', 'Deleted', 'bank', 'active', 1, '2026-10-01', '2026-10-01'),
        ('credit-card', 'user-1', 'Rewards Visa', 'credit_card', 'active', 0, '2026-10-01', '2026-10-01');
    `);
  });
  afterEach(() => mockSqlite.close());

  it("persists the link in the goal, its read model, and its sync payload", async () => {
    const result = await createSavingsGoal("user-1", "device-1", input);
    expect(result.goal.linkedAccountId).toBe("active-account");
    expect(result.goal.linkedAccountName).toBe("Main account");
    expect(result.operation.payload.linked_account_id).toBe("active-account");
    expect((await getSavingsGoal("user-1", result.goal.id))?.linkedAccountId).toBe("active-account");
    expect(await getSavingsGoal("user-2", result.goal.id)).toBeNull();
  });

  it.each(["other-account", "archived-account", "deleted-account", "missing-account", "credit-card"])("rejects %s without inserting a goal or sync operation", async (linkedAccountId) => {
    await expect(createSavingsGoal("user-1", "device-1", { ...input, linkedAccountId })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockSqlite.prepare("SELECT count(*) AS count FROM savings_goals").get()?.count).toBe(0);
    expect(mockSqlite.prepare("SELECT count(*) AS count FROM sync_queue").get()?.count).toBe(0);
  });

  it("allows unrelated edits after the linked account is archived", async () => {
    const { goal } = await createSavingsGoal("user-1", "device-1", input);
    mockSqlite.exec("UPDATE financial_accounts SET status = 'archived' WHERE id = 'active-account'");
    const result = await updateSavingsGoal("user-1", "device-1", goal.id, { name: "Japan trip" });
    expect(result.goal.linkedAccountId).toBe("active-account");
    expect(result.operation?.changed_fields).toEqual(["name"]);
  });

  it("excludes credit cards and unavailable accounts from selector results and escapes wildcard searches", async () => {
    expect(await listActiveSavingsGoalAccounts("user-1")).toEqual([{ id: "active-account", name: "Main account", kind: "bank", status: "active" }]);
    expect(await listActiveSavingsGoalAccounts("user-1", "Main")).toHaveLength(1);
    expect(await listActiveSavingsGoalAccounts("user-1", "Visa")).toEqual([]);
    expect(await listActiveSavingsGoalAccounts("user-1", "%")).toEqual([]);
  });

  it("repairs an older offline create when the user links its goal", async () => {
    const { goal } = await createSavingsGoal("user-1", "device-1", input);
    mockSqlite.prepare("UPDATE savings_goals SET linked_account_id = NULL WHERE id = ?").run(goal.id);
    mockSqlite.exec("UPDATE sync_queue SET payload = json_remove(payload, '$.linked_account_id'), status = 'failed', attempts = 3, last_error = 'missing link'");
    await updateSavingsGoal("user-1", "device-1", goal.id, { linkedAccountId: "active-account" });
    const queued = mockSqlite.prepare("SELECT payload, status, attempts, last_error FROM sync_queue WHERE operation_type = 'create'").get();
    expect(JSON.parse(String(queued?.payload)).linked_account_id).toBe("active-account");
    expect(queued).toMatchObject({ status: "pending", attempts: 0, last_error: null });
  });

});
