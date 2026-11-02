import type { SavingsExpenseWithdrawal } from "../savings/savingsExpenseFunding";
import * as SQLite from "expo-sqlite";
import { enqueueOperation, LocalDbError } from "../../helpers";
import { randomUUID, uuidV5 } from "../../uuid";
import { currentOccurrence, dueDatesBetween, localToday, type Occurrence, type PaymentSchedule, type ScheduledPaymentFrequency } from "../../../features/billers/schedule";
import { ensureCurrentCreditCardCycles } from "../credit-cards/creditCardCycles";
import { BILLER_PAYMENT_MUTATION_PREFIX, createExpenseInTransaction, deleteTransaction } from "../ledger/ledger";
import { insertScheduledPaymentRecordInTransaction, listPaidByOccurrence } from "./scheduledPaymentRecords";
import { getDb } from "../helpers/db";

export type ScheduledPaymentStatus = "active" | "archived";

export type ScheduledPaymentInput = PaymentSchedule & {
  name: string;
  // Optional: an uncategorized payment posts an uncategorized expense.
  subcategoryId: string | null;
  sourceAccountId: string;
  amountCentavos: number;
  autoPost: boolean;
  isFamilySupport: boolean;
  isDependentSupport: boolean;
  protectedByDefault: boolean;
  notes: string | null;
};

export type ScheduledPayment = ScheduledPaymentInput & {
  id: string;
  autoPostFrom: string | null;
  status: ScheduledPaymentStatus;
  version: number;
};

type Row = {
  id: string; name: string; subcategory_id: string | null; source_account_id: string; amount_centavos: number; frequency: ScheduledPaymentFrequency;
  due_day_of_month: number | null; due_second_day_of_month: number | null; due_day_of_week: number | null; due_month: number | null;
  starts_on: string; ends_on: string | null; auto_post: number; auto_post_from: string | null; is_family_support: number;
  is_dependent_support: number; protected_by_default: number; notes: string | null; status: ScheduledPaymentStatus; version: number;
};

