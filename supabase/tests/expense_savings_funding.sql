BEGIN;
INSERT INTO auth.users (id) VALUES ('7e000000-0000-4000-8000-000000000001'), ('7e000000-0000-4000-8000-000000000002');
INSERT INTO public.financial_accounts(id, user_id, name, kind, opening_balance_centavos, current_balance_centavos) VALUES
  ('7e000000-0000-4000-8000-0000000000a1', '7e000000-0000-4000-8000-000000000001', 'Funding bank', 'bank', 2000000, 2000000),
  ('7e000000-0000-4000-8000-0000000000a2', '7e000000-0000-4000-8000-000000000002', 'Foreign bank', 'bank', 2000000, 2000000);
INSERT INTO public.categories(id, user_id, slug, label, description, is_system) VALUES
  ('7e000000-0000-4000-8000-0000000000b1', '7e000000-0000-4000-8000-000000000001', 'funding_test', 'Funding test', 'Test', false);
INSERT INTO public.subcategories(id, user_id, category_id, slug, kind, label, description, is_system) VALUES
  ('7e000000-0000-4000-8000-0000000000b2', '7e000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-0000000000b1', 'funding_test_item', 'expense', 'Funding expense', 'Test', false);
INSERT INTO public.savings_goals(id, user_id, name, is_emergency_fund, target_amount_centavos, starting_amount_centavos, linked_account_id) VALUES
  ('7e000000-0000-4000-8000-0000000000c1', '7e000000-0000-4000-8000-000000000001', 'Emergency', true, 2000000, 1000000, '7e000000-0000-4000-8000-0000000000a1'),
  ('7e000000-0000-4000-8000-0000000000c2', '7e000000-0000-4000-8000-000000000001', 'Travel', false, 1000000, 500000, '7e000000-0000-4000-8000-0000000000a1'),
  ('7e000000-0000-4000-8000-0000000000c3', '7e000000-0000-4000-8000-000000000002', 'Foreign', false, 1000000, 500000, '7e000000-0000-4000-8000-0000000000a2');
SELECT set_config('request.jwt.claim.sub', '7e000000-0000-4000-8000-000000000001', true);
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
  v_result record;
  v_payload jsonb := '{"transaction_type":"expense", "transaction_date":"2026-10-21", "amount_centavos":700000, "source_account_id":"7e000000-0000-4000-8000-0000000000a1", "subcategory_id":"7e000000-0000-4000-8000-0000000000b2"}';
  v_split jsonb := '[{"id":"7e000000-0000-4000-8000-0000000000d1", "savings_goal_id":"7e000000-0000-4000-8000-0000000000c1", "amount_centavos":120000}, {"id":"7e000000-0000-4000-8000-0000000000d2", "savings_goal_id":"7e000000-0000-4000-8000-0000000000c2", "amount_centavos":80000}]';
  v_bad jsonb;
  v_balance bigint;
