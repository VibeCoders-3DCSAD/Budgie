import type { SQLiteBindValue, SQLiteDatabase } from "expo-sqlite";
import { applyPullRow, normalizePullRow } from "../../../local-db/sync/pullConvergence";
import { PRACTICE_TABLE_ORDER, type PracticeSeed } from "./seed";
import type { Taxonomy } from "./taxonomy";

type SeedDb = Pick<SQLiteDatabase, "getFirstAsync" | "runAsync" | "withTransactionAsync">;
type Row = Record<string, unknown>;

// Stays under SQLite's oldest limit on bound values per statement, so one statement can carry many rows.
const MAX_BOUND_VALUES = 999;

// Writes the practice data into a fresh, empty database. Rows are shaped exactly as a sync pull shapes them
// (normalizePullRow), but go in as a few multi-row INSERTs instead of a lookup and an insert per row: the
// database is new, so there is nothing to look up, and each statement is a trip across to native SQLite.
// Financial plans still take the pull path, which also rebuilds each plan's child rows.
export async function applyPracticeSeed(db: SeedDb, userId: string, taxonomy: Taxonomy, seed: PracticeSeed): Promise<void> {
  const tables: [string, Row[]][] = [
    ["categories", taxonomy.categories],
    ["subcategories", taxonomy.subcategories],
    ...PRACTICE_TABLE_ORDER.map((table) => [table, seed[table]] as [string, Row[]]),
  ];
  await db.withTransactionAsync(async () => {
    for (const [table, rows] of tables) {
      const normalized = rows.map((row) => withoutUnset(normalizePullRow(table, row, userId))).filter((row) => !isDeleted(row));
      if (table === "financial_plans") {
        for (const row of normalized) await applyPullRow(db, table, row);
      } else {
        await insertRows(db, table, normalized);
      }
    }
  });
}

// Consecutive rows naming the same columns share one INSERT, split only to respect the bound-value limit.
// Row order is kept, so triggers that check earlier rows (credit-card cycles) see them as before.
async function insertRows(db: SeedDb, table: string, rows: Row[]): Promise<void> {
  let start = 0;
  while (start < rows.length) {
    const columns = Object.keys(rows[start]!);
    const perStatement = Math.max(1, Math.floor(MAX_BOUND_VALUES / Math.max(1, columns.length)));
    const signature = columns.join("\u0000");
    let end = start + 1;
    while (end < rows.length && end - start < perStatement && Object.keys(rows[end]!).join("\u0000") === signature) end += 1;
    const batch = rows.slice(start, end);
    const tuple = `(${columns.map(() => "?").join(", ")})`;
    await db.runAsync(
      `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES ${batch.map(() => tuple).join(", ")}`,
      batch.flatMap((row) => columns.map((column) => row[column] as SQLiteBindValue)),
    );
    start = end;
  }
}

// A pull never inserts a row that arrives already deleted.
function isDeleted(row: Row): boolean {
  return row.deleted === true || row.deleted === 1;
}

// Practice rows name only the columns they need; leaving the rest out lets the schema defaults apply.
function withoutUnset(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}
