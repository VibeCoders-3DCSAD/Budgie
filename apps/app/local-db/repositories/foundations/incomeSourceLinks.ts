import * as SQLite from "expo-sqlite";
import { LocalDbError } from "../../helpers";
import { manilaToday } from "../../../lib/dates";
import type { IncomeFrequency } from "./incomeSourceModel";

// Income-source checks and the recurring template that posts each payday.

export async function assertAccessibleIncomeDestinationAndCategory(
  db: SQLite.SQLiteDatabase,
  userId: string,
  destinationAccountId: string,
  subcategoryId: string,
): Promise<void> {
  const account = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM financial_accounts WHERE user_id = ? AND id = ? AND deleted = 0 AND status = 'active'",
    userId,
    destinationAccountId,
  );
  if (!account) {
    throw new LocalDbError("VALIDATION_ERROR", "destinationAccountId does not reference an accessible active account");
  }

  const subcategory = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM subcategories WHERE user_id = ? AND id = ? AND kind = 'income' AND deleted = 0 AND is_active = 1",
    userId,
    subcategoryId,
  );
  if (!subcategory) {
    throw new LocalDbError("VALIDATION_ERROR", "subcategoryId does not reference an accessible active income subcategory");
  }
}

export async function syncIncomeSourceRecurringTemplate(
  db: SQLite.SQLiteDatabase,
  userId: string,
  deviceId: string,
  source: {
    id: string;
    recurringTemplateId: string | null;
    name: string;
    frequency: IncomeFrequency;
    destinationAccountId: string;
    subcategoryId: string;
    expectedAmountCentavos: number;
    paydayDayOfMonth: number | null;
    paydaySecondDayOfMonth: number | null;
    paydayDayOfWeek: number | null;
    nextExpectedDate: string | null;
    notes: string | null;
  },
): Promise<string> {
  const { createRecurringTemplate, updateRecurringTemplate } = await import("../ledger/recurringTransactions");

  const recurringInput = {
    transaction_type: "income" as const,
    name: source.name,
    amount_centavos: source.expectedAmountCentavos,
    frequency: source.frequency,
    day_of_month: source.paydayDayOfMonth ?? undefined,
    second_day_of_month: source.paydaySecondDayOfMonth ?? undefined,
    day_of_week: source.paydayDayOfWeek ?? undefined,
    // Saving starts the schedule over from today (Asia/Manila), so an edit never back-posts missed paydays.
    starts_on: source.nextExpectedDate ?? manilaToday(),
    subcategory_id: source.subcategoryId,
    destination_account_id: source.destinationAccountId,
    notes: source.notes ?? undefined,
  };

  if (source.recurringTemplateId) {
    await updateRecurringTemplate(userId, deviceId, source.recurringTemplateId, recurringInput, db);
    return source.recurringTemplateId;
  }

  const { template } = await createRecurringTemplate(userId, deviceId, recurringInput, db);
  return template.id;
}
