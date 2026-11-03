import { jest } from "@jest/globals";
import { createSqliteHarness } from "../../__tests__/sqliteHarness";
import { ensureCurrentCreditCardCycles } from "../creditCardCycles";

let harness: ReturnType<typeof createSqliteHarness>;
let mockDb: ReturnType<typeof createSqliteHarness>["db"];
jest.mock("../../../client", () => ({ initDatabase: async () => mockDb }));

const TS = "2026-01-01T00:00:00.000Z";

function addCard(id: string, cutoffDay: number) {
  harness.sqlite.prepare("INSERT INTO financial_accounts (id, user_id, name, kind, status, deleted, created_at, updated_at) VALUES (?, 'user-1', ?, 'credit_card', 'active', 0, ?, ?)").run(id, id, TS, TS);
  harness.sqlite.prepare("INSERT INTO credit_card_details (account_id, user_id, credit_limit_centavos, cutoff_day, statement_day, created_at, updated_at) VALUES (?, 'user-1', 5000000, ?, ?, ?, ?)").run(id, cutoffDay, cutoffDay, TS, TS);
}

function addCycle(id: string, accountId: string, start: string, cutoff: string) {
  harness.sqlite.prepare("INSERT INTO credit_card_cycles (id, user_id, account_id, cycle_start_date, cutoff_date, statement_date, version, deleted, created_at, updated_at) VALUES (?, 'user-1', ?, ?, ?, NULL, 1, 0, ?, ?)").run(id, accountId, start, cutoff, TS, TS);
}

function cycles(accountId: string) {
  return harness.sqlite.prepare("SELECT cycle_start_date, cutoff_date FROM credit_card_cycles WHERE account_id = ? ORDER BY cutoff_date").all(accountId);
}

describe("credit-card cycle generation", () => {
  beforeEach(async () => {
    harness = createSqliteHarness();
    await harness.migrateAll();
    mockDb = harness.db;
  });
  afterEach(() => harness.sqlite.close());

  test("creates the successor only after an edited cycle has closed", async () => {
    addCard("card-1", 4);
    addCycle("edited-cycle", "card-1", "2026-09-04", "2026-09-15");

    expect(await ensureCurrentCreditCardCycles("user-1", "device-1", "2026-09-15")).toMatchObject([{ id: "edited-cycle" }]);
    const ensured = await ensureCurrentCreditCardCycles("user-1", "device-1", "2026-09-16");

    expect(ensured).toMatchObject([{ cycle_start_date: "2026-09-16", cutoff_date: "2026-10-04" }]);
    expect(harness.queued("credit_card_cycles")).toMatchObject([
      { operation_type: "create", record_id: ensured[0]!.id, payload: { account_id: "card-1", cycle_start_date: "2026-09-16", cutoff_date: "2026-10-04" } },
    ]);
  });

  test("fills every month missed during a long absence, oldest first", async () => {
    addCard("card-1", 4);
    addCycle("june", "card-1", "2026-05-05", "2026-06-04");

    const ensured = await ensureCurrentCreditCardCycles("user-1", "device-1", "2026-09-16");

    expect(ensured).toMatchObject([{ cycle_start_date: "2026-09-05", cutoff_date: "2026-10-04" }]);
    expect(cycles("card-1")).toEqual([
      { cycle_start_date: "2026-05-05", cutoff_date: "2026-06-04" },
      { cycle_start_date: "2026-06-05", cutoff_date: "2026-07-04" },
      { cycle_start_date: "2026-07-05", cutoff_date: "2026-08-04" },
      { cycle_start_date: "2026-08-05", cutoff_date: "2026-09-04" },
      { cycle_start_date: "2026-09-05", cutoff_date: "2026-10-04" },
    ]);
    expect(harness.queued("credit_card_cycles").map((op) => op.payload.cutoff_date)).toEqual(["2026-07-04", "2026-08-04", "2026-09-04", "2026-10-04"]);
  });

  test("handles current, behind and new cards together in card order", async () => {
    addCard("current", 15);
    addCard("behind", 20);
    addCard("new", 10);
    addCycle("current-open", "current", "2026-09-16", "2026-10-15");
    addCycle("behind-closed", "behind", "2026-07-21", "2026-08-20");

    const ensured = await ensureCurrentCreditCardCycles("user-1", "device-1", "2026-10-01");

    expect(ensured.map(({ account_id, cycle_start_date, cutoff_date }) => ({ account_id, cycle_start_date, cutoff_date }))).toEqual([
      { account_id: "current", cycle_start_date: "2026-09-16", cutoff_date: "2026-10-15" },
      { account_id: "behind", cycle_start_date: "2026-09-21", cutoff_date: "2026-10-20" },
      { account_id: "new", cycle_start_date: "2026-09-11", cutoff_date: "2026-10-10" },
    ]);
    expect(cycles("current")).toHaveLength(1);
  });

  test("reads current cycles for many cards in a fixed number of queries", async () => {
    for (let index = 1; index <= 5; index += 1) {
      addCard(`card-${index}`, 15);
      addCycle(`cycle-${index}`, `card-${index}`, "2026-09-16", "2026-10-15");
    }
    const getAll = jest.spyOn(mockDb, "getAllAsync");
    const getFirst = jest.spyOn(mockDb, "getFirstAsync");
    const run = jest.spyOn(mockDb, "runAsync");

    expect(await ensureCurrentCreditCardCycles("user-1", "device-1", "2026-10-01")).toHaveLength(5);

    // The card list and the open cycles; nothing per card.
    expect(getAll).toHaveBeenCalledTimes(2);
    expect(getFirst).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
