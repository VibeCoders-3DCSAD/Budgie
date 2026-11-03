import type { SQLiteDatabase } from "expo-sqlite";
import { enqueueOperation, LocalDbError } from "../../helpers";
import { randomUUID } from "../../uuid";
import type { SyncOperation } from "../../types";
import { getDb, now } from "../helpers/db";
import { localToday } from "../../../features/billers/schedule";
import {
  calculateCurrentCreditCardCycle,
  calculateSuccessorCreditCardCycle,
  validateCreditCardCycleDates,
  validateIsoDate,
} from "./creditCardCycleDates";

export type CreditCardCycle = {
  id: string;
  user_id: string;
  account_id: string;
  cycle_start_date: string;
  cutoff_date: string;
  statement_date: string | null;
  version: number;
  deleted: boolean;
  created_at: string;
  updated_at: string;
};

export type CreditCardCycleTransaction = {
  transaction_id: string;
  account_id: string;
  cycle_id: string;
  purchase_type: "regular" | "installment";
  installment_id: string | null;
  transaction_date: string;
  merchant_name: string | null;
  amount_centavos: number;
  forecast_recorded_at?: string;
};

type CycleRow = Omit<CreditCardCycle, "deleted"> & { deleted: number };

export type CreditCardCycleDefaults = {
  account_id: string;
  cutoff_day: number;
  billing_cycle_days: number | null;
};


function mapCycle(row: CycleRow): CreditCardCycle {
  return { ...row, deleted: row.deleted === 1 };
}

function cyclePayload(cycle: Pick<CreditCardCycle, "account_id" | "cycle_start_date" | "cutoff_date">) {
  return {
    account_id: cycle.account_id,
    cycle_start_date: cycle.cycle_start_date,
    cutoff_date: cycle.cutoff_date,
  };
}

export async function listCreditCardCycles(userId: string, accountId?: string): Promise<CreditCardCycle[]> {
  const db = await getDb();
  const rows = accountId
    ? await db.getAllAsync<CycleRow>(
        `SELECT c.* FROM credit_card_cycles c
          JOIN financial_accounts a ON a.id = c.account_id AND a.user_id = c.user_id
         WHERE c.user_id = ? AND c.account_id = ? AND c.deleted = 0
           AND a.kind = 'credit_card' AND a.status = 'active' AND a.deleted = 0
         ORDER BY c.cutoff_date DESC`,
        userId,
        accountId,
      )
    : await db.getAllAsync<CycleRow>(
        `SELECT c.* FROM credit_card_cycles c
          JOIN financial_accounts a ON a.id = c.account_id AND a.user_id = c.user_id
         WHERE c.user_id = ? AND c.deleted = 0
           AND a.kind = 'credit_card' AND a.status = 'active' AND a.deleted = 0
         ORDER BY c.cutoff_date DESC`,
        userId,
      );
  return rows.map(mapCycle);
}

export async function getCurrentCreditCardCycle(
  userId: string,
  accountId: string,
  asOfDate = localToday(),
): Promise<CreditCardCycle | null> {
  validateIsoDate(asOfDate, "asOfDate");
  const db = await getDb();
  const row = await db.getFirstAsync<CycleRow>(
    `SELECT * FROM credit_card_cycles
      WHERE user_id = ? AND account_id = ? AND deleted = 0
        AND cycle_start_date <= ? AND cutoff_date >= ?
      ORDER BY cycle_start_date DESC, cutoff_date DESC LIMIT 1`,
    userId,
    accountId,
    asOfDate,
    asOfDate,
  );
  return row ? mapCycle(row) : null;
}

export async function resolveCreditCardCycle(
  userId: string,
  deviceId: string,
  accountId: string,
  effectiveDate: string,
): Promise<CreditCardCycle> {
  validateIsoDate(effectiveDate, "effectiveDate");
  await ensureCurrentCreditCardCycles(userId, deviceId, effectiveDate);
  const cycle = await getCurrentCreditCardCycle(userId, accountId, effectiveDate);
  if (!cycle) {
    throw new LocalDbError(
      "CREDIT_CARD_TRANSACTION_UNAVAILABLE",
      "Credit-card transactions cannot be recorded until billing-cycle routing is available.",
    );
  }
  return cycle;
}