BEGIN
  -- Missing, wrong-total, foreign-goal, duplicate-goal, and oversized splits fail atomically.
  FOR v_bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    '[]'::jsonb,
    jsonb_set(v_split, '{0,amount_centavos}', '120001'),
    jsonb_set(v_split, '{0,savings_goal_id}', '"7e000000-0000-4000-8000-0000000000c3"'),
    jsonb_set(v_split, '{1,savings_goal_id}', '"7e000000-0000-4000-8000-0000000000c1"'),
    jsonb_set(v_split, '{0,amount_centavos}', '1000001')
  )) LOOP
    BEGIN
      PERFORM public.apply_sync_operation(gen_random_uuid(), 'funding-test', 'transactions', gen_random_uuid(), 'create', NULL, ARRAY[]::text[], v_payload || jsonb_build_object('savings_goal_withdrawals', v_bad));
      RAISE EXCEPTION 'invalid funding accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT IN ('choose savings goals covering the amount beyond unallocated money', 'withdrawal exceeds linked goal savings', 'invalid savings withdrawal split') THEN RAISE; END IF;
    END;
  END LOOP;
  IF EXISTS (SELECT 1 FROM transactions WHERE user_id = auth.uid()) OR EXISTS (SELECT 1 FROM savings_goal_activities WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'invalid split leaked writes'; END IF;

  -- Automatic and direct writers cannot spend reserved money without confirmation.
  BEGIN
    INSERT INTO public.transactions(user_id, transaction_type, status, entry_source, transaction_date, amount_centavos, source_account_id, subcategory_id)
    VALUES (auth.uid(), 'expense', 'posted', 'manual', '2026-10-21', 700000, '7e000000-0000-4000-8000-0000000000a1', '7e000000-0000-4000-8000-0000000000b2');
    RAISE EXCEPTION 'direct writer bypassed savings funding';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'confirm savings goal withdrawals before recording this expense' THEN RAISE; END IF;
  END;
  -- Explicit split creates both activities in the same operation.
  SELECT * INTO v_result FROM public.apply_sync_operation('7e000000-0000-4000-8000-0000000000f1', 'funding-test', 'transactions', '7e000000-0000-4000-8000-0000000000e1', 'create', NULL, ARRAY[]::text[], v_payload || jsonb_build_object('savings_goal_withdrawals', v_split));
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'create failed: %', v_result; END IF;
  IF (SELECT count(*) FROM savings_goal_activities WHERE user_id = auth.uid() AND deleted = false) <> 2 THEN RAISE EXCEPTION 'split was not persisted'; END IF;
  SELECT current_balance_centavos INTO v_balance FROM financial_accounts WHERE id = '7e000000-0000-4000-8000-0000000000a1';
  IF v_balance <> 1300000 THEN RAISE EXCEPTION 'incorrect account balance: %', v_balance; END IF;
  SELECT * INTO v_result FROM public.apply_sync_operation('7e000000-0000-4000-8000-0000000000f1', 'funding-test', 'transactions', '7e000000-0000-4000-8000-0000000000e1', 'create', NULL, ARRAY[]::text[], v_payload || jsonb_build_object('savings_goal_withdrawals', v_split));
  IF v_result.status NOT IN ('duplicate', 'applied') OR (SELECT count(*) FROM savings_goal_activities WHERE user_id = auth.uid() AND deleted = false) <> 2 THEN RAISE EXCEPTION 'retry was not idempotent: %', v_result; END IF;

  -- Stale edits must not merge a withdrawal split into a newer expense.
  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'funding-test', 'transactions', '7e000000-0000-4000-8000-0000000000e1', 'update', 0, ARRAY['notes'], '{"notes":"stale"}');
  IF v_result.status <> 'conflict' THEN RAISE EXCEPTION 'stale expense split was merged'; END IF;
  IF (SELECT sum(amount_centavos) FROM savings_goal_activities WHERE user_id = auth.uid() AND deleted = false) <> 200000 THEN RAISE EXCEPTION 'stale edit changed withdrawals'; END IF;
  -- Replace with one goal; edit must restore previous withdrawals for validation.
  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'funding-test', 'transactions', '7e000000-0000-4000-8000-0000000000e1', 'update', 1, ARRAY['amount_centavos'], jsonb_build_object('amount_centavos', 600000, 'savings_goal_withdrawals', jsonb_build_array(jsonb_set(v_split->1, '{amount_centavos}', '100000'))));
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'edit failed: %', v_result; END IF;
  IF (SELECT count(*) FROM savings_goal_activities WHERE user_id = auth.uid() AND deleted = false) <> 1
    OR (SELECT amount_centavos FROM savings_goal_activities WHERE id = '7e000000-0000-4000-8000-0000000000d2') <> 100000 THEN RAISE EXCEPTION 'edit did not replace split'; END IF;
  -- Reducing to free money restores all withdrawals.
  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'funding-test', 'transactions', '7e000000-0000-4000-8000-0000000000e1', 'update', 2, ARRAY['amount_centavos'], '{"amount_centavos":300000,"savings_goal_withdrawals":[]}');
  IF v_result.status <> 'applied' OR EXISTS(SELECT 1 FROM savings_goal_activities WHERE user_id = auth.uid() AND deleted = false) THEN RAISE EXCEPTION 'free-money edit failed: %', v_result; END IF;
  -- Reuse stable IDs when a deleted withdrawal is selected again.
  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'funding-test', 'transactions', '7e000000-0000-4000-8000-0000000000e1', 'update', 3, ARRAY['amount_centavos'], jsonb_build_object('amount_centavos', 700000, 'savings_goal_withdrawals', v_split));
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'restore split failed: %', v_result; END IF;
  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(), 'funding-test', 'transactions', '7e000000-0000-4000-8000-0000000000e1', 'delete', 4, ARRAY[]::text[], '{}');
  IF v_result.status <> 'applied' OR EXISTS(SELECT 1 FROM savings_goal_activities WHERE user_id = auth.uid() AND deleted = false) THEN RAISE EXCEPTION 'delete did not restore goals: %', v_result; END IF;
  SELECT current_balance_centavos INTO v_balance FROM financial_accounts WHERE id = '7e000000-0000-4000-8000-0000000000a1';
  IF v_balance <> 2000000 THEN RAISE EXCEPTION 'delete did not restore account: %', v_balance; END IF;
END;
$$;
ROLLBACK;
