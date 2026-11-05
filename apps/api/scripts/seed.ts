import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { provisionPersonaProfile } from "./seed/persona-profile.js";
import { buildPersonaSeedData, demoPersonas, parseDemoPersona, type DemoPersona } from "./seed/personas.js";
import { assertSeedConfirmation } from "./seed/resolve-seed-user.js";
import { summarizePersonaSpending } from "./seed/persona-spending.js";
import { buildSeedHolidayPurchases, buildSeedRecurringSpending, buildSeedTuitionMonths } from "./seed/recurring-spending.js";
import {
  buildSeedData,
  legacySeedMarker,
  manilaToday,
  requiredSubcategorySlugs,
  seedForecastModelVersion,
  seedMarker,
  type SeedData,
} from "./seed/history.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
dotenv.config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), override: true });

const CHUNK_SIZE = 200;
const markerFilter = `metadata->>dummy_data_source.eq.${seedMarker},metadata->>dummy_data_source.eq.${legacySeedMarker}`;

function parseArgs() {
  const args = process.argv.slice(2);
  const valueFor = (flag: string) => {
    const index = args.indexOf(flag);
    if (index === -1) return undefined;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    return value;
  };
  const persona = parseDemoPersona(valueFor("--persona"));
  if (persona && (args.includes("--email") || args.includes("--password"))) throw new Error("--persona always uses its fixed demo email and password; omit --email and --password.");
  const email = persona ? demoPersonas[persona].email : valueFor("--email")?.trim().toLowerCase();
  const password = persona ? demoPersonas[persona].password : valueFor("--password") ?? process.env.SEED_PASSWORD;
  if (!email) throw new Error("Usage: pnpm seed -- (--persona seasonal-mom|debt-burdened|healthy-worker|family-breadwinner | --email <email> [--password <password>]) [--seed number] [--dry-run] [--confirm <email>]. Seeding replaces existing seeded history; deleted history cannot be restored. Personas use fixed demo credentials; otherwise a new account without a password gets a generated one.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("--email must be a valid email address");
  const seed = Number(valueFor("--seed") ?? "42");
  if (!Number.isSafeInteger(seed)) throw new Error("--seed must be an integer");
  return { email, password, seed, persona, dryRun: args.includes("--dry-run"), confirmation: valueFor("--confirm") };
}

// A random password with every character class, for new accounts created without one.
function generatePassword() {
  const required = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%*-_"].map((set) => set[randomInt(set.length)]);
  return `${randomBytes(12).toString("base64url")}${required.join("")}`;
}

function chunks<T>(rows: T[]) {
  return Array.from({ length: Math.ceil(rows.length / CHUNK_SIZE) }, (_, index) => rows.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
}

async function insertRows(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  for (const batch of chunks(rows)) {
    // Columns a row leaves out fall back to their database defaults instead of NULL.
    const { error } = await supabase.from(table).insert(batch, { defaultToNull: false });
    if (error) throw new Error(`Could not insert ${table}: ${error.message}`);
  }
}

async function deleteByIds(supabase: SupabaseClient, table: string, userId: string, column: string, ids: string[]) {
  for (const batch of chunks(ids)) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId).in(column, batch);
    if (error) throw new Error(`Could not clear seeded ${table}: ${error.message}`);
  }
}

async function selectIds(query: PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>, column = "id") {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row[column] as string).filter(Boolean);
}

// Returns the user and whether this run created it. An existing user keeps their password, except a persona
// account, which is reset to its fixed demo password.
async function ensureUser(supabase: SupabaseClient, email: string, password: string, dryRun: boolean, persona?: DemoPersona) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1_000 });
    if (error) throw error;
    const existing = data.users.find((user) => user.email?.toLowerCase() === email);
    if (existing) {
      console.log(`Using existing user ${existing.id}.`);
      if (persona && !dryRun) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
        if (updateError) throw new Error(`Could not reset the demo password: ${updateError.message}`);
      }
      return { id: existing.id, created: false, password };
    }
    if (data.users.length < 1_000) break;
  }
  if (dryRun) {
    console.log(`Would create a verified user for ${email}.`);
    return { id: null, created: false, password };
  }
  const { data: created, error: createError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, ...(persona ? { user_metadata: { display_name: demoPersonas[persona].name, demo_persona: persona } } : {}) });
  if (createError || !created.user) throw createError ?? new Error("User creation returned no user");
  console.log(`Created verified user ${created.user.id}.`);
  return { id: created.user.id, created: true, password };
}

