BEGIN;

INSERT INTO auth.users (id) VALUES ('7b000000-0000-4000-8000-000000000001');
INSERT INTO public.financial_accounts (id, user_id, name, kind, opening_balance_centavos, current_balance_centavos) VALUES
  ('7b000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-000000000001', 'Wallet', 'cash', 100000, 100000),
  ('7b000000-0000-4000-8000-0000000000a2', '7b000000-0000-4000-8000-000000000001', 'Bank', 'bank', 500000, 500000),
  ('7b000000-0000-4000-8000-0000000000a3', '7b000000-0000-4000-8000-000000000001', 'Card', 'credit_card', 0, 0);
INSERT INTO public.categories (id, user_id, slug, label, description, is_system) VALUES
  ('7b000000-0000-4000-8000-0000000000d1', '7b000000-0000-4000-8000-000000000001', 'food-balance-test', 'Food balance test', 'Food', false);
INSERT INTO public.subcategories (id, user_id, category_id, kind, slug, label, description, is_system) VALUES
  ('7b000000-0000-4000-8000-0000000000e1', '7b000000-0000-4000-8000-000000000001', '7b000000-0000-4000-8000-0000000000d1', 'expense', 'groceries-balance-test', 'Groceries balance test', 'Groceries', false),
  ('7b000000-0000-4000-8000-0000000000e2', '7b000000-0000-4000-8000-000000000001', NULL, 'income', 'salary-balance-test', 'Salary balance test', 'Salary', false);

SELECT set_config('request.jwt.claim.sub', '7b000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  v_wallet uuid := '7b000000-0000-4000-8000-0000000000a1';
  v_bank uuid := '7b000000-0000-4000-8000-0000000000a2';
  v_card uuid := '7b000000-0000-4000-8000-0000000000a3';
  v_expense_sub uuid := '7b000000-0000-4000-8000-0000000000e1';
  v_income_sub uuid := '7b000000-0000-4000-8000-0000000000e2';
  v_expense uuid := '7b000000-0000-4000-8000-0000000000f1';
  v_income uuid := '7b000000-0000-4000-8000-0000000000f2';
  v_transfer uuid := '7b000000-0000-4000-8000-0000000000f3';
  v_debt uuid := '7b000000-0000-4000-8000-0000000000f4';
  v_result record;
  v_wallet_version integer;
BEGIN
  -- Reconciliation is deferred to commit; force pending events to run now.
  SET CONSTRAINTS public.transactions_reconcile_account_balances IMMEDIATE;
  SET CONSTRAINTS public.transactions_reconcile_account_balances DEFERRED;
  SELECT version INTO v_wallet_version FROM public.financial_accounts WHERE id = v_wallet;

  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'device-1', 'transactions', v_expense, 'create', NULL, '{}',
    jsonb_build_object('transaction_type', 'expense', 'transaction_date', '2026-10-18', 'amount_centavos', 12345,
      'subcategory_id', v_expense_sub, 'source_account_id', v_wallet, 'client_mutation_id', 'balance-test-expense'));
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'expense create must apply: %', v_result; END IF;
  SET CONSTRAINTS public.transactions_reconcile_account_balances IMMEDIATE;
  SET CONSTRAINTS public.transactions_reconcile_account_balances DEFERRED;
  IF (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = v_wallet) <> 87655 THEN
    RAISE EXCEPTION 'expense create must debit the wallet: %', (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = v_wallet);
  END IF;
  IF (SELECT version FROM public.financial_accounts WHERE id = v_wallet) <> v_wallet_version + 1 THEN
    RAISE EXCEPTION 'a balance change must bump the account version';
  END IF;

  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'device-1', 'transactions', v_expense, 'update', 1, '{amount_centavos}',
    jsonb_build_object('amount_centavos', 20000));
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'expense edit must apply: %', v_result; END IF;
  SET CONSTRAINTS public.transactions_reconcile_account_balances IMMEDIATE;
  SET CONSTRAINTS public.transactions_reconcile_account_balances DEFERRED;
  IF (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = v_wallet) <> 80000 THEN
    RAISE EXCEPTION 'expense amount edit must rebalance the wallet';
  END IF;

  SELECT version INTO v_wallet_version FROM public.financial_accounts WHERE id = v_wallet;
  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'device-1', 'transactions', v_expense, 'update', 2, '{notes}',
    jsonb_build_object('notes', 'no balance change'));
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'notes edit must apply: %', v_result; END IF;
  SET CONSTRAINTS public.transactions_reconcile_account_balances IMMEDIATE;
  SET CONSTRAINTS public.transactions_reconcile_account_balances DEFERRED;
  IF (SELECT version FROM public.financial_accounts WHERE id = v_wallet) <> v_wallet_version THEN
    RAISE EXCEPTION 'an edit that keeps the balance must not bump the account version';
  END IF;

  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'device-1', 'transactions', v_income, 'create', NULL, '{}',
    jsonb_build_object('transaction_type', 'income', 'transaction_date', '2026-10-18', 'amount_centavos', 300000,
      'subcategory_id', v_income_sub, 'destination_account_id', v_bank, 'client_mutation_id', 'balance-test-income'));
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'income create must apply: %', v_result; END IF;

  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'device-1', 'transactions', v_transfer, 'create', NULL, '{}',
    jsonb_build_object('transaction_type', 'transfer', 'transaction_date', '2026-10-18', 'amount_centavos', 50000,
      'source_account_id', v_bank, 'destination_account_id', v_wallet, 'client_mutation_id', 'balance-test-transfer'));
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'transfer create must apply: %', v_result; END IF;
  SET CONSTRAINTS public.transactions_reconcile_account_balances IMMEDIATE;
  SET CONSTRAINTS public.transactions_reconcile_account_balances DEFERRED;
  IF (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = v_bank) <> 750000
     OR (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = v_wallet) <> 130000 THEN
    RAISE EXCEPTION 'income and transfer must move both accounts';
  END IF;

  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'device-1', 'transactions', v_transfer, 'update', 1, '{destination_account_id}',
    jsonb_build_object('destination_account_id', v_card));
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'transfer edit must apply: %', v_result; END IF;
  SET CONSTRAINTS public.transactions_reconcile_account_balances IMMEDIATE;
  SET CONSTRAINTS public.transactions_reconcile_account_balances DEFERRED;
  IF (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = v_wallet) <> 80000
     OR (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = v_card) <> 0 THEN
    RAISE EXCEPTION 'moving a transfer must rebalance the old destination and leave credit cards alone';
  END IF;

  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'device-1', 'transactions', v_expense, 'delete', 3, '{}', '{}'::jsonb);
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'expense delete must apply: %', v_result; END IF;
  SET CONSTRAINTS public.transactions_reconcile_account_balances IMMEDIATE;
  SET CONSTRAINTS public.transactions_reconcile_account_balances DEFERRED;
  IF (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = v_wallet) <> 100000 THEN
    RAISE EXCEPTION 'expense delete must credit the wallet back';
  END IF;

  -- ledger_core debits debt payments itself; the deferred reconcile must not debit them again.
  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'device-1', 'transactions', v_debt, 'create', NULL, '{}',
    jsonb_build_object('transaction_type', 'expense', 'transaction_date', '2026-10-18', 'amount_centavos', 10000,
      'subcategory_id', v_expense_sub, 'source_account_id', v_wallet, 'client_mutation_id', 'debt-payment:balance-test'));
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'debt payment must apply: %', v_result; END IF;
  SET CONSTRAINTS public.transactions_reconcile_account_balances IMMEDIATE;
  SET CONSTRAINTS public.transactions_reconcile_account_balances DEFERRED;
  IF (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = v_wallet) <> 90000 THEN
    RAISE EXCEPTION 'a debt payment must be debited exactly once: %', (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = v_wallet);
  END IF;
