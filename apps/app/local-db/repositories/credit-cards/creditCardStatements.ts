import { enqueueOperation, LocalDbError } from "../../helpers";
import { randomUUID } from "../../uuid";
import type { SyncOperation } from "../../types";
import { validateIsoDate } from "./creditCardCycleDates";
import { getDb, now } from "../helpers/db";
import { manilaToday } from "../../../lib/dates";

export type CreditCardStatement = {
  id: string;
  user_id: string;
  cycle_id: string;
  statement_date: string;
  statement_balance_centavos: number;
  minimum_due_centavos: number;
  finance_charge_centavos: number;
  due_date: string;
  authoritative: boolean;
  version: number;
  deleted: boolean;
  created_at: string;
  updated_at: string;
};

type StatementRow = Omit<CreditCardStatement, "authoritative" | "deleted"> & { authoritative: number; deleted: number };

export type CreateCreditCardStatementInput = Pick<CreditCardStatement,
  "cycle_id" | "statement_date" | "statement_balance_centavos" | "minimum_due_centavos" | "due_date"
> & { finance_charge_centavos?: number };


function mapStatement(row: StatementRow): CreditCardStatement {
  return { ...row, authoritative: row.authoritative === 1, deleted: row.deleted === 1 };
}

function payload(statement: CreateCreditCardStatementInput): Record<string, unknown> {
  return {
    cycle_id: statement.cycle_id,
    statement_date: statement.statement_date,
    statement_balance_centavos: statement.statement_balance_centavos,
    minimum_due_centavos: statement.minimum_due_centavos,
    finance_charge_centavos: statement.finance_charge_centavos ?? 0,
    due_date: statement.due_date,
  };
}

function validateStatementAmounts(input: {
  statement_balance_centavos: number;
  minimum_due_centavos: number;
  finance_charge_centavos: number;
}): void {
  for (const [name, value] of Object.entries({
    statement_balance_centavos: input.statement_balance_centavos,
    minimum_due_centavos: input.minimum_due_centavos,
    finance_charge_centavos: input.finance_charge_centavos,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new LocalDbError("VALIDATION_ERROR", `${name} must be a non-negative whole number.`);
    }
  }
  if (input.minimum_due_centavos > input.statement_balance_centavos) {
    throw new LocalDbError("VALIDATION_ERROR", "Minimum amount due cannot exceed the statement balance.");
  }
}

function validateInput(input: CreateCreditCardStatementInput): void {
  validateIsoDate(input.statement_date, "statementDate");
  validateIsoDate(input.due_date, "dueDate");
  validateStatementAmounts({
    statement_balance_centavos: input.statement_balance_centavos,
    minimum_due_centavos: input.minimum_due_centavos,
    finance_charge_centavos: input.finance_charge_centavos ?? 0,
  });
}

export async function getCreditCardStatementByCycle(userId: string, cycleId: string): Promise<CreditCardStatement | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<StatementRow>(
    "SELECT * FROM credit_card_statements WHERE user_id = ? AND cycle_id = ? AND deleted = 0",
    userId,
    cycleId,
  );
  return row ? mapStatement(row) : null;
}

export async function listCreditCardStatements(userId: string): Promise<CreditCardStatement[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<StatementRow>(
    "SELECT * FROM credit_card_statements WHERE user_id = ? AND deleted = 0 ORDER BY statement_date DESC",
    userId,
  );
  return rows.map(mapStatement);
}

export async function createCreditCardStatement(
  userId: string,
  deviceId: string,
  input: CreateCreditCardStatementInput,
): Promise<{ statement: CreditCardStatement; operations: SyncOperation[] }> {
  validateInput(input);
  const db = await getDb();
  const id = randomUUID();
  const timestamp = now();
  let result!: { statement: CreditCardStatement; operations: SyncOperation[] };

  await db.withTransactionAsync(async () => {
    const cycle = await db.getFirstAsync<{ id: string; cutoff_date: string; statement_date: string | null }>(
      `SELECT c.id, c.cutoff_date, c.statement_date
         FROM credit_card_cycles c
         JOIN financial_accounts a ON a.id = c.account_id AND a.user_id = c.user_id
        WHERE c.id = ? AND c.user_id = ? AND c.deleted = 0
          AND a.kind = 'credit_card' AND a.status = 'active' AND a.deleted = 0`,
      input.cycle_id,
      userId,
    );
    if (!cycle) throw new LocalDbError("NOT_FOUND", "Credit card billing cycle not found.");
    // The Manila day, like the screen that offers "Add statement" and the statement form's date bound.
    const today = manilaToday();
    if (cycle.cutoff_date >= today) {
      throw new LocalDbError("VALIDATION_ERROR", "Statements can only be recorded after the billing cycle has closed.");
    }
    if (cycle.statement_date) throw new LocalDbError("VALIDATION_ERROR", "A statement has already been recorded for this billing cycle.");
    if (input.statement_date < cycle.cutoff_date || input.statement_date > today) {
      throw new LocalDbError("VALIDATION_ERROR", "Statement date must be on or after the billing-cycle cutoff and no later than today.");
    }
    const existing = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM credit_card_statements WHERE user_id = ? AND cycle_id = ? AND deleted = 0",
      userId,
      input.cycle_id,
    );
    if (existing) throw new LocalDbError("VALIDATION_ERROR", "A statement has already been recorded for this billing cycle.");

    const statementPayload = payload(input);
    await db.runAsync(
      `INSERT INTO credit_card_statements
        (id, user_id, cycle_id, statement_date, statement_balance_centavos, minimum_due_centavos,
         finance_charge_centavos, due_date, authoritative, version, deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?)`,
      id, userId, input.cycle_id, input.statement_date, input.statement_balance_centavos,
      input.minimum_due_centavos, input.finance_charge_centavos ?? 0, input.due_date, timestamp, timestamp,
    );
    await db.runAsync(
      "UPDATE credit_card_cycles SET statement_date = ?, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?",
      input.statement_date, timestamp, input.cycle_id, userId,
    );
    const statementOperation = await enqueueOperation(db, {
      userId, deviceId, entity: "credit_card_statements", recordId: id, operationType: "create", baseVersion: null,
      changedFields: Object.keys(statementPayload), payload: statementPayload,
      failureMessage: "This credit-card statement could not be saved.",
    });
    const row = await db.getFirstAsync<StatementRow>("SELECT * FROM credit_card_statements WHERE id = ? AND user_id = ?", id, userId);
    if (!row) throw new LocalDbError("INTERNAL_ERROR", "Failed to read recorded credit-card statement.");
    result = { statement: mapStatement(row), operations: [statementOperation] };
  });

  return result;
}
