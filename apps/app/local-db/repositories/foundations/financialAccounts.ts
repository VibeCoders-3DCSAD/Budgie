import * as SQLite from "expo-sqlite";
import { enqueueOperation, LocalDbError } from "../../helpers";
import { randomUUID } from "../../uuid";
import type { SyncOperation } from "../../types";
import { getDb, now, boolToInt } from "../helpers/db";
import {
  enqueueCreditCardDetailsOperation,
  upsertCreditCardDetails,
  validateCreditCardDetails,
} from "./creditCardDetails";
import {
  mapAccount,
  VALID_ACCOUNT_KINDS,
  VALID_ACCOUNT_STATUSES,
  type CreateFinancialAccountInput,
  type FinancialAccount,
  type FinancialAccountKind,
  type FinancialAccountRow,
  type FinancialAccountStatus,
  type UpdateFinancialAccountInput,
} from "./financialAccountModel";

// ---------------------------------------------------------------------------
// Financial Accounts
// ---------------------------------------------------------------------------

// Every account column plus its credit-card, repayment and savings details.
const ACCOUNT_WITH_DETAILS_SELECT = `
  SELECT fa.*, cc.credit_limit_centavos AS cc_credit_limit_centavos,
         cc.available_credit_centavos AS cc_available_credit_centavos,
         cc.reconciled_available_credit_centavos AS cc_reconciled_available_credit_centavos,
         cc.pre_reconciliation_available_credit_centavos AS cc_pre_reconciliation_available_credit_centavos,
         cc.available_credit_reconciled_at AS cc_available_credit_reconciled_at,
         cc.issuer AS cc_issuer,
         cc.notes AS cc_notes,
         cc.billing_cycle_days AS cc_billing_cycle_days,
         cc.cutoff_day AS cc_cutoff_day,
         cc.statement_day AS cc_statement_day,
         cc.alert_threshold_percent AS cc_alert_threshold_percent,
         cc.allows_extra_payments AS cc_allows_extra_payments,
         preference.strategy AS cc_repayment_strategy,
         preference.custom_amount_centavos AS cc_repayment_custom_amount_centavos,
         preference.percentage_bps AS cc_repayment_percentage_bps,
         sa.account_type AS sa_account_type
    FROM financial_accounts fa
    LEFT JOIN credit_card_details cc
      ON cc.account_id = fa.id AND cc.user_id = fa.user_id AND cc.deleted = 0
    LEFT JOIN credit_card_repayment_preferences preference
      ON preference.account_id = fa.id AND preference.user_id = fa.user_id AND preference.deleted = 0
    LEFT JOIN savings_account_details sa
      ON sa.account_id = fa.id AND sa.user_id = fa.user_id AND sa.deleted = 0`;

export type FinancialAccountFilter = { status?: FinancialAccountStatus; kind?: FinancialAccountKind };

/** Accounts with all their details. Pass a filter so the database, not the caller, drops what a screen never shows. */
export async function listFinancialAccounts(userId: string, filter: FinancialAccountFilter = {}): Promise<FinancialAccount[]> {
  const conditions = ["fa.user_id = ?", "fa.deleted = 0"];
  const params: SQLite.SQLiteBindValue[] = [userId];
  if (filter.status) { conditions.push("fa.status = ?"); params.push(filter.status); }
  if (filter.kind) { conditions.push("fa.kind = ?"); params.push(filter.kind); }
  const db = await getDb();
  const rows = await db.getAllAsync<FinancialAccountRow>(
    `${ACCOUNT_WITH_DETAILS_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY fa.sort_order`,
    ...params,
  );
  return rows.map(mapAccount);
}

export type AccountOption = Pick<FinancialAccount, "id" | "name" | "kind" | "currentBalanceCentavos">;

/** Active accounts for a picker: only the fields a picker shows, without the detail joins. */
export async function listAccountOptions(userId: string): Promise<AccountOption[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; name: string; kind: FinancialAccountKind; current_balance_centavos: number }>(
    `SELECT id, name, kind, current_balance_centavos FROM financial_accounts
      WHERE user_id = ? AND deleted = 0 AND status = 'active'
      ORDER BY sort_order`,
    userId,
  );
  return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, currentBalanceCentavos: row.current_balance_centavos }));
}