async function provisionTaxonomy(supabase: SupabaseClient, userId: string) {
  const { error: taxonomyError } = await supabase.rpc("seed_hfce_taxonomy_for_user", { p_user_id: userId });
  if (taxonomyError) throw new Error(`Could not provision the user's financial taxonomy: ${taxonomyError.message}`);
}

async function loadSubcategoryIds(supabase: SupabaseClient, userId: string, dryRun: boolean) {
  const { data, error } = await supabase.from("subcategories").select("id, slug").eq("user_id", userId).eq("is_active", true).eq("deleted", false).in("slug", requiredSubcategorySlugs);
  if (error) throw error;
  const ids = new Map((data ?? []).map((row) => [row.slug as string, row.id as string]));
  const missing = requiredSubcategorySlugs.filter((slug) => !ids.has(slug));
  if (missing.length === 0) return ids;
  // A dry run never provisions the taxonomy, so stand-in ids let it validate the rest of the history.
  if (dryRun) return new Map(requiredSubcategorySlugs.map((slug) => [slug, ids.get(slug) ?? randomUUID()]));
  throw new Error(`Missing seeded subcategories: ${missing.join(", ")}`);
}

// Removes rows from earlier seed runs, including biller payments the auto-post job added since. Every delete is scoped to the user.
async function clearSeededData(supabase: SupabaseClient, userId: string) {
  const [accountIds, goalIds, debtIds, incomeSourceIds, planIds] = await Promise.all([
    selectIds(supabase.from("financial_accounts").select("id").eq("user_id", userId).or(markerFilter)),
    selectIds(supabase.from("savings_goals").select("id").eq("user_id", userId).or(markerFilter)),
    selectIds(supabase.from("debt_accounts").select("id").eq("user_id", userId).or(markerFilter)),
    selectIds(supabase.from("income_sources").select("id").eq("user_id", userId).or(markerFilter)),
    selectIds(supabase.from("financial_plans").select("id").eq("user_id", userId).in("forecast_model_version", [seedForecastModelVersion, "demo-seed-v1"])),
  ]);
  const scheduleIds = accountIds.length ? await selectIds(supabase.from("scheduled_payments").select("id").eq("user_id", userId).in("source_account_id", accountIds)) : [];
  const { data: records, error: recordsError } = scheduleIds.length
    ? await supabase.from("scheduled_payment_records").select("id, transaction_id").eq("user_id", userId).in("scheduled_payment_id", scheduleIds)
    : { data: [], error: null };
  if (recordsError) throw recordsError;
  const recordTransactionIds = new Set((records ?? []).map((record) => record.transaction_id as string).filter(Boolean));

  if (accountIds.length > 0) {
    const unseeded = `metadata->>dummy_data_source.is.null,metadata->>dummy_data_source.not.in.(${seedMarker},${legacySeedMarker})`;
    const referencing = (await Promise.all(["source_account_id", "destination_account_id"].map((column) =>
      selectIds(supabase.from("transactions").select("id").eq("user_id", userId).in(column, accountIds).or(unseeded)),
    ))).flat().filter((id) => !recordTransactionIds.has(id));
    if (referencing.length > 0) throw new Error("Refusing to remove seeded accounts referenced by non-seeded transactions. Move those transactions first.");
    // Checked before anything is deleted: a user's own goal linked to a seeded account blocks removing that account.
    const unseededGoals = `metadata->>dummy_data_source.is.null,metadata->>dummy_data_source.not.in.(${seedMarker},${legacySeedMarker})`;
    const linkedGoals = await selectIds(supabase.from("savings_goals").select("id").eq("user_id", userId).in("linked_account_id", accountIds).or(unseededGoals));
    if (linkedGoals.length > 0) throw new Error("Refusing to remove seeded accounts linked to non-seeded savings goals. Link those goals to another account or delete them first.");
  }

  await deleteByIds(supabase, "scheduled_payment_records", userId, "id", (records ?? []).map((record) => record.id as string));
  await deleteByIds(supabase, "scheduled_payments", userId, "id", scheduleIds);
  for (const table of ["financial_plan_forecast_points", "financial_plan_allocations", "financial_plan_savings_reservations", "financial_plan_debt_reservations"]) {
    for (const batch of chunks(planIds)) {
      const { error } = await supabase.from(table).delete().in("plan_id", batch);
      if (error) throw new Error(`Could not clear seeded ${table}: ${error.message}`);
    }
  }
  await deleteByIds(supabase, "financial_plans", userId, "id", planIds);
  await deleteByIds(supabase, "savings_goal_activities", userId, "savings_goal_id", goalIds);
  // Debt payments must go before their transactions: the transaction foreign key nulls user_id along with transaction_id.
  await deleteByIds(supabase, "debt_accounts", userId, "id", debtIds);
  await deleteByIds(supabase, "transactions", userId, "id", [...recordTransactionIds]);
  const { error: transactionsError } = await supabase.from("transactions").delete().eq("user_id", userId).or(markerFilter);
  if (transactionsError) throw new Error(`Could not clear seeded transactions: ${transactionsError.message}`);
  await deleteByIds(supabase, "savings_goals", userId, "id", goalIds);
  await deleteByIds(supabase, "income_sources", userId, "id", incomeSourceIds);
  // Payments and statements go first: cascading them from a deleted cycle nulls payment.statement_id, which the payment guard rejects.
  const cycleIds = accountIds.length ? await selectIds(supabase.from("credit_card_cycles").select("id").eq("user_id", userId).in("account_id", accountIds)) : [];
  await deleteByIds(supabase, "credit_card_payments", userId, "cycle_id", cycleIds);
  await deleteByIds(supabase, "credit_card_statements", userId, "cycle_id", cycleIds);
  // Card details and cycles cascade from their accounts.
  await deleteByIds(supabase, "financial_accounts", userId, "id", accountIds);
}

