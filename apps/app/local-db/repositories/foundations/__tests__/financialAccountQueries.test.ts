import { jest } from "@jest/globals";
import { createSqliteHarness } from "../../__tests__/sqliteHarness";

const mockInitDatabase = jest.fn<() => Promise<unknown>>();
jest.mock("../../../client", () => ({ initDatabase: () => mockInitDatabase() }));

let harness: ReturnType<typeof createSqliteHarness>;

beforeEach(async () => {
  jest.resetModules();
  harness = createSqliteHarness();
  await harness.migrateAll();
  mockInitDatabase.mockResolvedValue(harness.db);
  harness.sqlite.exec(`
    INSERT INTO financial_accounts (id, user_id, name, kind, status, current_balance_centavos, sort_order, deleted, created_at, updated_at) VALUES
      ('bank', 'user-1', 'Bank', 'bank', 'active', 50000, 2, 0, '2026-10-01', '2026-10-01'),
      ('wallet', 'user-1', 'Wallet', 'cash', 'active', 1500, 1, 0, '2026-10-01', '2026-10-01'),
      ('card', 'user-1', 'Visa', 'credit_card', 'active', 0, 3, 0, '2026-10-01', '2026-10-01'),
      ('old-card', 'user-1', 'Old Visa', 'credit_card', 'archived', 0, 4, 0, '2026-10-01', '2026-10-01'),
      ('archived', 'user-1', 'Archived', 'bank', 'archived', 0, 5, 0, '2026-10-01', '2026-10-01'),
      ('deleted', 'user-1', 'Deleted', 'bank', 'active', 0, 6, 1, '2026-10-01', '2026-10-01'),
      ('other', 'user-2', 'Other user', 'bank', 'active', 0, 0, 0, '2026-10-01', '2026-10-01');
  `);
});
afterEach(() => harness.sqlite.close());

it("offers only the user's active accounts to pickers, with just the fields a picker shows", async () => {
  const { listAccountOptions } = await import("../financialFoundations");
  expect(await listAccountOptions("user-1")).toEqual([
    { id: "wallet", name: "Wallet", kind: "cash", currentBalanceCentavos: 1500 },
    { id: "bank", name: "Bank", kind: "bank", currentBalanceCentavos: 50000 },
    { id: "card", name: "Visa", kind: "credit_card", currentBalanceCentavos: 0 },
  ]);
});

it("filters full account reads by kind and status in SQL", async () => {
  const { listFinancialAccounts } = await import("../financialFoundations");
  expect((await listFinancialAccounts("user-1", { kind: "credit_card", status: "active" })).map((account) => account.id)).toEqual(["card"]);
  expect((await listFinancialAccounts("user-1", { status: "archived" })).map((account) => account.id)).toEqual(["old-card", "archived"]);
  expect((await listFinancialAccounts("user-1")).map((account) => account.id)).toEqual(["wallet", "bank", "card", "old-card", "archived"]);
});