export async function listCreditCardCycleTransactions(
  userId: string,
  cycleId?: string,
): Promise<CreditCardCycleTransaction[]> {
  const db = await getDb();
  const sql = `WITH scheduled_installments AS (
        SELECT cct.transaction_id, cct.account_id, target_cycle.id AS cycle_id,
          cct.purchase_type, cct.installment_id, t.transaction_date, t.merchant_name,
          i.monthly_amortization_centavos AS amount_centavos, COALESCE(cct.forecast_recorded_at, t.created_at) AS forecast_recorded_at, t.created_at
        FROM credit_card_transactions cct
        JOIN transactions t ON t.id = cct.transaction_id AND t.user_id = cct.user_id AND t.deleted = 0
        JOIN credit_card_installments i ON i.id = cct.installment_id AND i.user_id = cct.user_id AND i.deleted = 0
        JOIN credit_card_cycles origin_cycle ON origin_cycle.id = cct.cycle_id AND origin_cycle.user_id = cct.user_id AND origin_cycle.deleted = 0
        JOIN credit_card_cycles target_cycle ON target_cycle.account_id = cct.account_id AND target_cycle.user_id = cct.user_id AND target_cycle.deleted = 0
        WHERE cct.user_id = ? AND cct.deleted = 0 AND cct.purchase_type = 'installment'
          AND target_cycle.cycle_start_date >= origin_cycle.cycle_start_date
          AND (SELECT COUNT(*) FROM credit_card_cycles ordinal_cycle
                WHERE ordinal_cycle.user_id = cct.user_id AND ordinal_cycle.account_id = cct.account_id
                  AND ordinal_cycle.deleted = 0 AND ordinal_cycle.cycle_start_date >= origin_cycle.cycle_start_date
                  AND ordinal_cycle.cycle_start_date <= target_cycle.cycle_start_date) > (i.term_months - i.remaining_months)
          AND (SELECT COUNT(*) FROM credit_card_cycles ordinal_cycle
                WHERE ordinal_cycle.user_id = cct.user_id AND ordinal_cycle.account_id = cct.account_id
                  AND ordinal_cycle.deleted = 0 AND ordinal_cycle.cycle_start_date >= origin_cycle.cycle_start_date
                  AND ordinal_cycle.cycle_start_date <= target_cycle.cycle_start_date) <= i.term_months
      ), cycle_purchases AS (
        SELECT cct.transaction_id, cct.account_id, cct.cycle_id, cct.purchase_type, cct.installment_id,
          t.transaction_date, t.merchant_name, t.amount_centavos, COALESCE(cct.forecast_recorded_at, t.created_at) AS forecast_recorded_at, t.created_at
        FROM credit_card_transactions cct
        JOIN transactions t ON t.id = cct.transaction_id AND t.user_id = cct.user_id AND t.deleted = 0
        WHERE cct.user_id = ? AND cct.deleted = 0 AND cct.purchase_type = 'regular'
        UNION ALL SELECT * FROM scheduled_installments
      )
       SELECT transaction_id, account_id, cycle_id, purchase_type, installment_id, transaction_date, merchant_name, amount_centavos, forecast_recorded_at
      FROM cycle_purchases
      WHERE (? IS NULL OR cycle_id = ?)
      ORDER BY transaction_date DESC, created_at DESC`;
  return db.getAllAsync<CreditCardCycleTransaction>(sql, userId, userId, cycleId ?? null, cycleId ?? null);
}