// Local column -> input field, in sync payload order.
const COLUMNS = {
  name: "name", subcategory_id: "subcategoryId", source_account_id: "sourceAccountId", amount_centavos: "amountCentavos",
  frequency: "frequency", due_day_of_month: "dueDayOfMonth", due_second_day_of_month: "dueSecondDayOfMonth",
  due_day_of_week: "dueDayOfWeek", due_month: "dueMonth", starts_on: "startsOn", ends_on: "endsOn", auto_post: "autoPost",
  is_family_support: "isFamilySupport", is_dependent_support: "isDependentSupport", protected_by_default: "protectedByDefault", notes: "notes",
} as const satisfies Record<string, keyof ScheduledPaymentInput>;
type Column = keyof typeof COLUMNS;
const BOOLEAN_COLUMNS = new Set<Column>(["auto_post", "is_family_support", "is_dependent_support", "protected_by_default"]);
const FREQUENCIES: ScheduledPaymentFrequency[] = ["daily", "weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "yearly", "once"];

function map(row: Row): ScheduledPayment {
  return {
    id: row.id, name: row.name, subcategoryId: row.subcategory_id, sourceAccountId: row.source_account_id, amountCentavos: row.amount_centavos,
    frequency: row.frequency, dueDayOfMonth: row.due_day_of_month, dueSecondDayOfMonth: row.due_second_day_of_month, dueDayOfWeek: row.due_day_of_week,
    dueMonth: row.due_month, startsOn: row.starts_on, endsOn: row.ends_on, autoPost: row.auto_post === 1, autoPostFrom: row.auto_post_from,
    isFamilySupport: row.is_family_support === 1, isDependentSupport: row.is_dependent_support === 1, protectedByDefault: row.protected_by_default === 1,
    notes: row.notes, status: row.status, version: row.version,
  };
}

// Keeps only the due fields the frequency uses, so a frequency change never leaves stale days behind.
function normalize(input: ScheduledPaymentInput): ScheduledPaymentInput {
  const { frequency } = input;
  const usesDayOfMonth = frequency === "semi_monthly" || frequency === "monthly" || frequency === "quarterly" || frequency === "yearly";
  return {
    ...input,
    name: input.name.trim(),
    subcategoryId: input.subcategoryId || null,
    notes: input.notes?.trim() || null,
    dueDayOfMonth: usesDayOfMonth ? input.dueDayOfMonth : null,
    dueSecondDayOfMonth: frequency === "semi_monthly" ? input.dueSecondDayOfMonth : null,
    dueDayOfWeek: frequency === "weekly" || frequency === "biweekly" ? input.dueDayOfWeek : null,
    dueMonth: frequency === "yearly" ? input.dueMonth : null,
    autoPost: frequency === "once" ? false : input.autoPost,
  };
}

function validate(input: ScheduledPaymentInput): void {
  const fail = (message: string) => { throw new LocalDbError("VALIDATION_ERROR", message); };
  const inRange = (value: number | null, lo: number, hi: number) => value != null && Number.isInteger(value) && value >= lo && value <= hi;
  if (!input.name || input.name.length > 120) fail("Enter a name of up to 120 characters.");
  if (!input.sourceAccountId) fail("Select the account this is paid from.");
  if (!Number.isSafeInteger(input.amountCentavos) || input.amountCentavos <= 0) fail("Enter a positive amount.");
  if (!FREQUENCIES.includes(input.frequency)) fail("Select how often this repeats.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn)) fail("Select a valid start date.");
  if (input.endsOn && input.endsOn < input.startsOn) fail("The end date must be on or after the start date.");
  const { frequency } = input;
  if ((frequency === "weekly" || frequency === "biweekly") && !inRange(input.dueDayOfWeek, 0, 6)) fail("Select the day of the week.");
  if ((frequency === "semi_monthly" || frequency === "monthly" || frequency === "quarterly" || frequency === "yearly") && !inRange(input.dueDayOfMonth, 1, 31)) fail("Due day must be 1-31.");
  if (frequency === "semi_monthly" && (!inRange(input.dueSecondDayOfMonth, 1, 31) || input.dueSecondDayOfMonth === input.dueDayOfMonth)) fail("The second due day must be 1-31 and differ from the first.");
  if (frequency === "yearly" && !inRange(input.dueMonth, 1, 12)) fail("Select the month.");
  if (input.notes && input.notes.length > 1000) fail("Notes can be up to 1000 characters.");
}

async function assertReferences(db: SQLite.SQLiteDatabase, userId: string, input: ScheduledPaymentInput): Promise<void> {
  const subcategory = input.subcategoryId ? await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM subcategories WHERE id = ? AND user_id = ? AND kind = 'expense' AND is_active = 1 AND deleted = 0", input.subcategoryId, userId,
  ) : { id: null };
  if (!subcategory) throw new LocalDbError("VALIDATION_ERROR", "Select an active expense category.");
  const account = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM financial_accounts WHERE id = ? AND user_id = ? AND status = 'active' AND deleted = 0", input.sourceAccountId, userId,
  );
  if (!account) throw new LocalDbError("VALIDATION_ERROR", "Select an active account to pay from.");
}

function toColumnValue(column: Column, input: ScheduledPaymentInput): SQLite.SQLiteBindValue {
  const value = input[COLUMNS[column]];
  return BOOLEAN_COLUMNS.has(column) ? (value ? 1 : 0) : value as SQLite.SQLiteBindValue;
}

function toPayloadValue(column: Column, input: ScheduledPaymentInput): unknown {
  return input[COLUMNS[column]];
}

async function readRow(db: SQLite.SQLiteDatabase, userId: string, id: string): Promise<Row | null> {
  return db.getFirstAsync<Row>("SELECT * FROM scheduled_payments WHERE id = ? AND user_id = ? AND deleted = 0", id, userId);
}

export async function listScheduledPayments(userId: string, status: ScheduledPaymentStatus = "active"): Promise<ScheduledPayment[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>("SELECT * FROM scheduled_payments WHERE user_id = ? AND deleted = 0 AND status = ? ORDER BY name COLLATE NOCASE", userId, status);
  return rows.map(map);
}

export async function getScheduledPayment(userId: string, id: string): Promise<ScheduledPayment | null> {
  const row = await readRow(await getDb(), userId, id);
  return row ? map(row) : null;
}

