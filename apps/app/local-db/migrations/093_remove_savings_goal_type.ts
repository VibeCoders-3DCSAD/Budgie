import type { Migration } from "../client";

// Savings goals are general or emergency fund, and is_emergency_fund records which.
// goal_type duplicated it (the app created every goal as "custom"), so it is dropped.
const migration: Migration = {
  version: 93,
  up: async (db) => {
    await db.execAsync(`
      UPDATE savings_goals SET is_emergency_fund = 1
      WHERE goal_type = 'emergency_fund' AND is_emergency_fund = 0 AND deleted = 0
        AND NOT EXISTS (
          SELECT 1 FROM savings_goals AS other
          WHERE other.user_id = savings_goals.user_id AND other.is_emergency_fund = 1 AND other.deleted = 0
        );
      ALTER TABLE savings_goals DROP COLUMN goal_type;
    `);
  },
};

export default migration;
