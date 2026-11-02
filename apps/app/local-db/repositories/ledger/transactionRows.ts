import * as SQLite from "expo-sqlite";
import type { CreateExpenseInput, CreateIncomeInput, CreateTransferInput, ExpenseInsertInput, Transaction } from "./transactionTypes";

export type TransactionRow = {
  id: string;
  user_id: string;
  transaction_type: string;
  status: string;
  entry_source: string;
  transaction_date: string;
  posted_at: string | null;
  credit_card_posting_date: string | null;
  amount_centavos: number;
  subcategory_id: string | null;
  source_account_id: string | null;
  destination_account_id: string | null;
  destination_savings_goal_id?: string | null;
  source_savings_goal_id?: string | null;
  recurring_template_id: string | null;
  merchant_name: string | null;
  counterparty_name: string | null;
  notes: string | null;
  client_mutation_id: string | null;
  metadata: string;
  version: number;
  deleted: number;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
};

export function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    transaction_type: row.transaction_type,
    status: row.status,
    entry_source: row.entry_source,
    transaction_date: row.transaction_date,
    posted_at: row.posted_at,
    credit_card_posting_date: row.credit_card_posting_date,
    amount_centavos: row.amount_centavos,
    subcategory_id: row.subcategory_id,
    source_account_id: row.source_account_id,
    destination_account_id: row.destination_account_id,
    destination_savings_goal_id: row.destination_savings_goal_id ?? null,
    source_savings_goal_id: row.source_savings_goal_id ?? null,
    recurring_template_id: row.recurring_template_id,
    merchant_name: row.merchant_name,
    counterparty_name: row.counterparty_name,
    notes: row.notes,
    client_mutation_id: row.client_mutation_id,
  };
}

export function buildTransactionInsert(
  id: string,
  userId: string,
  transactionType: string,
  input: CreateIncomeInput | ExpenseInsertInput | CreateTransferInput,
  ts: string,
): { sql: string; params: SQLite.SQLiteBindValue[] } {
  const sourceAccountId = transactionType === "expense" || transactionType === "transfer" ? (input as CreateExpenseInput | CreateTransferInput).source_account_id : null;
  const destinationAccountId = transactionType === "income" || transactionType === "transfer" ? (input as CreateIncomeInput | CreateTransferInput).destination_account_id : null;
  const subcategoryId = transactionType === "income" || transactionType === "expense" ? (input as CreateIncomeInput | ExpenseInsertInput).subcategory_id : null;
  const merchantName = "merchant_name" in input ? input.merchant_name ?? null : null;
  const counterpartyName = "counterparty_name" in input ? input.counterparty_name ?? null : null;
  const notes = input.notes ?? null;
  const postingDate = transactionType === "expense" && "credit_card_posting_date" in input
    ? (input as ExpenseInsertInput).credit_card_posting_date ?? null
    : null;

  return {
    sql: `INSERT INTO transactions
       (id, user_id, transaction_type, status, entry_source, transaction_date, posted_at, credit_card_posting_date,
        amount_centavos, subcategory_id, source_account_id, destination_account_id, source_savings_goal_id, destination_savings_goal_id,
       recurring_template_id, merchant_name, counterparty_name, notes,
        client_mutation_id, metadata, version, deleted, created_at, updated_at)
       VALUES (?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 1, 0, ?, ?)`,
    params: [
      id, userId, transactionType, "entry_source" in input ? input.entry_source ?? "manual" : "manual", input.transaction_date, ts, postingDate,
       input.amount_centavos, subcategoryId, sourceAccountId, destinationAccountId,
       "source_savings_goal_id" in input ? input.source_savings_goal_id ?? null : null,
       "destination_savings_goal_id" in input ? input.destination_savings_goal_id ?? null : null,
       null, merchantName, counterpartyName, notes,
       "client_mutation_id" in input ? input.client_mutation_id ?? null : null, ts, ts,
    ],
  };
}