export async function getFinancialAccount(
  userId: string,
  id: string,
): Promise<FinancialAccount | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<FinancialAccountRow>(
    `${ACCOUNT_WITH_DETAILS_SELECT} WHERE fa.user_id = ? AND fa.id = ? AND fa.deleted = 0`,
    userId,
    id,
  );
  return row ? mapAccount(row) : null;
}

export async function createFinancialAccount(
  userId: string,
  deviceId: string,
  input: CreateFinancialAccountInput,
): Promise<{ account: FinancialAccount; operation: SyncOperation }> {
  if (!input.name || !input.kind) {
    throw new LocalDbError("VALIDATION_ERROR", "name and kind are required");
  }
  if (!VALID_ACCOUNT_KINDS.includes(input.kind)) {
    throw new LocalDbError("VALIDATION_ERROR", `kind must be one of: ${VALID_ACCOUNT_KINDS.join(", ")}`);
  }
  if (input.kind === "credit_card") {
    validateCreditCardDetails(input.creditCardDetails ?? {}, true);
  }
  if (input.openingBalanceCentavos != null && (typeof input.openingBalanceCentavos !== "number" || !Number.isFinite(input.openingBalanceCentavos) || !Number.isInteger(input.openingBalanceCentavos))) {
    throw new LocalDbError("VALIDATION_ERROR", "openingBalanceCentavos must be a finite integer");
  }

  const db = await getDb();
  const id = randomUUID();
  const ts = now();
  const payload: Record<string, unknown> = {
    name: input.name,
    kind: input.kind,
    opening_balance_centavos: input.openingBalanceCentavos ?? 0,
    include_in_dashboard_balance: input.includeInDashboardBalance ?? true,
    institution_name: input.institutionName ?? null,
    opened_on: input.openedOn ?? null,
    sort_order: input.sortOrder ?? 0,
  };

  let result: { account: FinancialAccount; operation: SyncOperation };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO financial_accounts
        (id, user_id, name, kind, status, opening_balance_centavos, current_balance_centavos,
         include_in_dashboard_balance, institution_name, opened_on,
         sort_order, metadata, version, deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, '{}', 1, 0, ?, ?)`,
      id,
      userId,
      input.name,
      input.kind,
      input.openingBalanceCentavos ?? 0,
      input.openingBalanceCentavos ?? 0,
      boolToInt(input.includeInDashboardBalance ?? true),
      input.institutionName ?? null,
      input.openedOn ?? null,
      input.sortOrder ?? 0,
      ts,
      ts,
    );

    if (input.kind === "credit_card") {
      await upsertCreditCardDetails(db, userId, id, input.creditCardDetails!, ts);
    }

    const operation = await enqueueOperation(db, {
      userId,
      deviceId,
      entity: "financial_accounts",
      recordId: id,
      operationType: "create",
      baseVersion: null,
      changedFields: Object.keys(payload),
      payload,
      failureMessage: `This financial account "${input.name}" could not be created.`,
    });

    if (input.kind === "credit_card") {
      await enqueueCreditCardDetailsOperation(db, userId, deviceId, id, "create", null);
    }

    const row = await db.getFirstAsync<FinancialAccountRow>(
      "SELECT * FROM financial_accounts WHERE id = ?",
      id,
    );
    if (!row) throw new LocalDbError("INTERNAL_ERROR", "failed to read created account");
    result = { account: mapAccount(row), operation };
  });

  return result!;
}

export async function updateFinancialAccount(
  userId: string,
  deviceId: string,
  id: string,
  input: UpdateFinancialAccountInput,
): Promise<{ account: FinancialAccount; operation: SyncOperation }> {
  if (input.status && !VALID_ACCOUNT_STATUSES.includes(input.status)) {
    throw new LocalDbError("VALIDATION_ERROR", "status must be active or archived");
  }
  if (input.kind && !VALID_ACCOUNT_KINDS.includes(input.kind)) {
    throw new LocalDbError("VALIDATION_ERROR", `kind must be one of: ${VALID_ACCOUNT_KINDS.join(", ")}`);
  }
  if (input.kind === "credit_card" && !input.creditCardDetails) {
    throw new LocalDbError("VALIDATION_ERROR", "creditCardDetails is required when switching to a credit card account");
  }
  if (input.creditCardDetails) {
    validateCreditCardDetails(input.creditCardDetails, true);
  }

  const db = await getDb();
  const ts = now();
  const changedFields: string[] = [];
  const payload: Record<string, unknown> = {};

  if (input.name !== undefined) { changedFields.push("name"); payload.name = input.name; }
  if (input.kind !== undefined) { changedFields.push("kind"); payload.kind = input.kind; }
  if (input.status !== undefined) { changedFields.push("status"); payload.status = input.status; }
  if (input.openingBalanceCentavos !== undefined) { changedFields.push("opening_balance_centavos"); payload.opening_balance_centavos = input.openingBalanceCentavos; }
  if (input.currentBalanceCentavos !== undefined) { changedFields.push("current_balance_centavos"); payload.current_balance_centavos = input.currentBalanceCentavos; }
  if (input.includeInDashboardBalance !== undefined) { changedFields.push("include_in_dashboard_balance"); payload.include_in_dashboard_balance = input.includeInDashboardBalance; }
  if (input.institutionName !== undefined) { changedFields.push("institution_name"); payload.institution_name = input.institutionName; }
  if (input.openedOn !== undefined) { changedFields.push("opened_on"); payload.opened_on = input.openedOn; }
  if (input.archivedAt !== undefined) { changedFields.push("archived_at"); payload.archived_at = input.archivedAt; }
  if (input.sortOrder !== undefined) { changedFields.push("sort_order"); payload.sort_order = input.sortOrder; }

    if (changedFields.length === 0 && !input.creditCardDetails) {
    const existing = await getFinancialAccount(userId, id);
    if (!existing) throw new LocalDbError("NOT_FOUND", "account not found");
    return { account: existing, operation: null as unknown as SyncOperation };
  }

  let result: { account: FinancialAccount; operation: SyncOperation };

  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<FinancialAccountRow>(
      "SELECT * FROM financial_accounts WHERE user_id = ? AND id = ? AND deleted = 0",
      userId,
      id,
    );
    if (!existing) throw new LocalDbError("NOT_FOUND", "account not found");
    if (input.kind === existing.kind) {
      changedFields.splice(changedFields.indexOf("kind"), 1);
      delete payload.kind;
    }
    if (changedFields.length === 0 && !input.creditCardDetails) {
      result = { account: mapAccount(existing), operation: null as unknown as SyncOperation };
      return;
    }
    const existingCardDetails = input.creditCardDetails
      ? await db.getFirstAsync<{ version: number }>(
          "SELECT version FROM credit_card_details WHERE account_id = ? AND user_id = ? AND deleted = 0",
          id,
          userId,
        )
      : null;

    const setClauses: string[] = [];
    const params: SQLite.SQLiteBindValue[] = [];

    if (input.name !== undefined) { setClauses.push("name = ?"); params.push(input.name); }
    if (input.kind !== undefined) { setClauses.push("kind = ?"); params.push(input.kind); }
    if (input.status !== undefined) { setClauses.push("status = ?"); params.push(input.status); }
    if (input.openingBalanceCentavos !== undefined) { setClauses.push("opening_balance_centavos = ?"); params.push(input.openingBalanceCentavos); }
    if (input.currentBalanceCentavos !== undefined) { setClauses.push("current_balance_centavos = ?"); params.push(input.currentBalanceCentavos); }
    if (input.includeInDashboardBalance !== undefined) { setClauses.push("include_in_dashboard_balance = ?"); params.push(boolToInt(input.includeInDashboardBalance)); }
    if (input.institutionName !== undefined) { setClauses.push("institution_name = ?"); params.push(input.institutionName); }
    if (input.openedOn !== undefined) { setClauses.push("opened_on = ?"); params.push(input.openedOn); }
    if (input.archivedAt !== undefined) { setClauses.push("archived_at = ?"); params.push(input.archivedAt); }
    if (input.sortOrder !== undefined) { setClauses.push("sort_order = ?"); params.push(input.sortOrder); }

    setClauses.push("updated_at = ?"); params.push(ts);
    setClauses.push("version = version + 1");
    params.push(id, userId);

    await db.runAsync(
      `UPDATE financial_accounts SET ${setClauses.join(", ")} WHERE id = ? AND user_id = ?`,
      ...params,
    );

    const effectiveKind = input.kind ?? existing.kind;
    if (effectiveKind === "credit_card" && input.creditCardDetails) {
      await upsertCreditCardDetails(db, userId, id, input.creditCardDetails, ts);
      await enqueueCreditCardDetailsOperation(db, userId, deviceId, id, existingCardDetails ? "update" : "create", existingCardDetails?.version ?? null);
    } else if (effectiveKind !== "credit_card") {
      await db.runAsync(
        "UPDATE credit_card_details SET deleted = 1, updated_at = ?, version = version + 1 WHERE account_id = ? AND user_id = ? AND deleted = 0",
        ts,
        id,
        userId,
      );
    }

    const operation = await enqueueOperation(db, {
      userId,
      deviceId,
      entity: "financial_accounts",
      recordId: id,
      operationType: "update",
      baseVersion: existing.version,
      changedFields,
      payload,
      failureMessage: `This financial account "${existing.name}" could not be updated.`,
    });

    const row = await db.getFirstAsync<FinancialAccountRow>(
      "SELECT * FROM financial_accounts WHERE id = ?",
      id,
    );
    if (!row) throw new LocalDbError("INTERNAL_ERROR", "failed to read updated account");
    result = { account: mapAccount(row), operation };
  });

  return result!;
}

export async function deleteFinancialAccount(
  userId: string,
  deviceId: string,
  id: string,
): Promise<{ account: FinancialAccount; operation: SyncOperation }> {
  const db = await getDb();
  const ts = now();

  let result: { account: FinancialAccount; operation: SyncOperation };

  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<FinancialAccountRow>(
      "SELECT * FROM financial_accounts WHERE user_id = ? AND id = ? AND deleted = 0",
      userId,
      id,
    );
    if (!existing) throw new LocalDbError("NOT_FOUND", "account not found");

    await db.runAsync(
      `UPDATE financial_accounts
       SET deleted = 1, status = 'deleted', deleted_at = ?, updated_at = ?, version = version + 1
       WHERE id = ? AND user_id = ?`,
      ts,
      ts,
      id,
      userId,
    );

    await db.runAsync(
      "UPDATE credit_card_details SET deleted = 1, updated_at = ?, version = version + 1 WHERE account_id = ? AND user_id = ? AND deleted = 0",
      ts,
      id,
      userId,
    );
    if (existing.kind === "credit_card") {
      await enqueueCreditCardDetailsOperation(db, userId, deviceId, id, "delete", null);
    }
    if (existing.kind === "savings") {
      const savingsDetails = await db.getFirstAsync<{ version: number }>(
        "SELECT version FROM savings_account_details WHERE account_id = ? AND user_id = ? AND deleted = 0",
        id,
        userId,
      );
      if (savingsDetails) {
        await db.runAsync(
          "UPDATE savings_account_details SET deleted = 1, updated_at = ?, version = version + 1 WHERE account_id = ? AND user_id = ?",
          ts,
          id,
          userId,
        );
        await enqueueOperation(db, {
          userId,
          deviceId,
          entity: "savings_account_details",
          recordId: id,
          operationType: "delete",
          baseVersion: savingsDetails.version,
          changedFields: [],
          payload: {},
          failureMessage: "This savings-account information could not be synchronized.",
        });
      }
    }

    const operation = await enqueueOperation(db, {
      userId,
      deviceId,
      entity: "financial_accounts",
      recordId: id,
      operationType: "delete",
      baseVersion: existing.version,
      changedFields: [],
      payload: {},
      failureMessage: `This financial account "${existing.name}" could not be deleted.`,
    });

    const row = await db.getFirstAsync<FinancialAccountRow>(
      "SELECT * FROM financial_accounts WHERE id = ?",
      id,
    );
    if (!row) throw new LocalDbError("INTERNAL_ERROR", "failed to read deleted account");
    result = { account: mapAccount(row), operation };
  });

  return result!;
}