END;
$$;

-- Writes that bypass the sync RPC are reconciled too.
SET LOCAL ROLE authenticated;
INSERT INTO public.transactions (id, user_id, transaction_type, transaction_date, amount_centavos, source_account_id, subcategory_id)
VALUES ('7b000000-0000-4000-8000-0000000000f5', '7b000000-0000-4000-8000-000000000001', 'expense', '2026-10-18', 5000,
        '7b000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-0000000000e1');
SET CONSTRAINTS public.transactions_reconcile_account_balances IMMEDIATE;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = '7b000000-0000-4000-8000-0000000000a1') <> 85000 THEN
    RAISE EXCEPTION 'a direct authenticated insert must reconcile the balance';
  END IF;
END;
$$;

-- Several writes to one account record it once, and the first deferred event reconciles it against
-- the final ledger and clears the set, so the remaining events for those writes have nothing to do.
SET CONSTRAINTS public.transactions_reconcile_account_balances DEFERRED;
INSERT INTO public.transactions (id, user_id, transaction_type, transaction_date, amount_centavos, source_account_id, subcategory_id)
SELECT gen_random_uuid(), '7b000000-0000-4000-8000-000000000001', 'expense', '2026-10-19', 1000,
       '7b000000-0000-4000-8000-0000000000a1', '7b000000-0000-4000-8000-0000000000e1'
  FROM generate_series(1, 5);
UPDATE public.transactions SET amount_centavos = 2000 WHERE id = '7b000000-0000-4000-8000-0000000000f5';

DO $$
BEGIN
  IF current_setting('odin.unreconciled_account_ids', true)::uuid[] <> ARRAY['7b000000-0000-4000-8000-0000000000a1']::uuid[] THEN
    RAISE EXCEPTION 'six writes to one account must record it once: %', current_setting('odin.unreconciled_account_ids', true);
  END IF;
END;
$$;

SET CONSTRAINTS public.transactions_reconcile_account_balances IMMEDIATE;

DO $$
BEGIN
  -- 85000, five 1000 expenses, and f5 lowered from 5000 to 2000.
  IF (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = '7b000000-0000-4000-8000-0000000000a1') <> 83000 THEN
    RAISE EXCEPTION 'coalesced reconciliation must reach the final ledger balance: %',
      (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = '7b000000-0000-4000-8000-0000000000a1');
  END IF;
  IF current_setting('odin.unreconciled_account_ids', true) <> '' THEN
    RAISE EXCEPTION 'reconciliation must clear the recorded accounts';
  END IF;
END;
$$;

-- A write after an early firing records its account again and is reconciled at the next firing.
SET CONSTRAINTS public.transactions_reconcile_account_balances DEFERRED;
UPDATE public.transactions SET deleted = true WHERE id = '7b000000-0000-4000-8000-0000000000f5';
SET CONSTRAINTS public.transactions_reconcile_account_balances IMMEDIATE;

DO $$
BEGIN
  IF (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = '7b000000-0000-4000-8000-0000000000a1') <> 85000 THEN
    RAISE EXCEPTION 'a write after an early reconciliation must still be reconciled: %',
      (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = '7b000000-0000-4000-8000-0000000000a1');
  END IF;
END;
$$;

ROLLBACK;