export async function createScheduledPayment(userId: string, deviceId: string, rawInput: ScheduledPaymentInput, today = localToday()): Promise<ScheduledPayment> {
  const input = normalize(rawInput);
  validate(input);
  const db = await getDb();
  const id = randomUUID();
  const ts = new Date().toISOString();
  const autoPostFrom = input.autoPost ? today : null;
  const columns = Object.keys(COLUMNS) as Column[];
  await db.withTransactionAsync(async () => {
    await assertReferences(db, userId, input);
    await db.runAsync(
      `INSERT INTO scheduled_payments (id, user_id, ${columns.join(", ")}, auto_post_from, status, version, deleted, created_at, updated_at)
       VALUES (?, ?, ${columns.map(() => "?").join(", ")}, ?, 'active', 1, 0, ?, ?)`,
      id, userId, ...columns.map((column) => toColumnValue(column, input)), autoPostFrom, ts, ts,
    );
    const payload: Record<string, unknown> = Object.fromEntries(columns.map((column) => [column, toPayloadValue(column, input)]));
    payload.auto_post_from = autoPostFrom;
    await enqueueOperation(db, { userId, deviceId, entity: "scheduled_payments", recordId: id, operationType: "create", baseVersion: null, changedFields: Object.keys(payload), payload, failureMessage: `The biller or remittance "${input.name}" could not be created.` });
  });
  return (await getScheduledPayment(userId, id))!;
}

async function applyUpdate(db: SQLite.SQLiteDatabase, userId: string, deviceId: string, existing: Row, changes: Record<string, unknown>, columnValues: Record<string, SQLite.SQLiteBindValue>): Promise<void> {
  const fields = Object.keys(changes);
  if (!fields.length) return;
  await db.runAsync(
    `UPDATE scheduled_payments SET ${fields.map((field) => `${field} = ?`).join(", ")}, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?`,
    ...fields.map((field) => columnValues[field] ?? null), new Date().toISOString(), existing.id, userId,
  );
  await enqueueOperation(db, { userId, deviceId, entity: "scheduled_payments", recordId: existing.id, operationType: "update", baseVersion: existing.version, changedFields: fields, payload: changes, failureMessage: `The biller or remittance "${existing.name}" could not be updated.` });
}

export async function updateScheduledPayment(userId: string, deviceId: string, id: string, rawInput: ScheduledPaymentInput, today = localToday()): Promise<ScheduledPayment> {
  const input = normalize(rawInput);
  validate(input);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const existing = await readRow(db, userId, id);
    if (!existing) throw new LocalDbError("NOT_FOUND", "This biller or remittance no longer exists.");
    if (existing.status !== "active") throw new LocalDbError("VALIDATION_ERROR", "Restore this biller or remittance before editing it.");
    await assertReferences(db, userId, input);
    const changes: Record<string, unknown> = {};
    const columnValues: Record<string, SQLite.SQLiteBindValue> = {};
    for (const column of Object.keys(COLUMNS) as Column[]) {
      const value = toColumnValue(column, input);
      if (existing[column] === value) continue;
      changes[column] = toPayloadValue(column, input);
      columnValues[column] = value;
    }
    // Turning auto-post on only covers due dates from today, never the backlog.
    if (input.autoPost && existing.auto_post !== 1) { changes.auto_post_from = today; columnValues.auto_post_from = today; }
    await applyUpdate(db, userId, deviceId, existing, changes, columnValues);
  });
  return (await getScheduledPayment(userId, id))!;
}

export async function setScheduledPaymentAutoPost(userId: string, deviceId: string, id: string, autoPost: boolean, today = localToday()): Promise<ScheduledPayment> {
  const existing = await getScheduledPayment(userId, id);
  if (!existing) throw new LocalDbError("NOT_FOUND", "This biller or remittance no longer exists.");
  if (autoPost && existing.frequency === "once") throw new LocalDbError("VALIDATION_ERROR", "Auto-post needs a repeat. Pick a frequency to turn it on.");
  return updateScheduledPayment(userId, deviceId, id, { ...existing, autoPost }, today);
}

// Archiving keeps history but takes the payment out of planning, so it also stops auto-post.
export async function setScheduledPaymentArchived(userId: string, deviceId: string, id: string, archived: boolean): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const existing = await readRow(db, userId, id);
    if (!existing) throw new LocalDbError("NOT_FOUND", "This biller or remittance no longer exists.");
    const status: ScheduledPaymentStatus = archived ? "archived" : "active";
    if (existing.status === status) return;
    const changes: Record<string, unknown> = { status };
    const columnValues: Record<string, SQLite.SQLiteBindValue> = { status };
    if (archived && existing.auto_post === 1) { changes.auto_post = false; columnValues.auto_post = 0; }
    await applyUpdate(db, userId, deviceId, existing, changes, columnValues);
  });
}

// Payment records and their transactions stay; only the schedule goes.
export async function deleteScheduledPayment(userId: string, deviceId: string, id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const existing = await readRow(db, userId, id);
    if (!existing) throw new LocalDbError("NOT_FOUND", "This biller or remittance no longer exists.");
    await db.runAsync("UPDATE scheduled_payments SET deleted = 1, auto_post = 0, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?", new Date().toISOString(), id, userId);
    await enqueueOperation(db, { userId, deviceId, entity: "scheduled_payments", recordId: id, operationType: "delete", baseVersion: existing.version, changedFields: [], payload: {}, failureMessage: `The biller or remittance "${existing.name}" could not be deleted.` });
  });
}

