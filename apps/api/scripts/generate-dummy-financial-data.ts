import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { assertSeedConfirmation, parseUserSelector, resolveSeedUserId } from "./seed/resolve-seed-user.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
dotenv.config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), override: true });

type AccountKey = "bank" | "wallet" | "savings";

type Account = {
  id: string;
  key: AccountKey;
  openingBalanceCentavos: number;
};

type Transaction = {
  id: string;
  user_id: string;
  transaction_type: "income" | "expense" | "transfer";
  status: "posted";
  entry_source: "manual";
  transaction_date: string;
  amount_centavos: number;
  subcategory_id: string | null;
  source_account_id: string | null;
  destination_account_id: string | null;
  merchant_name: string | null;
  notes: string | null;
  client_mutation_id: string;
  metadata: Record<string, string | number | boolean>;
  deleted: false;
  version: 1;
};

type Category = {
  slug: string;
  id: string;
};

const seedMarker = "dummy-financial-data";
const legacySeedMarker = "dummy-financial-data-v1";
const requiredSubcategorySlugs = [
  "income_salary",
  "food_groceries",
  "transport_public",
  "housing_rent",
  "housing_electricity",
  "housing_water",
  "housing_internet",
  "restaurants_cafes",
  "clothing_accessories",
] as const;

function parseArgs() {
  const args = process.argv.slice(2);
  const valueFor = (flag: string) => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };

  const user = parseUserSelector(args, "Usage: pnpm dummy-data:financial -- (--email <email> | --user-id <uuid>) [--end-date YYYY-MM-DD] [--seed number] [--dry-run] [--confirm <email-or-uuid>]");

  const endDate = valueFor("--end-date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || Number.isNaN(Date.parse(`${endDate}T00:00:00Z`))) {
    throw new Error("--end-date must be a valid YYYY-MM-DD date");
  }

  const seed = Number(valueFor("--seed") ?? "42");
  if (!Number.isSafeInteger(seed)) throw new Error("--seed must be an integer");

  const dryRun = args.includes("--dry-run");
  const confirmation = valueFor("--confirm");
  return { user, endDate, seed, dryRun, confirmation };
}

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function addMonths(date: Date, months: number) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  return result;
}

