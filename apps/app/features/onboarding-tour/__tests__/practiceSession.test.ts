import { jest } from "@jest/globals";
import { createSqliteHarness } from "../../../local-db/repositories/__tests__/sqliteHarness";
import { practiceTaxonomy, PRACTICE_USER } from "../practice/__tests__/practiceTaxonomy";

const mockInitDatabase = jest.fn<() => Promise<unknown>>();
const mockOpenCopy = jest.fn<(source: unknown) => Promise<unknown>>();
const mockWaitForSyncIdle = jest.fn(async () => {});
jest.mock("../../../local-db/client", () => ({
  initDatabase: () => mockInitDatabase(),
  openSchemaCopy: (source: unknown) => mockOpenCopy(source),
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
  // The practice database starts empty: its schema comes from the user's database, as in the app.
  practice = createSqliteHarness();
  const { categories, subcategories } = practiceTaxonomy();
  const insert = (table: string, rows: Record<string, unknown>[]) => {
    for (const row of rows) own.sqlite.prepare(`INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...Object.values(row) as never[]);
  };
  insert("categories", categories);
  insert("subcategories", subcategories);
  practiceClose = jest.fn(async () => {});
  mockInitDatabase.mockResolvedValue(own.db);
  mockOpenCopy.mockImplementation(async (source) => {
    const { readSchema, applySchema } = jest.requireActual<typeof import("../../../local-db/client")>("../../../local-db/client");
    await applySchema(practice.db as never, await readSchema(source as never));
    return { ...practice.db, closeAsync: practiceClose };
  });
  mockWaitForSyncIdle.mockClear();
  mockOpenCopy.mockClear();
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
  expect(mockOpenCopy).toHaveBeenCalledTimes(1);
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

it("copies the user's schema exactly, so practice data lands in the same tables, indexes, and triggers", async () => {
  const { enterPracticeMode } = await load();
  await enterPracticeMode(PRACTICE_USER);
  const schema = (harness: Harness) => harness.sqlite.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
  expect(schema(practice)).toEqual(schema(own));
});

it("builds practice data ahead of Start and uses it, building only once", async () => {
  const { preparePracticeMode, enterPracticeMode, usePracticeModeStore } = await load();
  preparePracticeMode(PRACTICE_USER);
  preparePracticeMode(PRACTICE_USER);
  await enterPracticeMode(PRACTICE_USER);
  expect(mockOpenCopy).toHaveBeenCalledTimes(1);
  expect(usePracticeModeStore.getState().active).toBe(true);
  expect(count(practice, "transactions")).toBeGreaterThan(100);
});

it("closes practice data built ahead of a tour that does not start", async () => {
  const { preparePracticeMode, discardPreparedPractice, usePracticeModeStore } = await load();
  preparePracticeMode(PRACTICE_USER);
  await discardPreparedPractice();
  expect(practiceClose).toHaveBeenCalledTimes(1);
  expect(usePracticeModeStore.getState().active).toBe(false);
});

it("builds again when the data prepared ahead failed", async () => {
  const { preparePracticeMode, enterPracticeMode, usePracticeModeStore } = await load();
  mockOpenCopy.mockRejectedValueOnce(new Error("no memory"));
  preparePracticeMode(PRACTICE_USER);
  await new Promise((resolve) => setImmediate(resolve));
  await enterPracticeMode(PRACTICE_USER);
  expect(mockOpenCopy).toHaveBeenCalledTimes(2);
  expect(usePracticeModeStore.getState().active).toBe(true);
});