export type ScheduledPaymentSummary = ScheduledPayment & { current: Occurrence | null };

export async function listScheduledPaymentSummaries(userId: string, status: ScheduledPaymentStatus = "active", today = localToday()): Promise<ScheduledPaymentSummary[]> {
  const [payments, paid] = await Promise.all([listScheduledPayments(userId, status), listPaidByOccurrence(userId)]);
  return payments.map((payment) => ({ ...payment, current: currentOccurrence(payment, payment.amountCentavos, paid.get(payment.id) ?? new Map(), today) }));
}

export type ScheduledPaymentEntry = {
  savingsGoalWithdrawals?: SavingsExpenseWithdrawal[];
  // Generated once per payment form, so a repeated submit records nothing new.
  id?: string;
  scheduledPaymentId: string;
  occurrenceDate: string;
  amountCentavos: number;
  paymentDate: string;
  sourceAccountId: string;
  notes: string | null;
};

async function prepareCreditCardCycle(userId: string, deviceId: string, accountId: string, date: string): Promise<void> {
  const db = await getDb();
  const card = await db.getFirstAsync<{ id: string }>("SELECT id FROM financial_accounts WHERE id = ? AND user_id = ? AND kind = 'credit_card' AND deleted = 0", accountId, userId);
  if (card) await ensureCurrentCreditCardCycles(userId, deviceId, date);
}

// Marks the expense as this biller's payment, which is what lets it go uncategorized. An auto-post's id is
// per occurrence and matches private.post_due_scheduled_payments, so server and device posts still converge.
export function scheduledPaymentMutationId(scheduledPaymentId: string, source: "manual" | "auto", occurrenceDate: string, recordId: string): string {
  const base = `${BILLER_PAYMENT_MUTATION_PREFIX}${scheduledPaymentId.toLowerCase()}`;
  return source === "auto" ? `${base}:${occurrenceDate}` : `${base}:record:${recordId}`;
}

async function writePayment(db: SQLite.SQLiteDatabase, userId: string, deviceId: string, payment: Row, entry: ScheduledPaymentEntry, source: "manual" | "auto", ids: { transactionId?: string; recordId: string }): Promise<void> {
  const { transaction } = await createExpenseInTransaction(db, userId, deviceId, {
    // Only auto-posts are "recurring"; a recorded payment keeps the default, as any other expense does.
    entry_source: source === "auto" ? "recurring" : undefined,
    savings_goal_withdrawals: entry.savingsGoalWithdrawals,
    amount_centavos: entry.amountCentavos,
    source_account_id: entry.sourceAccountId,
    subcategory_id: payment.subcategory_id,
    transaction_date: entry.paymentDate,
    merchant_name: payment.name,
    notes: entry.notes ?? undefined,
    client_mutation_id: scheduledPaymentMutationId(payment.id, source, entry.occurrenceDate, ids.recordId),
  }, { id: ids.transactionId });
  await insertScheduledPaymentRecordInTransaction(db, userId, deviceId, {
    id: ids.recordId, scheduledPaymentId: payment.id, transactionId: transaction.id, occurrenceDate: entry.occurrenceDate,
    paymentDate: entry.paymentDate, amountCentavos: entry.amountCentavos, source, notes: entry.notes, settlesOccurrence: false,
  });
}

// Records a payment against one occurrence, together with the expense transaction that moves the money.
export async function recordScheduledPayment(userId: string, deviceId: string, entry: ScheduledPaymentEntry): Promise<void> {
  if (!Number.isSafeInteger(entry.amountCentavos) || entry.amountCentavos <= 0) throw new LocalDbError("VALIDATION_ERROR", "Enter a positive payment amount.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.paymentDate)) throw new LocalDbError("VALIDATION_ERROR", "Select a payment date.");
  if (!entry.sourceAccountId) throw new LocalDbError("VALIDATION_ERROR", "Select a source account.");
  await prepareCreditCardCycle(userId, deviceId, entry.sourceAccountId, entry.paymentDate);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    if (entry.id && await db.getFirstAsync("SELECT id FROM scheduled_payment_records WHERE id = ? AND user_id = ?", entry.id, userId)) return;
    const payment = await readRow(db, userId, entry.scheduledPaymentId);
    if (!payment || payment.status !== "active") throw new LocalDbError("VALIDATION_ERROR", "This obligation is no longer available for payments. Choose an active obligation instead.");
    await writePayment(db, userId, deviceId, payment, { ...entry, notes: entry.notes?.trim() || null }, "manual", { recordId: entry.id ?? randomUUID() });
  });
}