async function writeSeedData(supabase: SupabaseClient, userId: string, data: SeedData, recurringSpending: Record<string, unknown>[]) {
  // Parents before children; transactions before the card, debt, and biller rows that link to them.
  await insertRows(supabase, "financial_accounts", data.accounts);
  await insertRows(supabase, "income_sources", data.incomeSources);
  await insertRows(supabase, "savings_goals", data.savingsGoals);
  await insertRows(supabase, "debt_accounts", data.debtAccounts);
  await insertRows(supabase, "credit_card_details", data.creditCardDetails);
  await insertRows(supabase, "credit_card_cycles", data.creditCardCycles);
  const insertAmounts = new Map(data.availableCreditAdjustments.map((adjustment) => [adjustment.transactionId, adjustment.insertAmountCentavos]));
  await insertRows(supabase, "transactions", data.transactions.map((transaction) => ({ ...transaction, amount_centavos: insertAmounts.get(transaction.id) ?? transaction.amount_centavos })));
  await insertRows(supabase, "credit_card_transactions", data.creditCardTransactions);
  await applyAvailableCreditAdjustments(supabase, userId, data.availableCreditAdjustments);
  await insertRows(supabase, "anomaly_evaluations", recurringSpending);
  await insertRows(supabase, "credit_card_statements", data.creditCardStatements);
  await insertRows(supabase, "credit_card_payments", data.creditCardPayments);
  await insertRows(supabase, "debt_payments", data.debtPayments);
  await insertRows(supabase, "savings_goal_activities", data.savingsGoalActivities);
  await insertRows(supabase, "scheduled_payments", data.scheduledPayments);
  await insertRows(supabase, "scheduled_payment_records", data.scheduledPaymentRecords);
  await insertRows(supabase, "financial_plans", data.financialPlans);
  await insertRows(supabase, "financial_plan_forecast_points", data.planForecastPoints);
  await insertRows(supabase, "financial_plan_allocations", data.planAllocations);
  await insertRows(supabase, "financial_plan_debt_reservations", data.planDebtReservations);
  await insertRows(supabase, "financial_plan_savings_reservations", data.planSavingsReservations);
}

// Available credit can only change through a credit-card invariant operation. Correcting a linked purchase's amount
// is one: the server's purchase-amount trigger lowers available credit by the difference.
async function applyAvailableCreditAdjustments(supabase: SupabaseClient, userId: string, adjustments: SeedData["availableCreditAdjustments"]) {
  for (const adjustment of adjustments) {
    const { error } = await supabase.from("transactions").update({ amount_centavos: adjustment.amountCentavos }).eq("user_id", userId).eq("id", adjustment.transactionId);
    if (error) throw new Error(`Could not set card available credit: ${error.message}`);
  }
}

