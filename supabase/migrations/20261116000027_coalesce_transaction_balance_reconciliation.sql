-- Reconcile each affected account once per transaction instead of once per changed row.
--
-- 20261114000000 queues one deferred event per transaction row, and every event re-sums the
-- account's whole posted ledger. A catch-up that inserts N transactions for one account therefore
-- re-summed the same final ledger N times at commit.
--
-- Now an immediate row trigger only records the affected account ids in a transaction-local
-- setting. The first deferred event to fire reconciles every recorded account in one locked
-- statement and clears the set; later events find it empty and return. A write after an early
-- firing (SET CONSTRAINTS ... IMMEDIATE) records its accounts again, so its own deferred event
-- reconciles them. The setting is transaction-local: it resets at commit or rollback, and a
-- rolled-back savepoint restores it together with the trigger events it discards.

CREATE OR REPLACE FUNCTION private.record_transaction_balance_accounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_account_ids uuid[] := COALESCE(
    NULLIF(current_setting('odin.unreconciled_account_ids', true), '')::uuid[], ARRAY[]::uuid[]);
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_account_ids := v_account_ids || OLD.source_account_id || OLD.destination_account_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_account_ids := v_account_ids || NEW.source_account_id || NEW.destination_account_id;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT account_id), ARRAY[]::uuid[])
    INTO v_account_ids
    FROM unnest(v_account_ids) AS account_id
   WHERE account_id IS NOT NULL;

  PERFORM set_config('odin.unreconciled_account_ids', v_account_ids::text, true);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.reconcile_transaction_account_balances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_ids uuid[] := NULLIF(current_setting('odin.unreconciled_account_ids', true), '')::uuid[];
BEGIN
  IF v_account_ids IS NULL OR cardinality(v_account_ids) = 0 THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('odin.unreconciled_account_ids', '', true);
  PERFORM private.reconcile_financial_account_balances(v_account_ids);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.record_transaction_balance_accounts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.reconcile_transaction_account_balances() FROM PUBLIC, anon, authenticated;

-- Same-event AFTER triggers fire in name order. This name sorts before
-- transactions_reconcile_account_balances, so the accounts are recorded first even when that
-- constraint trigger is set IMMEDIATE.
DROP TRIGGER IF EXISTS transactions_balance_account_tracking ON public.transactions;
CREATE TRIGGER transactions_balance_account_tracking
  AFTER INSERT OR DELETE OR UPDATE OF
    amount_centavos, transaction_type, status, deleted,
    source_account_id, destination_account_id, user_id
  ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION private.record_transaction_balance_accounts();