function formatDate(date: Date, day: number) {
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function centavos(pesos: number) {
  return Math.round(pesos * 100);
}

function amountWithNoise(basePesos: number, random: () => number, spread = 0.12) {
  return centavos(basePesos * (1 - spread + random() * spread * 2));
}

function buildTransactions(userId: string, endDate: string, seed: number, accounts: Account[], categories: Category[]) {
  const random = createRandom(seed);
  const categoryIdBySlug = new Map(categories.map((category) => [category.slug, category.id]));
  const missingSlugs = requiredSubcategorySlugs.filter((slug) => !categoryIdBySlug.has(slug));
  if (missingSlugs.length > 0) throw new Error(`Missing seeded subcategories: ${missingSlugs.join(", ")}`);

  const accountIdByKey = new Map(accounts.map((account) => [account.key, account.id]));
  const transaction = (
    date: string,
    type: Transaction["transaction_type"],
    amount: number,
    slug: string | null,
    source: AccountKey | null,
    destination: AccountKey | null,
    merchant: string | null,
    notes: string | null,
  ): Transaction => ({
    user_id: userId,
    transaction_type: type,
    status: "posted",
    entry_source: "manual",
    transaction_date: date,
    amount_centavos: amount,
    subcategory_id: slug ? categoryIdBySlug.get(slug)! : null,
    source_account_id: source ? accountIdByKey.get(source)! : null,
    destination_account_id: destination ? accountIdByKey.get(destination)! : null,
    merchant_name: merchant,
    notes,
    id: randomUUID(),
    client_mutation_id: randomUUID(),
    metadata: { dummy_data_source: seedMarker, generated_seed: seed },
    deleted: false,
    version: 1,
  });

  const end = new Date(`${endDate}T00:00:00Z`);
  const firstMonth = addMonths(end, -23);
  const transactions: Transaction[] = [];

  for (let offset = 0; offset < 24; offset += 1) {
    const month = addMonths(firstMonth, offset);
    const monthlyIncome = amountWithNoise(52_000, random, 0.06);
    transactions.push(transaction(formatDate(month, 15), "income", monthlyIncome, "income_salary", null, "bank", "Northstar Services", "Monthly salary"));
    transactions.push(transaction(formatDate(month, 2), "expense", amountWithNoise(13_500, random, 0.03), "housing_rent", "bank", null, "Apartment rent", null));
    transactions.push(transaction(formatDate(month, 6), "expense", amountWithNoise(2_800, random), "housing_electricity", "bank", null, "Meralco", null));
    transactions.push(transaction(formatDate(month, 8), "expense", amountWithNoise(550, random), "housing_water", "bank", null, "Maynilad", null));
    transactions.push(transaction(formatDate(month, 10), "expense", amountWithNoise(1_699, random, 0.03), "housing_internet", "bank", null, "PLDT Home", null));
    transactions.push(transaction(formatDate(month, 16), "transfer", amountWithNoise(7_000, random, 0.1), null, "bank", "savings", null, "Monthly savings allocation"));
    transactions.push(transaction(formatDate(month, 17), "transfer", amountWithNoise(26_000, random, 0.08), null, "bank", "wallet", null, "Wallet top-up"));

    for (const day of [3, 7, 10, 14, 18, 21, 28]) {
      transactions.push(transaction(formatDate(month, day), "expense", amountWithNoise(2_100, random, 0.22), "food_groceries", "wallet", null, "SM Supermarket", null));
    }
    for (const day of [2, 5, 8, 11, 14, 17, 20, 23, 26, 28]) {
      transactions.push(transaction(formatDate(month, day), "expense", amountWithNoise(420, random, 0.25), "transport_public", "wallet", null, "MRT and jeepney fares", null));
    }
    for (const day of [7, 12, 16, 20, 22, 26]) {
      transactions.push(transaction(formatDate(month, day), "expense", amountWithNoise(650, random, 0.3), "restaurants_cafes", "wallet", null, "Local cafe", null));
    }
    transactions.push(transaction(formatDate(month, 14), "expense", amountWithNoise(700, random, 0.25), "clothing_accessories", "wallet", null, "Department store", null));
    if (random() > 0.35) {
      transactions.push(transaction(formatDate(month, 23), "expense", amountWithNoise(1_800, random, 0.35), "clothing_accessories", "wallet", null, "Online clothing shop", null));
    }
  }

  const filteredTransactions = transactions.filter((transactionRow) => transactionRow.transaction_date <= endDate);
  if (filteredTransactions.length < 700) throw new Error("Generator must produce at least 700 transactions across two years");
  return filteredTransactions;
}

function calculateBalances(accounts: Account[], transactions: Transaction[]) {
  const balances = new Map(accounts.map((account) => [account.id, account.openingBalanceCentavos]));
  for (const transaction of transactions) {
    if (transaction.source_account_id) balances.set(transaction.source_account_id, balances.get(transaction.source_account_id)! - transaction.amount_centavos);
    if (transaction.destination_account_id) balances.set(transaction.destination_account_id, balances.get(transaction.destination_account_id)! + transaction.amount_centavos);
  }
  return balances;
}

async function deleteRows(
  supabase: ReturnType<typeof createClient>,
  table: string,
  userId: string,
  ids: string[],
) {
  if (ids.length === 0) return;
  const { error } = await supabase.from(table).delete().eq("user_id", userId).in("id", ids);
  if (error) throw new Error(`Could not clear dummy ${table}: ${error.message}`);
}

async function clearDummyData(supabase: ReturnType<typeof createClient>, userId: string) {
  const [{ data: accounts, error: accountsError }, { data: goals, error: goalsError }, { data: debts, error: debtsError }] = await Promise.all([
    supabase.from("financial_accounts").select("id").eq("user_id", userId).or(`metadata->>dummy_data_source.eq.${seedMarker},metadata->>dummy_data_source.eq.${legacySeedMarker}`),
    supabase.from("savings_goals").select("id").eq("user_id", userId).contains("metadata", { dummy_data_source: seedMarker }),
    supabase.from("debt_accounts").select("id").eq("user_id", userId).contains("metadata", { dummy_data_source: seedMarker }),
  ]);
  if (accountsError) throw accountsError;
  if (goalsError) throw goalsError;
  if (debtsError) throw debtsError;

  const accountIds = (accounts ?? []).map((account) => account.id);
  if (accountIds.length > 0) {
    const { count, error } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .or(`source_account_id.in.(${accountIds.join(",")}),destination_account_id.in.(${accountIds.join(",")})`)
      .not("metadata->>dummy_data_source", "in", `(${seedMarker},${legacySeedMarker})`);
    if (error) throw error;
    if ((count ?? 0) > 0) {
      throw new Error("Refusing to remove dummy accounts referenced by non-dummy transactions. Move those transactions first.");
    }
  }

  await Promise.all([
    deleteRows(supabase, "savings_goals", userId, (goals ?? []).map((goal) => goal.id)),
    deleteRows(supabase, "debt_accounts", userId, (debts ?? []).map((debt) => debt.id)),
  ]);
  const { error: transactionsError } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", userId)
    .or(`metadata->>dummy_data_source.eq.${seedMarker},metadata->>dummy_data_source.eq.${legacySeedMarker}`);
  if (transactionsError) throw transactionsError;
  await deleteRows(supabase, "financial_accounts", userId, accountIds);
}

async function ensureIncomeSubcategory(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data: existing, error: existingError } = await supabase
    .from("subcategories")
    .select("id")
    .eq("user_id", userId)
    .eq("slug", "income_salary")
    .eq("deleted", false)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;
  const { error } = await supabase.from("subcategories").insert({
    user_id: userId,
    category_id: null,
    slug: "income_salary",
    kind: "income",
    label: "Salary",
    short_label: "Salary",
    description: "Regular employment income.",
    is_system: false,
    sort_order: 10,
  });
  if (error) throw new Error(`Could not create the salary subcategory: ${error.message}`);
}

