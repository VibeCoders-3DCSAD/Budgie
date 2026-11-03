import { jest } from "@jest/globals";

const mockInitDatabase = jest.fn<(...args: any[]) => any>();

jest.mock("../../../client", () => ({
  initDatabase: (...args: any[]) => mockInitDatabase(...args),
}));

describe("credit-card statements", () => {
  beforeEach(() => {
    jest.resetModules();
    mockInitDatabase.mockReset();
  });

  afterEach(() => jest.useRealTimers());

  test("rejects a statement dated before its billing-cycle cutoff", async () => {
    const db = {
      getFirstAsync: jest.fn(async () => ({
        id: "cycle-1",
        cutoff_date: "2026-01-31",
        statement_date: null,
      })),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (work: (tx: unknown) => Promise<void>) => work(db)),
    };
    mockInitDatabase.mockResolvedValue(db);

    const { createCreditCardStatement } = await import("../creditCardStatements");

    await expect(createCreditCardStatement("user-1", "device-1", {
      cycle_id: "cycle-1",
      statement_date: "2026-01-30",
      due_date: "2026-02-21",
      statement_balance_centavos: 120000,
      minimum_due_centavos: 10000,
    })).rejects.toThrow("Statement date must be on or after the billing-cycle cutoff and no later than today.");

    expect(db.runAsync).not.toHaveBeenCalled();
  });

  test("treats the cycle as closed once its cutoff day has ended in Manila", async () => {
    // 16:30 UTC on Jan 31 is already Feb 1 in Manila, so the Jan 31 cycle has closed.
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] }).setSystemTime(new Date("2026-01-31T16:30:00.000Z"));
    const db = {
      getFirstAsync: jest.fn(async () => ({ id: "cycle-1", cutoff_date: "2026-01-31", statement_date: null })),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (work: (tx: unknown) => Promise<void>) => work(db)),
    };
    mockInitDatabase.mockResolvedValue(db);

    const { createCreditCardStatement } = await import("../creditCardStatements");

    // The closed-cycle guard passes; the statement date then fails the cutoff check instead.
    await expect(createCreditCardStatement("user-1", "device-1", {
      cycle_id: "cycle-1",
      statement_date: "2026-01-30",
      due_date: "2026-02-21",
      statement_balance_centavos: 120000,
      minimum_due_centavos: 10000,
    })).rejects.toThrow("Statement date must be on or after the billing-cycle cutoff");
  });

  test("accepts a statement dated the Manila day on a device whose own day is still the cutoff day", async () => {
    // 20:00 UTC on Jan 31 (15:00 at UTC-5) is already 04:00 on Feb 1 in Manila, so Feb 1 is today for the statement.
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] }).setSystemTime(new Date("2026-01-31T20:00:00.000Z"));
    const db = {
      getFirstAsync: jest.fn<(...args: any[]) => Promise<unknown>>()
        .mockResolvedValueOnce({ id: "cycle-1", cutoff_date: "2026-01-31", statement_date: null })
        .mockResolvedValueOnce({ id: "statement-1" }),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (work: (tx: unknown) => Promise<void>) => work(db)),
    };
    mockInitDatabase.mockResolvedValue(db);

    const { createCreditCardStatement } = await import("../creditCardStatements");

    // Both date checks pass; the duplicate-statement check is the first to fail.
    await expect(createCreditCardStatement("user-1", "device-1", {
      cycle_id: "cycle-1",
      statement_date: "2026-02-01",
      due_date: "2026-02-21",
      statement_balance_centavos: 120000,
      minimum_due_centavos: 10000,
    })).rejects.toThrow("A statement has already been recorded for this billing cycle.");
  });
});
