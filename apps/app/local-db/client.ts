import * as SQLite from "expo-sqlite";
import { getDatabaseCredentials } from "./databaseAccess";
import { tracePinStep } from "../lib/helpers/pinSetupTrace";

export type Migration = {
  version: number;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
};

const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS _migrations (
  version integer primary key,
  applied_at text not null default (datetime('now'))
);`;
const MIGRATION_LOCK_RETRY_DELAYS_MS = [50, 100, 200, 400] as const;

let db: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(
  migrations: Migration[],
): Promise<SQLite.SQLiteDatabase> {
  const credentials = getDatabaseCredentials();
  if (db) return db;
  if (!dbPromise) {
    dbPromise = (async () => {
      const opened = credentials
        ? await (await tracePinStep("database.load-encryption-module", () => import("./encryptedDatabase"))).openEncryptedDatabase(credentials.userId, credentials.key)
        : await SQLite.openDatabaseAsync("odin.db");
      try {
        await opened.execAsync("PRAGMA busy_timeout = 5000");
        await tracePinStep("database.ensure-migrations-table", () => opened.execAsync(MIGRATIONS_TABLE));
        await runMigrations(opened, migrations);
        db = opened;
        return opened;
      } catch (error) {
        await opened.closeAsync();
        throw error;
      }
    })().catch((error) => {
      // A rejected promise must not permanently block later initialization attempts.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

async function runMigrations(
  db: SQLite.SQLiteDatabase,
  migrations: Migration[],
): Promise<void> {
  const applied = await db.getAllAsync<{ version: number }>(
    "SELECT version FROM _migrations ORDER BY version",
  );
  const appliedVersions = new Set(applied.map((r) => r.version));

  for (const m of migrations.sort((a, b) => a.version - b.version)) {
    if (appliedVersions.has(m.version)) continue;
    await tracePinStep(`database.migrate.${m.version}`, () => runMigrationWithRetry(db, m));
  }
}

async function runMigrationWithRetry(
  db: SQLite.SQLiteDatabase,
  migration: Migration,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await db.withTransactionAsync(async () => {
        await migration.up(db);
        await db.runAsync(
          "INSERT INTO _migrations (version) VALUES (?)",
          migration.version,
        );
      });
      return;
    } catch (error) {
      const retryDelay = MIGRATION_LOCK_RETRY_DELAYS_MS[attempt];
      if (!isDatabaseLocked(error) || retryDelay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}

function isDatabaseLocked(error: unknown): boolean {
  return error instanceof Error && /database is locked/i.test(error.message);
}

export async function loadMigrations(): Promise<Migration[]> {
  const { default: m001 } = await import("./migrations/001_sync_tables");
  const { default: m002 } = await import("./migrations/002_taxonomy_tables");
  const { default: m003 } = await import("./migrations/003_privacy_settings");
  const { default: m004 } = await import("./migrations/004_sync_failure_message");
  const { default: m005 } = await import("./migrations/005_sync_discarded_at");
  const { default: m006 } = await import("./migrations/006_financial_foundations");
  const { default: m007 } = await import("./migrations/007_estimated_interval");
  const { default: m008 } = await import("./migrations/008_second_day_of_week");
  const { default: m009 } = await import("./migrations/009_obligation_due_fields");
  const { default: m010 } = await import("./migrations/010_obligation_due_month");
  const { default: m011 } = await import("./migrations/011_financial_accounts");
  const { default: m012 } = await import("./migrations/012_ledger_tables");
  const { default: m013 } = await import("./migrations/013_dashboard_snapshots");
  const { default: m014 } = await import("./migrations/014_income_source_recurring_links");
  const { default: m015 } = await import("./migrations/015_sync_pending");
  const { default: m016 } = await import("./migrations/016_budget_drafts");
  const { default: m017 } = await import("./migrations/017_single_budget");
  const { default: m018 } = await import("./migrations/018_budget_debt_envelope");
  const { default: m019 } = await import("./migrations/019_debt_management");
  const { default: m020 } = await import("./migrations/020_debt_payment_schedule");
  const { default: m021 } = await import("./migrations/021_financial_profile_cache");
  const { default: m022 } = await import("./migrations/022_debt_paid_off_at");
  const { default: m023 } = await import("./migrations/023_debt_archived_at");
  const { default: m024 } = await import("./migrations/024_credit_cards");
  const { default: m025 } = await import("./migrations/025_credit_card_atomic_purchase");
  const { default: m026 } = await import("./migrations/026_credit_card_pull_convergence");
  const { default: m027 } = await import("./migrations/027_credit_card_payment_recognition");
  const { default: m028 } = await import("./migrations/028_credit_card_mutation_ids");
  const { default: m029 } = await import("./migrations/029_credit_card_pull_columns");
  const { default: m030 } = await import("./migrations/030_sync_pull_failures");
  const { default: m031 } = await import("./migrations/031_credit_card_pull_cycle_guard");
  const { default: m032 } = await import("./migrations/032_drop_account_credit_limit");
  const { default: m033 } = await import("./migrations/033_credit_card_day_of_month_columns");
  const { default: m034 } = await import("./migrations/034_credit_card_cycle_snapshot_identity");
  const { default: m035 } = await import("./migrations/035_alert_cache");
  const { default: m036 } = await import("./migrations/036_optional_credit_card_statements");
  const { default: m037 } = await import("./migrations/037_repair_credit_card_cycle_trigger");
  const { default: m038 } = await import("./migrations/038_credit_card_statement_dates");
  const { default: m039 } = await import("./migrations/039_edit_credit_card_statements");
  const { default: m040 } = await import("./migrations/040_validate_credit_card_statement_selection");
  const { default: m041 } = await import("./migrations/041_harden_credit_card_statements");
  const { default: m042 } = await import("./migrations/042_credit_card_installment_purchases");
  const { default: m043 } = await import("./migrations/043_credit_card_statement_payments");
  const { default: m044 } = await import("./migrations/044_transaction_debt_payments");
  const { default: m045 } = await import("./migrations/045_allow_authoritative_payment_pull");
  const { default: m046 } = await import("./migrations/046_alert_feedback_sync");
  const { default: m047 } = await import("./migrations/047_restore_credit_for_card_payments");
  const { default: m048 } = await import("./migrations/048_credit_card_percentage_strategies");
  const { default: m049 } = await import("./migrations/049_credit_card_account_repayment_strategy");
  const { default: m050 } = await import("./migrations/050_credit_card_repayment_preferences");
  const { default: m051 } = await import("./migrations/051_savings_goals");
  const { default: m052 } = await import("./migrations/052_credit_card_reconciliation_anchor");
  const { default: m053 } = await import("./migrations/053_savings_goal_model");
  const { default: m054 } = await import("./migrations/054_savings_account_details");
  const { default: m055 } = await import("./migrations/055_add_hysa_eligibility");
  const { default: m056 } = await import("./migrations/056_savings_goal_contribution_schedule");
  const { default: m057 } = await import("./migrations/057_savings_account_contribution_schedule");
  const { default: m058 } = await import("./migrations/058_hysa_yield_inputs");
  const { default: m059 } = await import("./migrations/059_budget_savings_envelope");
  const { default: m060 } = await import("./migrations/060_savings_allocation_preferences");
  const { default: m061 } = await import("./migrations/061_remove_legacy_taxonomy");
  const { default: m062 } = await import("./migrations/062_subcategory_minimum_amount");
  const { default: m063 } = await import("./migrations/063_remove_retired_schema");
  const { default: m064 } = await import("./migrations/064_drop_transaction_drafts");
  const { default: m065 } = await import("./migrations/065_subcategory_budget_defaults");
  const { default: m066 } = await import("./migrations/066_financial_plans");
  const { default: m067 } = await import("./migrations/067_drop_legacy_budget_tables");
  const { default: m068 } = await import("./migrations/068_financial_plan_surplus");
  const { default: m069 } = await import("./migrations/069_category_budget_defaults");
  const { default: m070 } = await import("./migrations/070_hfce_category_descriptions");
  const { default: m071 } = await import("./migrations/071_remove_category_groups");
  const { default: m072 } = await import("./migrations/072_debt_extra_payments");
  const { default: m073 } = await import("./migrations/073_anomaly_evaluations");
  const { default: m074 } = await import("./migrations/074_remove_savings_goal_category");
  const { default: m075 } = await import("./migrations/075_category_classification");
  const { default: m076 } = await import("./migrations/076_anomaly_recurring_confirmation");
  const { default: m077 } = await import("./migrations/077_drop_obligations_and_recurring_expenses");
  const { default: m078 } = await import("./migrations/078_scheduled_payments");
  const { default: m079 } = await import("./migrations/079_simplify_income_sources");
  const { default: m080 } = await import("./migrations/080_taxonomy_visuals");
  const { default: m081 } = await import("./migrations/081_transaction_amount_index");
  const { default: m082 } = await import("./migrations/082_optional_scheduled_payment_category");
  const { default: m083 } = await import("./migrations/083_financial_plan_documents");
  const { default: m084 } = await import("./migrations/084_savings_goal_account_link");
  const { default: m085 } = await import("./migrations/085_savings_interest_reference");
  const { default: m086 } = await import("./migrations/086_expense_savings_funding");
  const { default: m087 } = await import("./migrations/087_savings_goal_emergency_flag");
  const { default: m088 } = await import("./migrations/088_settle_scheduled_payment_occurrence");
  const { default: m089 } = await import("./migrations/089_anomaly_spending_recurrence");
  const { default: m090 } = await import("./migrations/090_forecast_snapshots");
  const { default: m091 } = await import("./migrations/091_anomaly_recurrence_months");
  const { default: m092 } = await import("./migrations/092_credit_card_extra_payments");
  const { default: m093 } = await import("./migrations/093_remove_savings_goal_type");
  return [m001, m002, m003, m004, m005, m006, m007, m008, m009, m010, m011, m012, m013, m014, m015, m016, m017, m018, m019, m020, m021, m022, m023, m024, m025, m026, m027, m028, m029, m030, m031, m032, m033, m034, m035, m036, m037, m038, m039, m040, m041, m042, m043, m044, m045, m046, m047, m048, m049, m050, m051, m052, m053, m054, m055, m056, m057, m058, m059, m060, m061, m062, m063, m064, m065, m066, m067, m068, m069, m070, m071, m072, m073, m074, m075, m076, m077, m078, m079, m080, m081, m082, m083, m084, m085, m086, m087, m088, m089, m090, m091, m092, m093];
}

// Callers must not keep the result: lockVault closes it, and the next unlock opens a new handle.
export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  // An open handle needs no migrations; getDatabase still enforces the unlock check.
  if (db) return getDatabase([]);
  return getDatabase(await tracePinStep("database.load-migrations", loadMigrations));
}

export async function closeDatabase(): Promise<void> {
  if (dbPromise) await dbPromise.catch(() => {});
  if (!db) return;
  const d = db;
  db = null;
  dbPromise = null;
  return d.closeAsync();
}