export async function createCreditCardCycle(
  userId: string,
  deviceId: string,
  input: Pick<CreditCardCycle, "account_id" | "cycle_start_date" | "cutoff_date">,
): Promise<{ cycle: CreditCardCycle; operation: SyncOperation }> {
  validateCreditCardCycleDates(input);
  const db = await getDb();
  const id = randomUUID();
  const ts = now();
  let result!: { cycle: CreditCardCycle; operation: SyncOperation };

  await db.withTransactionAsync(async () => {
    const account = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM financial_accounts WHERE id = ? AND user_id = ? AND kind = 'credit_card' AND status = 'active' AND deleted = 0",
      input.account_id,
      userId,
    );
    if (!account) throw new LocalDbError("NOT_FOUND", "Credit card account not found");

    await db.runAsync(
      `INSERT INTO credit_card_cycles
        (id, user_id, account_id, cycle_start_date, cutoff_date, statement_date, version, deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      id,
      userId,
      input.account_id,
      input.cycle_start_date,
      input.cutoff_date,
       null,
      ts,
      ts,
    );
    const operation = await enqueueOperation(db, {
      userId,
      deviceId,
      entity: "credit_card_cycles",
      recordId: id,
      operationType: "create",
      baseVersion: null,
      changedFields: Object.keys(cyclePayload(input)),
      payload: cyclePayload(input),
      failureMessage: "This credit-card billing cycle could not be saved.",
    });
    const row = await db.getFirstAsync<CycleRow>("SELECT * FROM credit_card_cycles WHERE id = ? AND user_id = ?", id, userId);
    if (!row) throw new LocalDbError("INTERNAL_ERROR", "failed to read created credit-card cycle");
    result = { cycle: mapCycle(row), operation };
  });

  return result;
}

export async function updateCreditCardCycle(
  userId: string,
  deviceId: string,
  id: string,
  input: Pick<CreditCardCycle, "cycle_start_date" | "cutoff_date">,
): Promise<{ cycle: CreditCardCycle; operation: SyncOperation }> {
  validateCreditCardCycleDates(input);
  const db = await getDb();
  const ts = now();
  let result!: { cycle: CreditCardCycle; operation: SyncOperation };

  await db.withTransactionAsync(async () => {
    const current = await db.getFirstAsync<CycleRow>(
      "SELECT * FROM credit_card_cycles WHERE id = ? AND user_id = ? AND deleted = 0",
      id,
      userId,
    );
    if (!current) throw new LocalDbError("NOT_FOUND", "Credit card billing cycle not found");
    if (current.statement_date) {
      throw new LocalDbError("VALIDATION_ERROR", "Recorded credit-card billing cycles cannot be changed.");
    }
    const today = localToday();
    if (today < current.cycle_start_date || today > current.cutoff_date) {
      throw new LocalDbError("VALIDATION_ERROR", "Only the open credit-card billing cycle can be changed.");
    }
    const duplicate = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM credit_card_cycles
        WHERE user_id = ? AND account_id = ? AND cycle_start_date = ? AND cutoff_date = ?
          AND id != ? AND deleted = 0`,
      userId,
      current.account_id,
      input.cycle_start_date,
      input.cutoff_date,
      id,
    );
    if (duplicate) {
      throw new LocalDbError("VALIDATION_ERROR", "A billing cycle with these dates already exists.");
    }
    const overlappingCycle = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM credit_card_cycles
        WHERE user_id = ? AND account_id = ? AND id != ? AND deleted = 0
          AND cycle_start_date <= ? AND cutoff_date >= ?`,
      userId,
      current.account_id,
      id,
      input.cutoff_date,
      input.cycle_start_date,
    );
    if (overlappingCycle) {
      throw new LocalDbError("VALIDATION_ERROR", "This change would overlap an existing billing cycle.");
    }
    await db.runAsync(
      `UPDATE credit_card_cycles
          SET cycle_start_date = ?, cutoff_date = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND user_id = ? AND deleted = 0`,
      input.cycle_start_date,
      input.cutoff_date,
      ts,
      id,
      userId,
    );
    const operation = await enqueueOperation(db, {
      userId,
      deviceId,
      entity: "credit_card_cycles",
      recordId: id,
      operationType: "update",
      baseVersion: current.version,
      changedFields: ["cycle_start_date", "cutoff_date"],
      payload: { cycle_start_date: input.cycle_start_date, cutoff_date: input.cutoff_date },
      failureMessage: "This credit-card billing cycle could not be saved.",
    });
    const row = await db.getFirstAsync<CycleRow>("SELECT * FROM credit_card_cycles WHERE id = ? AND user_id = ?", id, userId);
    if (!row) throw new LocalDbError("INTERNAL_ERROR", "failed to read updated credit-card cycle");
    result = { cycle: mapCycle(row), operation };
  });
  return result;
}

type CalculatedCycle = Pick<CreditCardCycle, "cycle_start_date" | "cutoff_date">;

// Each card's open cycle on `date`; with overlapping cycles, the one that started last.
async function openCyclesByAccount(db: SQLiteDatabase, userId: string, date: string): Promise<Map<string, CycleRow>> {
  const rows = await db.getAllAsync<CycleRow>(
    `SELECT * FROM credit_card_cycles
      WHERE user_id = ? AND deleted = 0 AND cycle_start_date <= ? AND cutoff_date >= ?
      ORDER BY account_id, cycle_start_date DESC`,
    userId,
    date,
    date,
  );
  const open = new Map<string, CycleRow>();
  for (const row of rows) if (!open.has(row.account_id)) open.set(row.account_id, row);
  return open;
}

// The cycles that bring a card from its last closed cutoff up to the one open on `date`.
function missingCycles(card: CreditCardCycleDefaults, lastClosedCutoff: string | undefined, date: string): CalculatedCycle[] {
  if (!lastClosedCutoff) return [calculateCurrentCreditCardCycle(card, date)];
  const cycles: CalculatedCycle[] = [];
  let cutoff = lastClosedCutoff;
  while (cutoff < date) {
    const next = calculateSuccessorCreditCardCycle(cutoff, card.cutoff_day);
    if (next.cutoff_date <= cutoff) throw new LocalDbError("INTERNAL_ERROR", "credit-card cycle generation did not advance");
    cycles.push(next);
    cutoff = next.cutoff_date;
  }
  return cycles;
}

async function insertGeneratedCycle(db: SQLiteDatabase, userId: string, deviceId: string, accountId: string, cycle: CalculatedCycle): Promise<void> {
  const id = randomUUID();
  const ts = now();
  await db.runAsync(
    `INSERT INTO credit_card_cycles
       (id, user_id, account_id, cycle_start_date, cutoff_date, statement_date, version, deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, 1, 0, ?, ?)`,
    id,
    userId,
    accountId,
    cycle.cycle_start_date,
    cycle.cutoff_date,
    ts,
    ts,
  );
  const payload = cyclePayload({ account_id: accountId, ...cycle });
  await enqueueOperation(db, {
    userId,
    deviceId,
    entity: "credit_card_cycles",
    recordId: id,
    operationType: "create",
    baseVersion: null,
    changedFields: Object.keys(payload),
    payload,
    failureMessage: "This credit-card billing cycle could not be saved.",
  });
}

// Reads every card's open and last closed cycle in two queries, works out the missing months in memory, then
// inserts them, so a card list costs a fixed number of reads rather than several per card and missing month.
export async function ensureCurrentCreditCardCycles(userId: string, deviceId: string, asOfDate?: string): Promise<CreditCardCycle[]> {
  const db = await getDb();
  const date = asOfDate ?? localToday();
  validateIsoDate(date, "asOfDate");
  const cards = await db.getAllAsync<CreditCardCycleDefaults>(
    `SELECT fa.id AS account_id, cc.cutoff_day, cc.billing_cycle_days
     FROM financial_accounts fa
     JOIN credit_card_details cc ON cc.account_id = fa.id AND cc.user_id = fa.user_id AND cc.deleted = 0
     WHERE fa.user_id = ? AND fa.kind = 'credit_card' AND fa.status = 'active' AND fa.deleted = 0`,
    userId,
  );
  if (cards.length === 0) return [];
  let open = new Map<string, CycleRow>();

  await db.withTransactionAsync(async () => {
    open = await openCyclesByAccount(db, userId, date);
    const missing = cards.filter((card) => !open.has(card.account_id));
    if (missing.length === 0) return;
    const closed = await db.getAllAsync<{ account_id: string; cutoff_date: string }>(
      `SELECT account_id, MAX(cutoff_date) AS cutoff_date FROM credit_card_cycles
        WHERE user_id = ? AND deleted = 0 AND cutoff_date < ?
        GROUP BY account_id`,
      userId,
      date,
    );
    const lastClosedCutoff = new Map(closed.map((row) => [row.account_id, row.cutoff_date]));
    for (const card of missing) {
      for (const cycle of missingCycles(card, lastClosedCutoff.get(card.account_id), date)) {
        await insertGeneratedCycle(db, userId, deviceId, card.account_id, cycle);
      }
    }
    open = await openCyclesByAccount(db, userId, date);
  });

  return cards.map((card) => {
    const row = open.get(card.account_id);
    if (!row) throw new LocalDbError("INTERNAL_ERROR", "failed to open the current credit-card cycle");
    return mapCycle(row);
  });
}
