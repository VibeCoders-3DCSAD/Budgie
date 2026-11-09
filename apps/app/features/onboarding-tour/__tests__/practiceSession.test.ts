import { jest } from "@jest/globals";
import { createSqliteHarness } from "../../../local-db/repositories/__tests__/sqliteHarness";
import { practiceTaxonomy, PRACTICE_USER } from "../practice/__tests__/practiceTaxonomy";

const mockInitDatabase = jest.fn<() => Promise<unknown>>();
const mockOpenMigrated = jest.fn<() => Promise<unknown>>();
const mockWaitForSyncIdle = jest.fn(async () => {});
jest.mock("../../../local-db/client", () => ({
  initDatabase: () => mockInitDatabase(),
  openMigratedDatabase: () => mockOpenMigrated(),
  loadMigrations: async () => [],
}));
jest.mock("../../../local-db/sync/runSync", () => ({ waitForSyncIdle: () => mockWaitForSyncIdle() }));
jest.mock("../../../lib/localAccess", () => ({ authorizedServerFetch: jest.fn() }));

type Harness = ReturnType<typeof createSqliteHarness>;
let own: Harness;
let practice: Harness;
let practiceClose: jest.Mock<() => Promise<void>>;

async function migrated(): Promise<Harness> {
  const harness = createSqliteHarness();
  await harness.migrateAll();
  return harness;
}

function count(harness: Harness, table: string): number {
  return (harness.sqlite.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number }).count;
}

beforeEach(async () => {
  jest.resetModules();
  own = await migrated();
  practice = await migrated();
  const { categories, subcategories } = practiceTaxonomy();
  const insert = (table: string, rows: Record<string, unknown>[]) => {
    for (const row of rows) own.sqlite.prepare(`INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...Object.values(row) as never[]);
  };
  insert("categories", categories);
  insert("subcategories", subcategories);
  practiceClose = jest.fn(async () => {});
  mockInitDatabase.mockResolvedValue(own.db);
  mockOpenMigrated.mockResolvedValue({ ...practice.db, closeAsync: practiceClose });
  mockWaitForSyncIdle.mockClear();
  mockOpenMigrated.mockClear();
});
afterEach(() => { own.sqlite.close(); practice.sqlite.close(); });

async function load() {
  const session = await import("../services/practiceSession");
  const { usePracticeModeStore } = await import("../../../services/practiceMode");
  const cache = await import("../../ledger/transactionCache");
  return { ...session, usePracticeModeStore, cache };
}

it("seeds the practice database with the user's own categories and leaves their data untouched", async () => {
  const { enterPracticeMode, usePracticeModeStore } = await load();
  const ownTransactionsBefore = count(own, "transactions");
  await enterPracticeMode(PRACTICE_USER);
  expect(usePracticeModeStore.getState().active).toBe(true);
  expect(count(practice, "subcategories")).toBe(count(own, "subcategories"));
  expect(count(practice, "transactions")).toBeGreaterThan(100);
  expect(count(own, "transactions")).toBe(ownTransactionsBefore);
  expect(count(own, "sync_queue")).toBe(0);
  expect(mockWaitForSyncIdle).toHaveBeenCalledTimes(1);
});

it("opens one practice database when the tour is started twice at once", async () => {
  const { enterPracticeMode } = await load();
  await Promise.all([enterPracticeMode(PRACTICE_USER), enterPracticeMode(PRACTICE_USER)]);
  await enterPracticeMode(PRACTICE_USER);
  expect(mockOpenMigrated).toHaveBeenCalledTimes(1);
});

it("returns to the user's data, closes the practice database, and clears cached rows", async () => {
  const { enterPracticeMode, exitPracticeMode, usePracticeModeStore, cache } = await load();
  await enterPracticeMode(PRACTICE_USER);
  cache.writeTransactionCache("key", { rows: [], totals: {} as never, hasMore: false });
  await exitPracticeMode();
  expect(usePracticeModeStore.getState()).toMatchObject({ active: false, database: null });
  expect(practiceClose).toHaveBeenCalledTimes(1);
  expect(cache.readTransactionCache("key")).toBeNull();
  await exitPracticeMode();
  expect(practiceClose).toHaveBeenCalledTimes(1);
});

it("stays on the user's data and closes the practice database when seeding fails", async () => {
  const { enterPracticeMode, usePracticeModeStore } = await load();
  mockWaitForSyncIdle.mockRejectedValueOnce(new Error("sync stuck"));
  await expect(enterPracticeMode(PRACTICE_USER)).rejects.toThrow("sync stuck");
  expect(usePracticeModeStore.getState().active).toBe(false);
  expect(practiceClose).toHaveBeenCalledTimes(1);
});

it("waits for a tour that is still starting before ending it", async () => {
  const { enterPracticeMode, exitPracticeMode, usePracticeModeStore } = await load();
  const starting = enterPracticeMode(PRACTICE_USER);
  await exitPracticeMode();
  await starting;
  expect(usePracticeModeStore.getState().active).toBe(false);
  expect(practiceClose).toHaveBeenCalledTimes(1);
});