// Deleting the transaction cascades to its payment record.
export async function deleteScheduledPaymentRecord(userId: string, deviceId: string, transactionId: string): Promise<void> {
  await deleteTransaction(userId, deviceId, transactionId);
}

// Most occurrences one catch-up run posts per scheduled payment, so a long-closed app cannot flood the ledger.
// The server job (private.post_due_scheduled_payments) has no cap and catches up the rest once online.
const MAX_CATCH_UP = 12;

// Shared with private.scheduled_payment_post_id on the server: never change it, or posts stop converging.
export const SCHEDULED_PAYMENT_POST_NAMESPACE = "7f4fa802-4c64-4370-aed4-ca25c703928f";

// The ids an auto-post writes for one occurrence. The server job derives the same ids, so whichever of the
// server or a device posts first wins and every later post of that occurrence is a no-op.
export function scheduledPaymentPostIds(scheduledPaymentId: string, dueDate: string): { transactionId: string; recordId: string } {
  const key = `scheduled-payment:${scheduledPaymentId.toLowerCase()}:${dueDate}`;
  return { transactionId: uuidV5(`${key}:transaction`, SCHEDULED_PAYMENT_POST_NAMESPACE), recordId: uuidV5(`${key}:record`, SCHEDULED_PAYMENT_POST_NAMESPACE) };
}

// Offline fallback for the server's auto-post job: posts each auto-post occurrence due by today that is still unpaid.
export async function postDueScheduledPayments(userId: string, deviceId: string, today = localToday()): Promise<number> {
  const db = await getDb();
  const payments = await db.getAllAsync<Row & { source_balance_centavos: number }>(
    `SELECT p.*, a.current_balance_centavos AS source_balance_centavos FROM scheduled_payments p
     JOIN financial_accounts a ON a.id = p.source_account_id AND a.user_id = p.user_id
     WHERE p.user_id = ? AND p.deleted = 0 AND p.status = 'active' AND p.auto_post = 1 AND p.auto_post_from IS NOT NULL
       AND a.deleted = 0 AND a.status = 'active' AND a.kind <> 'credit_card' ORDER BY p.id`, userId,
  );
  const balances = new Map(payments.map((payment) => [payment.source_account_id, payment.source_balance_centavos]));
  let posted = 0;
  for (const payment of payments) {
    const dueDates = dueDatesBetween(map(payment), payment.auto_post_from!, today).slice(-MAX_CATCH_UP);
    if (!dueDates.length) continue;
    try {
      await prepareCreditCardCycle(userId, deviceId, payment.source_account_id, today);
      let remainingBalance = balances.get(payment.source_account_id)!;
      let paymentPosted = 0;
      await db.withTransactionAsync(async () => {
        const paid = (await listPaidByOccurrence(userId, db)).get(payment.id) ?? new Map<string, number>();
        for (const dueDate of dueDates) {
          const remaining = payment.amount_centavos - (paid.get(dueDate) ?? 0);
          const ids = scheduledPaymentPostIds(payment.id, dueDate);
          // Either id already present means this occurrence was posted here or pulled from the server, even if since deleted.
          if (remaining <= 0 || await db.getFirstAsync("SELECT id FROM scheduled_payment_records WHERE id = ?", ids.recordId) || await db.getFirstAsync("SELECT id FROM transactions WHERE id = ?", ids.transactionId)) continue;
          if (remaining > remainingBalance) throw new LocalDbError("VALIDATION_ERROR", "The source account has insufficient funds for automatic posting.");
          await writePayment(db, userId, deviceId, payment, { scheduledPaymentId: payment.id, occurrenceDate: dueDate, amountCentavos: remaining, paymentDate: dueDate, sourceAccountId: payment.source_account_id, notes: null }, "auto", ids);
          remainingBalance -= remaining;
          paymentPosted += 1;
        }
      });
      balances.set(payment.source_account_id, remainingBalance);
      posted += paymentPosted;
    } catch (error) {
      // One payment that cannot post (for example a closed account) must not block the others.
      console.warn("[SCHEDULED-PAYMENTS] auto-post skipped", payment.id, error);
    }
  }
  return posted;
}
