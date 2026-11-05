import { DatabaseSync } from "node:sqlite";
import migration from "../093_remove_savings_goal_type";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE savings_goals (id text PRIMARY KEY, user_id text NOT NULL, name text NOT NULL, goal_type text NOT NULL, is_emergency_fund integer NOT NULL DEFAULT 0, deleted integer NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX savings_goals_one_emergency_fund_idx ON savings_goals(user_id) WHERE is_emergency_fund = 1 AND deleted = 0;
  `);
  return { sqlite, db: { execAsync: async (sql: string) => { sqlite.exec(sql); } } };
}

it("drops goal_type and keeps a goal marked only by it as the emergency fund", async () => {
  const { sqlite, db } = database();
  sqlite.exec(`
    INSERT INTO savings_goals (id, user_id, name, goal_type, is_emergency_fund) VALUES
      ('typed', 'u1', 'Rainy day', 'emergency_fund', 0),
      ('travel', 'u1', 'Travel', 'custom', 0),
      ('flagged', 'u2', 'Emergency Fund', 'custom', 1),
      ('second', 'u2', 'Old reserve', 'emergency_fund', 0);
  `);

  await migration.up(db as never);

  const columns = sqlite.prepare("SELECT name FROM pragma_table_info('savings_goals')").all().map((row) => row.name);
  expect(columns).not.toContain("goal_type");
  const flags = Object.fromEntries(sqlite.prepare("SELECT id, is_emergency_fund FROM savings_goals").all().map((row) => [row.id, row.is_emergency_fund]));
  // u2 already has a flagged emergency fund, so its second typed goal stays general.
  expect(flags).toEqual({ typed: 1, travel: 0, flagged: 1, second: 0 });
});
