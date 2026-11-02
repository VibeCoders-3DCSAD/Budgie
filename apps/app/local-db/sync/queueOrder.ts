// A row that failed this many times stops retrying on its own and waits in the
// Sync Issues sheet for the user to retry or discard it.
export const MAX_SYNC_ATTEMPTS = 3;

// Every change that has not reached the server yet, including exhausted rows.
export const syncQueueUnsyncedStatusesClause = "status IN ('pending', 'failed')";

// Failed rows stay eligible until they exhaust their attempts, so a transient server
// failure does not strand a create before its dependent updates. Exhausted rows leave
// the selection; otherwise a full batch of them would block every later change.
export const syncQueueEligibleStatusesClause = `${syncQueueUnsyncedStatusesClause} AND attempts < ${MAX_SYNC_ATTEMPTS}`;

// Create owned references before expenses; uncategorized biller payments must
// resolve their scheduled payment on the server before the expense can sync.
export const syncQueueOrderByClause =
  "CASE WHEN entity = 'credit_card_transactions' AND operation_type = 'delete' THEN 0 WHEN entity IN ('credit_card_payments', 'debt_payments', 'credit_card_settlements', 'scheduled_payment_records') AND operation_type = 'delete' THEN 1 WHEN entity IN ('financial_accounts', 'categories', 'subcategories', 'scheduled_payments') AND operation_type = 'create' THEN 2 WHEN entity = 'transactions' THEN 3 WHEN entity = 'credit_card_installments' THEN 4 WHEN entity = 'credit_card_transactions' THEN 5 WHEN entity IN ('credit_card_payments', 'debt_payments', 'credit_card_settlements', 'credit_card_statement_strategies') THEN 6 ELSE 7 END, created_at, rowid";
