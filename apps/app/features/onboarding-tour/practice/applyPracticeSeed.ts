import type { SQLiteDatabase } from "expo-sqlite";
import { applyPullRow, normalizePullRow } from "../../../local-db/sync/pullConvergence";
import { PRACTICE_TABLE_ORDER, type PracticeSeed } from "./seed";
import type { Taxonomy } from "./taxonomy";

type SeedDb = Pick<SQLiteDatabase, "getFirstAsync" | "runAsync" | "withTransactionAsync">;

// Writes the practice data through the same path a sync pull uses, so it lands exactly as server rows would.
export async function applyPracticeSeed(db: SeedDb, userId: string, taxonomy: Taxonomy, seed: PracticeSeed): Promise<void> {
  const tables: [string, Record<string, unknown>[]][] = [
    ["categories", taxonomy.categories],
    ["subcategories", taxonomy.subcategories],
    ...PRACTICE_TABLE_ORDER.map((table) => [table, seed[table]] as [string, Record<string, unknown>[]]),
  ];
  await db.withTransactionAsync(async () => {
    for (const [table, rows] of tables) {
      for (const row of rows) await applyPullRow(db, table, withoutUnset(normalizePullRow(table, row, userId)));
    }
  });
}

// Practice rows name only the columns they need; leaving the rest out lets the schema defaults apply.
function withoutUnset(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}
