import * as SQLite from "expo-sqlite";
import { enqueueOperation, LocalDbError } from "../../helpers";
import { getDb } from "../helpers/db";

// Kept apart from scheduledPayments.ts so the ledger can cascade transaction deletes here without an import cycle.

export type ScheduledPaymentRecord = {
  id: string;
  scheduledPaymentId: string;
  transactionId: string;
  occurrenceDate: string;
  paymentDate: string;
  amountCentavos: number;
  source: "manual" | "auto";
  notes: string | null;
  settlesOccurrence: boolean;
  version: number;
};

type Row = { id: string; scheduled_payment_id: string; transaction_id: string; occurrence_date: string; payment_date: string; amount_centavos: number; source: "manual" | "auto"; notes: string | null; settles_occurrence: number; version: number };

const SELECT = "SELECT id, scheduled_payment_id, transaction_id, occurrence_date, payment_date, amount_centavos, source, notes, settles_occurrence, version FROM scheduled_payment_records";

function map(row: Row): ScheduledPaymentRecord {
  return { id: row.id, scheduledPaymentId: row.scheduled_payment_id, transactionId: row.transaction_id, occurrenceDate: row.occurrence_date, paymentDate: row.payment_date, amountCentavos: row.amount_centavos, source: row.source, notes: row.notes, settlesOccurrence: row.settles_occurrence === 1, version: row.version };
}

export async function listScheduledPaymentRecords(userId: string, scheduledPaymentId: string): Promise<ScheduledPaymentRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(`${SELECT} WHERE user_id = ? AND scheduled_payment_id = ? AND deleted = 0 ORDER BY payment_date DESC, created_at DESC`, userId, scheduledPaymentId);
  return rows.map(map);
}

// Paid totals per scheduled payment, keyed by the due date each payment was recorded against.
// An occurrence settled in full counts as paid at least its scheduled amount, so nothing treats it as owing.
export async function listPaidByOccurrence(userId: string, db?: SQLite.SQLiteDatabase): Promise<Map<string, Map<string, number>>> {
  const rows = await readPaidByOccurrence(db ?? await getDb(), userId);
  const paid = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const byDate = paid.get(row.scheduled_payment_id) ?? new Map<string, number>();
    byDate.set(row.occurrence_date, row.paid);
    paid.set(row.scheduled_payment_id, byDate);
  }
  return paid;
}

// listPaidByOccurrence for one scheduled payment, without aggregating every other payment's records.
export async function listPaidForScheduledPayment(userId: string, scheduledPaymentId: string, db?: SQLite.SQLiteDatabase): Promise<Map<string, number>> {
  const rows = await readPaidByOccurrence(db ?? await getDb(), userId, scheduledPaymentId);
  return new Map(rows.map((row) => [row.occurrence_date, row.paid]));
}

function readPaidByOccurrence(db: SQLite.SQLiteDatabase, userId: string, scheduledPaymentId?: string) {
  const paymentFilter = scheduledPaymentId === undefined ? "" : "AND r.scheduled_payment_id = ?";
  return db.getAllAsync<{ scheduled_payment_id: string; occurrence_date: string; paid: number }>(
    `SELECT r.scheduled_payment_id, r.occurrence_date,
            CASE WHEN MAX(r.settles_occurrence) = 1 THEN MAX(SUM(r.amount_centavos), COALESCE(p.amount_centavos, 0)) ELSE SUM(r.amount_centavos) END AS paid
       FROM scheduled_payment_records r
       LEFT JOIN scheduled_payments p ON p.id = r.scheduled_payment_id AND p.user_id = r.user_id
      WHERE r.user_id = ? AND r.deleted = 0 ${paymentFilter}
      GROUP BY r.scheduled_payment_id, r.occurrence_date`,
    userId,
    ...(scheduledPaymentId === undefined ? [] : [scheduledPaymentId]),
  );
}

export async function insertScheduledPaymentRecordInTransaction(db: SQLite.SQLiteDatabase, userId: string, deviceId: string, record: Omit<ScheduledPaymentRecord, "version">): Promise<void> {
  const ts = new Date().toISOString();
  await db.runAsync(
    "INSERT INTO scheduled_payment_records (id, user_id, scheduled_payment_id, transaction_id, occurrence_date, payment_date, amount_centavos, source, notes, version, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)",
    record.id, userId, record.scheduledPaymentId, record.transactionId, record.occurrenceDate, record.paymentDate, record.amountCentavos, record.source, record.notes, ts, ts,
  );
  const payload = { scheduled_payment_id: record.scheduledPaymentId, transaction_id: record.transactionId, occurrence_date: record.occurrenceDate, payment_date: record.paymentDate, amount_centavos: record.amountCentavos, source: record.source, notes: record.notes };
  await enqueueOperation(db, { userId, deviceId, entity: "scheduled_payment_records", recordId: record.id, operationType: "create", baseVersion: null, changedFields: Object.keys(payload), payload, failureMessage: "This biller or remittance payment could not be recorded." });
}

export async function deleteScheduledPaymentRecordForTransactionInTransaction(db: SQLite.SQLiteDatabase, userId: string, deviceId: string, transactionId: string): Promise<void> {
  const record = await db.getFirstAsync<Row>(`${SELECT} WHERE user_id = ? AND transaction_id = ? AND deleted = 0`, userId, transactionId);
  if (!record) return;
  await db.runAsync("UPDATE scheduled_payment_records SET deleted = 1, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?", new Date().toISOString(), record.id, userId);
  await enqueueOperation(db, { userId, deviceId, entity: "scheduled_payment_records", recordId: record.id, operationType: "delete", baseVersion: record.version, changedFields: [], payload: {}, failureMessage: "This biller or remittance payment could not be deleted." });
}

// Marks an underpaid occurrence as paid in full by flagging its latest payment; deleting that payment undoes it.
export async function settleScheduledPaymentOccurrence(userId: string, deviceId: string, scheduledPaymentId: string, occurrenceDate: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const record = await db.getFirstAsync<Row>(`${SELECT} WHERE user_id = ? AND scheduled_payment_id = ? AND occurrence_date = ? AND deleted = 0 ORDER BY payment_date DESC, created_at DESC`, userId, scheduledPaymentId, occurrenceDate);
    if (!record) throw new LocalDbError("VALIDATION_ERROR", "Record a payment for this occurrence before marking it as paid.");
    if (record.settles_occurrence === 1) return;
    await db.runAsync("UPDATE scheduled_payment_records SET settles_occurrence = 1, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?", new Date().toISOString(), record.id, userId);
    await enqueueOperation(db, { userId, deviceId, entity: "scheduled_payment_records", recordId: record.id, operationType: "update", baseVersion: record.version, changedFields: ["settles_occurrence"], payload: { settles_occurrence: true }, failureMessage: "This biller or remittance occurrence could not be marked as paid." });
  });
}