function loadSeedSubcategories(supabase: ReturnType<typeof createClient>, userId: string, allowSystemDefaults: boolean) {
  const query = supabase
    .from("subcategories")
    .select("id, slug, category_id")
    .in("slug", requiredSubcategorySlugs)
    .eq("is_active", true)
    .eq("deleted", false);
  return allowSystemDefaults ? query.or(`user_id.eq.${userId},user_id.is.null`) : query.eq("user_id", userId);
}

async function main() {
  const { user, endDate, seed, dryRun, confirmation } = parseArgs();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  assertSeedConfirmation(user, confirmation, dryRun);
  const userId = await resolveSeedUserId(supabase, user);
  const { data: profile, error: profileError } = await supabase.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error(`No profile exists for user ${userId}`);
  if (!dryRun) {
    const { error: taxonomySeedError } = await supabase.rpc("seed_hfce_taxonomy_for_user", { p_user_id: userId });
    if (taxonomySeedError) throw new Error(`Could not provision the user's financial taxonomy: ${taxonomySeedError.message}`);
    await ensureIncomeSubcategory(supabase, userId);
  }
  const { data: categories, error: categoryError } = await loadSeedSubcategories(supabase, userId, dryRun);
  if (categoryError) throw categoryError;

  const start = formatDate(addMonths(new Date(`${endDate}T00:00:00Z`), -11), 1);
  const accounts: Account[] = [
    { id: randomUUID(), key: "bank", openingBalanceCentavos: centavos(100_000) },
    { id: randomUUID(), key: "wallet", openingBalanceCentavos: centavos(15_000) },
    { id: randomUUID(), key: "savings", openingBalanceCentavos: centavos(75_000) },
  ];
  const transactions = buildTransactions(userId, endDate, seed, accounts, categories ?? []);
  const balances = calculateBalances(accounts, transactions);

  if ([...balances.values()].some((balance) => balance < 0)) throw new Error("Generated data would overdraw an account; change the seed or generator.");
  console.log(`Prepared ${accounts.length} accounts and ${transactions.length} transactions from ${start} through ${endDate}.`);
  if (dryRun) return;

  await clearDummyData(supabase, userId);

  const accountRows = [
    { id: accounts[0].id, user_id: userId, name: "Demo Payroll Account", kind: "bank", opening_balance_centavos: accounts[0].openingBalanceCentavos, current_balance_centavos: balances.get(accounts[0].id), include_in_dashboard_balance: true, institution_name: "Demo Bank", opened_on: start, sort_order: 1, metadata: { dummy_data_source: seedMarker }, deleted: false, version: 1 },
    { id: accounts[1].id, user_id: userId, name: "Demo Daily Wallet", kind: "e_wallet", opening_balance_centavos: accounts[1].openingBalanceCentavos, current_balance_centavos: balances.get(accounts[1].id), include_in_dashboard_balance: true, institution_name: "Demo Wallet", opened_on: start, sort_order: 2, metadata: { dummy_data_source: seedMarker }, deleted: false, version: 1 },
    { id: accounts[2].id, user_id: userId, name: "Demo Emergency Savings", kind: "savings", opening_balance_centavos: accounts[2].openingBalanceCentavos, current_balance_centavos: balances.get(accounts[2].id), include_in_dashboard_balance: true, institution_name: "Demo Bank", opened_on: start, sort_order: 3, metadata: { dummy_data_source: seedMarker }, deleted: false, version: 1 },
  ];
  const { error: accountsError } = await supabase.from("financial_accounts").insert(accountRows);
  if (accountsError) throw accountsError;

  const { error: transactionsError } = await supabase.from("transactions").insert(transactions);
  if (transactionsError) {
    const { error: cleanupError } = await supabase
      .from("financial_accounts")
      .delete()
      .eq("user_id", userId)
      .in("id", accounts.map((account) => account.id));
    if (cleanupError) {
      throw new Error(`Transaction insert failed: ${transactionsError.message}. Account cleanup also failed: ${cleanupError.message}`);
    }
    throw transactionsError;
  }
  const referenceDate = new Date(`${endDate}T00:00:00Z`);
  const nextMonth = addMonths(referenceDate, 1);
  const nextContributionDate = formatDate(nextMonth, 16);
  const goalIds = { emergency: randomUUID(), laptop: randomUUID() };
  const debtIds = { personal: randomUUID(), auto: randomUUID() };
  const marker = { dummy_data_source: seedMarker, generated_seed: seed };
  const { error: goalsInsertError } = await supabase.from("savings_goals").insert([
    { id: goalIds.emergency, user_id: userId, linked_account_id: accounts[2].id, name: "Emergency Fund", goal_type: "emergency_fund", target_amount_centavos: centavos(180_000), starting_amount_centavos: centavos(45_000), target_date: formatDate(addMonths(referenceDate, 9), 30), priority: "high", emergency_fund_baseline_centavos: centavos(30_000), auto_save_amount_centavos: centavos(5_000), planned_contribution_amount_centavos: centavos(5_000), contribution_frequency: "monthly", contribution_interval_count: 1, contribution_day_of_month: 16, next_contribution_date: nextContributionDate, emergency_fund_target_method: "essential_expense_coverage", essential_expense_coverage_months: 6, status: "active", version: 1, deleted: false, metadata: marker },
    { id: goalIds.laptop, user_id: userId, linked_account_id: accounts[2].id, name: "New Laptop", goal_type: "custom", target_amount_centavos: centavos(85_000), starting_amount_centavos: centavos(12_000), target_date: formatDate(addMonths(referenceDate, 6), 31), priority: "medium", auto_save_amount_centavos: centavos(3_000), planned_contribution_amount_centavos: centavos(3_000), contribution_frequency: "monthly", contribution_interval_count: 1, contribution_day_of_month: 16, next_contribution_date: nextContributionDate, emergency_fund_target_method: "fixed_amount", status: "active", version: 1, deleted: false, metadata: marker },
  ]);
  if (goalsInsertError) throw goalsInsertError;
  const savingsTransfers = transactions.filter((transaction) => transaction.transaction_type === "transfer" && transaction.destination_account_id === accounts[2].id).slice(-4);
  const { error: activitiesError } = await supabase.from("savings_goal_activities").insert(savingsTransfers.map((transaction, index) => ({
    id: randomUUID(), user_id: userId, savings_goal_id: index % 2 === 0 ? goalIds.emergency : goalIds.laptop,
    transaction_id: transaction.id, activity_kind: "contribution", amount_centavos: index % 2 === 0 ? centavos(4_000) : centavos(2_500),
    activity_date: transaction.transaction_date, notes: "Demo savings contribution", version: 1, deleted: false,
  })));
  if (activitiesError) throw activitiesError;

  const { error: debtsInsertError } = await supabase.from("debt_accounts").insert([
    { id: debtIds.personal, user_id: userId, linked_account_id: accounts[0].id, name: "Personal Loan", lender_name: "Demo Bank", preset_key: "personal_loan", status: "active", original_balance_centavos: centavos(120_000), current_balance_centavos: centavos(78_500), annual_interest_rate_bps: 1_250, minimum_payment_centavos: centavos(4_500), payment_frequency: "monthly", payment_schedule: {}, next_due_date: formatDate(nextMonth, 5), target_payoff_date: formatDate(addMonths(referenceDate, 15), 5), interest_period: "annual", interest_method: "diminishing_balance", preset_data: { startDate: formatDate(addMonths(referenceDate, -20), 5), feesCentavos: 0, penaltyInfo: null, termMonths: 36, personalLoan: { purpose: "Home improvements" } }, notes: "Demo debt with a consistent payment history", version: 1, deleted: false, metadata: marker },
    { id: debtIds.auto, user_id: userId, linked_account_id: accounts[0].id, name: "Motorcycle Loan", lender_name: "Demo Finance", preset_key: "auto_loan", status: "active", original_balance_centavos: centavos(190_000), current_balance_centavos: centavos(142_000), annual_interest_rate_bps: 890, minimum_payment_centavos: centavos(6_800), payment_frequency: "monthly", payment_schedule: {}, next_due_date: formatDate(nextMonth, 20), target_payoff_date: formatDate(addMonths(referenceDate, 24), 20), interest_period: "annual", interest_method: "diminishing_balance", preset_data: { startDate: formatDate(addMonths(referenceDate, -13), 20), feesCentavos: 0, penaltyInfo: null, termMonths: 36, autoLoan: { vehicleDescription: "Demo commuter motorcycle", vehiclePurchasePriceCentavos: centavos(240_000), downpaymentCentavos: centavos(50_000), financedPrincipalCentavos: centavos(190_000) } }, notes: "Demo auto loan", version: 1, deleted: false, metadata: marker },
  ]);
  if (debtsInsertError) throw debtsInsertError;
  const { error: paymentsError } = await supabase.from("debt_payments").insert([
    { id: randomUUID(), debt_account_id: debtIds.personal, user_id: userId, source: "manual", payment_date: formatDate(addMonths(referenceDate, -2), 5), amount_centavos: centavos(4_500), principal_centavos: centavos(3_680), interest_centavos: centavos(820), notes: "Demo payment", version: 1, deleted: false, metadata: marker },
    { id: randomUUID(), debt_account_id: debtIds.personal, user_id: userId, source: "manual", payment_date: formatDate(addMonths(referenceDate, -1), 5), amount_centavos: centavos(4_500), principal_centavos: centavos(3_720), interest_centavos: centavos(780), notes: "Demo payment", version: 1, deleted: false, metadata: marker },
    { id: randomUUID(), debt_account_id: debtIds.auto, user_id: userId, source: "manual", payment_date: formatDate(addMonths(referenceDate, -1), 20), amount_centavos: centavos(6_800), principal_centavos: centavos(5_450), interest_centavos: centavos(1_350), notes: "Demo payment", version: 1, deleted: false, metadata: marker },
  ]);
  if (paymentsError) throw paymentsError;
  console.log(`Created dummy financial data for ${userId}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
