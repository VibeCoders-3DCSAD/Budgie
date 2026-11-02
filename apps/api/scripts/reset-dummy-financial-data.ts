import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { assertSeedConfirmation, parseUserSelector, resolveSeedUserId } from "./seed/resolve-seed-user.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
dotenv.config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), override: true });

const seedMarker = "dummy-financial-data";
const legacySeedMarker = "dummy-financial-data-v1";

function parseArgs() {
  const args = process.argv.slice(2);
  const valueFor = (flag: string) => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  const user = parseUserSelector(args, "Usage: pnpm dummy-data:reset -- (--email <email> | --user-id <uuid>) [--dry-run] [--confirm <email-or-uuid>]");
  const confirmation = valueFor("--confirm");
  return { user, confirmation, dryRun: args.includes("--dry-run") };
}

async function main() {
  const { user, confirmation, dryRun } = parseArgs();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  assertSeedConfirmation(user, confirmation, dryRun);
  const userId = await resolveSeedUserId(supabase, user);
  const [{ data: transactions, error: transactionsError }, { data: accounts, error: accountsError }, { data: goals, error: goalsError }, { data: debts, error: debtsError }] = await Promise.all([
    supabase.from("transactions").select("id", { count: "exact" }).eq("user_id", userId).or(`metadata->>dummy_data_source.eq.${seedMarker},metadata->>dummy_data_source.eq.${legacySeedMarker}`),
    supabase.from("financial_accounts").select("id", { count: "exact" }).eq("user_id", userId).or(`metadata->>dummy_data_source.eq.${seedMarker},metadata->>dummy_data_source.eq.${legacySeedMarker}`),
    supabase.from("savings_goals").select("id", { count: "exact" }).eq("user_id", userId).contains("metadata", { dummy_data_source: seedMarker }),
    supabase.from("debt_accounts").select("id", { count: "exact" }).eq("user_id", userId).contains("metadata", { dummy_data_source: seedMarker }),
  ]);
  if (transactionsError) throw transactionsError;
  if (accountsError) throw accountsError;
  if (goalsError) throw goalsError;
  if (debtsError) throw debtsError;

  const transactionCount = transactions.length;
  const accountCount = accounts.length;
  const goalIds = (goals ?? []).map((goal) => goal.id);
  const debtIds = (debts ?? []).map((debt) => debt.id);
  console.log(`Found ${accountCount} dummy accounts, ${transactionCount} dummy transactions, ${goalIds.length} savings goals, and ${debtIds.length} debts for ${userId}.`);
  if (dryRun || (accountCount === 0 && transactionCount === 0 && goalIds.length === 0 && debtIds.length === 0)) return;

  if (goalIds.length > 0) {
    const { error } = await supabase
      .from("savings_goal_activities")
      .delete()
      .eq("user_id", userId)
      .in("savings_goal_id", goalIds);
    if (error) throw error;
  }

  for (const [table, ids] of [["savings_goals", goalIds], ["debt_accounts", debtIds]] as const) {
    if (ids.length === 0) continue;
    const { error } = await supabase.from(table).delete().eq("user_id", userId).in("id", ids);
    if (error) throw error;
  }

  const { error: deleteTransactionsError } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", userId)
    .or(`metadata->>dummy_data_source.eq.${seedMarker},metadata->>dummy_data_source.eq.${legacySeedMarker}`);
  if (deleteTransactionsError) throw deleteTransactionsError;

  const { error: deleteAccountsError } = await supabase
    .from("financial_accounts")
    .delete()
    .eq("user_id", userId)
    .or(`metadata->>dummy_data_source.eq.${seedMarker},metadata->>dummy_data_source.eq.${legacySeedMarker}`);
  if (deleteAccountsError) throw deleteAccountsError;
  console.log(`Removed dummy financial data for ${userId}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