async function main() {
  const { email, password, seed, persona, dryRun, confirmation } = parseArgs();
  assertSeedConfirmation({ type: "email", value: email }, confirmation, dryRun);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) }) },
  });
  const user = await ensureUser(supabase, email, password ?? generatePassword(), dryRun, persona);
  const userId = user.id ?? randomUUID();
  if (user.id) {
    const { data: profile, error: profileError } = await supabase.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error(`No profile exists for user ${userId}`);
  }

  if (!dryRun) await provisionTaxonomy(supabase, userId);
  const subcategoryIds = await loadSubcategoryIds(supabase, userId, dryRun);
  const options = { userId, today: manilaToday(), seed, subcategoryIds };
  const data = persona ? buildPersonaSeedData({ ...options, persona }) : buildSeedData(options);
  const medicines = buildSeedRecurringSpending(userId, data.transactions, subcategoryIds, options.today);
  const tuition = persona === "seasonal-mom" ? buildSeedTuitionMonths(userId, data.transactions, subcategoryIds, options.today) : [];
  const holiday = persona ? [] : buildSeedHolidayPurchases(userId, data.transactions, subcategoryIds, options.today);
  const recurringSpending = [...medicines, ...tuition, ...holiday];
  const peso = (amountCentavos: number) => `PHP ${(amountCentavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  console.log(`Prepared ${data.transactions.length} transactions from ${data.summary.start} through ${data.summary.end}:`);
  console.log(`  ${data.accounts.length} accounts, ${data.incomeSources.length} income sources, ${data.scheduledPayments.length} billers and remittances (${data.scheduledPaymentRecords.length} payments)`);
  console.log(`  ${data.savingsGoals.length} savings goals (${data.savingsGoalActivities.length} contributions)`);
  console.log(`  ${data.debtAccounts.length} debts (${data.debtPayments.length} payments)`);
  console.log(`  ${data.creditCardCycles.length} card cycles, ${data.creditCardStatements.length} statements, ${data.creditCardPayments.length} card payments, ${data.financialPlans.length} financial plans`);
  const currentPlan = data.financialPlans.find((plan) => plan.period_start === `${options.today.slice(0, 7)}-01`);
  if (currentPlan) console.log(`  This month's plan: ${peso(currentPlan.savings_surplus_centavos as number)} savings surplus and ${peso(currentPlan.debt_surplus_centavos as number)} debt surplus to allocate`);
  console.log(`  ${medicines.length} unusual medicine purchases confirmed as frequent spending`);
  if (tuition.length) console.log(`  ${tuition.length} tuition payments expected again January through June`);
  if (holiday.length) console.log(`  ${holiday.length} holiday clothes purchases expected again in the month they were bought`);
  for (const [name, balance] of Object.entries(data.summary.endingBalances)) console.log(`  ${name}: ${peso(balance)}`);
  if (persona) {
    console.log("2025 NCR FIES annual category anchors, disaggregated with within-year current-price HFCE weights.");
    console.log("Targets below are unconstrained household benchmarks. Flexible category mixes use these weights within the persona's cash budget; fixed bills, story events, repayments and transfers retain their constraints.");
    console.log("Partial quarters show actual spending to date against a full-quarter target. Missing/partial HFCE years reuse the complete 2025 seasonal template; no observed quarters or inflation are invented. Unmapped FIES expenditure is excluded.");
    console.table(summarizePersonaSpending(persona, data.transactions, subcategoryIds).map((row) => ({
      quarter: row.period, category: row.category, hfce: `${row.hfceYear}${row.usesSeasonalTemplate ? " template" : ""}`,
      target_php: row.targetCentavos / 100, generated_php: row.actualCentavos / 100,
      difference_php: (row.actualCentavos - row.targetCentavos) / 100,
    })));
  }
  if (dryRun) return;

  await clearSeededData(supabase, userId);
  await writeSeedData(supabase, userId, data, recurringSpending);
  if (persona) await provisionPersonaProfile(supabase, userId, persona);
  console.log(`Seeded financial history for ${userId}.`);
  printCredentials(email, user.created || persona ? user.password : undefined, persona);
}

function printCredentials(email: string, password: string | undefined, persona?: DemoPersona) {
  console.log("\nLogin credentials:");
  if (persona) console.log(`  Persona:  ${demoPersonas[persona].name} (${persona})`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password ?? "unchanged (existing account keeps its password)"}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
