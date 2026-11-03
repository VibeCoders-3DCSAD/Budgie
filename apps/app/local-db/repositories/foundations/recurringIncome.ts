import * as SQLite from "expo-sqlite";
import { enqueueOperation } from "../../helpers";
import { uuidV5 } from "../../uuid";
import { dueDatesBetween, localToday, type ScheduledPaymentFrequency } from "../../../features/billers/schedule";
import { createIncomeInTransaction } from "../ledger/ledger";
import { getDb } from "../helpers/db";

// Offline fallback for the server's income job (private.post_due_recurring_income): posts each payday of an
// active income source, due by today, that has not been posted. It shares the billers' schedule engine.

// Shared with private.recurring_income_post_id on the server: never change it, or posts stop converging.
export const RECURRING_INCOME_POST_NAMESPACE = "50eb90f0-dbc0-47d9-bddc-eb981388b0a3";

// Most paydays one catch-up run posts per income source, so a long-closed app cannot flood the ledger.
// The server job has no cap and catches up the rest once online.
const MAX_CATCH_UP = 12;

type DueTemplate = {
  id: string;
  name: string;
  amount_centavos: number;
  subcategory_id: string;
  destination_account_id: string;
  frequency: ScheduledPaymentFrequency;
  day_of_month: number | null;
  second_day_of_month: number | null;
  day_of_week: number | null;
  starts_on: string;
  ends_on: string | null;
};

// The ids a post writes for one payday. The server job derives the same ids, so whichever of the server or a
// device posts first wins and every later post of that payday is a no-op.
export function recurringIncomePostIds(templateId: string, payday: string): { transactionId: string; occurrenceId: string } {
  const key = `recurring-income:${templateId.toLowerCase()}:${payday}`;
  return { transactionId: uuidV5(`${key}:transaction`, RECURRING_INCOME_POST_NAMESPACE), occurrenceId: uuidV5(`${key}:occurrence`, RECURRING_INCOME_POST_NAMESPACE) };
}

// A payday counts as posted once any occurrence exists for it (including the retired engine's random-id ones),
// or either derived id is present, even if since deleted. Two reads cover every payday of one catch-up run.
async function postedPaydays(db: SQLite.SQLiteDatabase, templateId: string, paydays: string[]): Promise<Set<string>> {
  const byOccurrenceId = new Map<string, string>();
  const byTransactionId = new Map<string, string>();
  for (const payday of paydays) {
    const ids = recurringIncomePostIds(templateId, payday);
    byOccurrenceId.set(ids.occurrenceId, payday);
    byTransactionId.set(ids.transactionId, payday);
  }
  const marks = paydays.map(() => "?").join(", ");
  const occurrences = await db.getAllAsync<{ id: string; recurring_template_id: string; scheduled_date: string }>(
    `SELECT id, recurring_template_id, scheduled_date FROM recurring_transaction_occurrences
      WHERE id IN (${marks}) OR (recurring_template_id = ? AND scheduled_date IN (${marks}))`,
    ...byOccurrenceId.keys(), templateId, ...paydays,
  );
  const transactions = await db.getAllAsync<{ id: string }>(`SELECT id FROM transactions WHERE id IN (${marks})`, ...byTransactionId.keys());
  const posted = new Set<string>();
  for (const row of occurrences) {
    const payday = byOccurrenceId.get(row.id);
    if (payday) posted.add(payday);
    if (row.recurring_template_id === templateId) posted.add(row.scheduled_date);
  }
  for (const row of transactions) {
    const payday = byTransactionId.get(row.id);
    if (payday) posted.add(payday);
  }
  return posted;
}

export async function postDueRecurringIncome(userId: string, deviceId: string, today = localToday()): Promise<number> {
  const db = await getDb();
  const templates = await db.getAllAsync<DueTemplate>(
    `SELECT t.id, s.name, t.amount_centavos, t.subcategory_id, t.destination_account_id, t.frequency, t.day_of_month,
            t.second_day_of_month, t.day_of_week, t.starts_on, t.ends_on
       FROM recurring_transaction_templates t
       JOIN income_sources s ON s.recurring_template_id = t.id AND s.user_id = t.user_id AND s.deleted = 0 AND s.is_active = 1
       JOIN financial_accounts a ON a.id = t.destination_account_id AND a.user_id = t.user_id AND a.status = 'active' AND a.deleted = 0
      WHERE t.user_id = ? AND t.deleted = 0 AND t.status = 'active' AND t.transaction_type = 'income'
      ORDER BY t.id`,
    userId,
  );
  let posted = 0;
  for (const template of templates) {
    const paydays = dueDatesBetween({
      frequency: template.frequency, dueDayOfMonth: template.day_of_month, dueSecondDayOfMonth: template.second_day_of_month,
      dueDayOfWeek: template.day_of_week, dueMonth: null, startsOn: template.starts_on, endsOn: template.ends_on,
    }, template.starts_on, today).slice(-MAX_CATCH_UP);
    if (!paydays.length) continue;
    try {
      await db.withTransactionAsync(async () => {
        const alreadyPosted = await postedPaydays(db, template.id, paydays);
        for (const payday of paydays) {
          if (alreadyPosted.has(payday)) continue;
          const ids = recurringIncomePostIds(template.id, payday);
          await createIncomeInTransaction(db, userId, deviceId, {
            entry_source: "recurring",
            amount_centavos: template.amount_centavos,
            destination_account_id: template.destination_account_id,
            subcategory_id: template.subcategory_id,
            transaction_date: payday,
            merchant_name: template.name,
          }, { id: ids.transactionId });
          const ts = new Date().toISOString();
          await db.runAsync(
            `INSERT INTO recurring_transaction_occurrences (id, recurring_template_id, user_id, scheduled_date, status, generated_transaction_id, posted_at, version, deleted, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'posted', ?, ?, 1, 0, ?, ?)`,
            ids.occurrenceId, template.id, userId, payday, ids.transactionId, ts, ts, ts,
          );
          await enqueueOperation(db, {
            userId, deviceId, entity: "recurring_transaction_occurrences", recordId: ids.occurrenceId, operationType: "create", baseVersion: null,
            changedFields: [], payload: { recurring_template_id: template.id, scheduled_date: payday, generated_transaction_id: ids.transactionId },
            failureMessage: `The ${template.name} income for ${payday} could not be posted.`,
          });
          posted += 1;
        }
      });
    } catch (error) {
      // One income source that cannot post (for example an inactive category) must not block the others.
      console.warn("[RECURRING-INCOME] auto-post skipped", template.id, error);
    }
  }
  return posted;
}
