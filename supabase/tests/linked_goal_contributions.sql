BEGIN;
INSERT INTO auth.users(id) VALUES ('7c000000-0000-4000-8000-000000000001'), ('7c000000-0000-4000-8000-000000000002');
INSERT INTO public.financial_accounts(id,user_id,name,kind,opening_balance_centavos,current_balance_centavos) VALUES
('7c000000-0000-4000-8000-0000000000a1','7c000000-0000-4000-8000-000000000001','Linked bank','bank',2000000,2000000),
('7c000000-0000-4000-8000-0000000000a2','7c000000-0000-4000-8000-000000000001','Payroll','bank',1000000,1000000),
('7c000000-0000-4000-8000-0000000000a3','7c000000-0000-4000-8000-000000000002','Foreign bank','bank',1000000,1000000);
INSERT INTO public.savings_goals(id,user_id,name,is_emergency_fund,target_amount_centavos,starting_amount_centavos,linked_account_id) VALUES
('7c000000-0000-4000-8000-0000000000c1','7c000000-0000-4000-8000-000000000001','Travel',false,2000000,500000,'7c000000-0000-4000-8000-0000000000a1'),
('7c000000-0000-4000-8000-0000000000c2','7c000000-0000-4000-8000-000000000001','Emergency',true,2000000,1000000,'7c000000-0000-4000-8000-0000000000a1');
SELECT set_config('request.jwt.claim.sub','7c000000-0000-4000-8000-000000000001',true);
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
  v_result record;
  v_balance bigint;
  v_free bigint;
  v_count integer;
  v_payload jsonb := '{"transaction_type":"transfer","amount_centavos":100000,"transaction_date":"2026-10-21","source_account_id":"7c000000-0000-4000-8000-0000000000a1","destination_account_id":"7c000000-0000-4000-8000-0000000000a1","savings_goal_contribution":{"savings_goal_id":"7c000000-0000-4000-8000-0000000000c1","activity_id":"7c000000-0000-4000-8000-0000000000d1"}}';
  v_bad jsonb;
BEGIN
  -- A single operation earmarks existing money, without changing cash balance.
  SELECT * INTO v_result FROM public.apply_sync_operation('7c000000-0000-4000-8000-0000000000f1','contribution-test','transactions','7c000000-0000-4000-8000-0000000000e1','create',NULL,ARRAY[]::text[],v_payload);
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'allocation failed: %',v_result; END IF;
  SELECT current_balance_centavos INTO v_balance FROM financial_accounts WHERE id='7c000000-0000-4000-8000-0000000000a1';
  IF v_balance <> 2000000 THEN RAISE EXCEPTION 'allocation changed cash: %',v_balance; END IF;
  SELECT private.savings_unallocated_balance(auth.uid(),'7c000000-0000-4000-8000-0000000000a1') INTO v_free;
  IF v_free <> 400000 THEN RAISE EXCEPTION 'allocation did not reserve money: %',v_free; END IF;
  SELECT * INTO v_result FROM public.apply_sync_operation('7c000000-0000-4000-8000-0000000000f1','contribution-test','transactions','7c000000-0000-4000-8000-0000000000e1','create',NULL,ARRAY[]::text[],v_payload);
  IF v_result.status <> 'duplicate' THEN RAISE EXCEPTION 'allocation retry not idempotent'; END IF;

  -- The destination is fixed, foreign sources and reserved funds are rejected.
  FOR v_bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    jsonb_set(v_payload,'{destination_account_id}','"7c000000-0000-4000-8000-0000000000a2"'),
    jsonb_set(v_payload,'{source_account_id}','"7c000000-0000-4000-8000-0000000000a3"'),
    jsonb_set(v_payload,'{amount_centavos}','400001')
  )) LOOP
    BEGIN
      PERFORM public.apply_sync_operation(gen_random_uuid(),'contribution-test','transactions',gen_random_uuid(),'create',NULL,ARRAY[]::text[],v_bad);
      RAISE EXCEPTION 'invalid contribution accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT IN ('destination must be the goal linked account','contribution requires owned active accounts and the fixed linked destination','contribution exceeds unallocated balance') THEN RAISE; END IF;
    END;
  END LOOP;
  SELECT count(*) INTO v_count FROM savings_goal_activities WHERE user_id=auth.uid();
  IF v_count <> 1 THEN RAISE EXCEPTION 'invalid contribution leaked activity'; END IF;

  -- Edits restore the old allocation for validation, and keep the account fixed.
  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(),'contribution-test','transactions','7c000000-0000-4000-8000-0000000000e1','update',1,ARRAY['amount_centavos'],'{"amount_centavos":200000}');
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'allocation edit failed: %',v_result; END IF;
  SELECT private.savings_unallocated_balance(auth.uid(),'7c000000-0000-4000-8000-0000000000a1') INTO v_free;
  IF v_free <> 300000 THEN RAISE EXCEPTION 'edit did not replace allocation: %',v_free; END IF;
  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(),'contribution-test','transactions','7c000000-0000-4000-8000-0000000000e1','update',1,ARRAY['amount_centavos'],'{"amount_centavos":300000}');
  IF v_result.status <> 'conflict' THEN RAISE EXCEPTION 'stale contribution edit accepted'; END IF;

  -- A contribution from another account moves cash into the linked destination.
  v_payload := jsonb_set(jsonb_set(v_payload,'{source_account_id}','"7c000000-0000-4000-8000-0000000000a2"'),'{savings_goal_contribution,activity_id}','"7c000000-0000-4000-8000-0000000000d2"');
  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(),'contribution-test','transactions','7c000000-0000-4000-8000-0000000000e2','create',NULL,ARRAY[]::text[],v_payload);
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'external contribution failed: %',v_result; END IF;
  SELECT current_balance_centavos INTO v_balance FROM financial_accounts WHERE id='7c000000-0000-4000-8000-0000000000a1';
  IF v_balance <> 2100000 THEN RAISE EXCEPTION 'external contribution did not credit linked account: %',v_balance; END IF;
  SELECT current_balance_centavos INTO v_balance FROM financial_accounts WHERE id='7c000000-0000-4000-8000-0000000000a2';
  IF v_balance <> 900000 THEN RAISE EXCEPTION 'external contribution did not debit source: %',v_balance; END IF;
  SELECT private.savings_unallocated_balance(auth.uid(),'7c000000-0000-4000-8000-0000000000a1') INTO v_free;
  IF v_free <> 300000 THEN RAISE EXCEPTION 'external contribution duplicated free money: %',v_free; END IF;

  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(),'contribution-test','transactions','7c000000-0000-4000-8000-0000000000e1','delete',2,ARRAY[]::text[],'{}');
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'allocation delete failed'; END IF;
  SELECT * INTO v_result FROM public.apply_sync_operation(gen_random_uuid(),'contribution-test','transactions','7c000000-0000-4000-8000-0000000000e2','delete',1,ARRAY[]::text[],'{}');
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'external contribution delete failed'; END IF;
  IF EXISTS(SELECT 1 FROM savings_goal_activities WHERE user_id=auth.uid() AND NOT deleted) THEN RAISE EXCEPTION 'delete left a live contribution'; END IF;
  SELECT current_balance_centavos INTO v_balance FROM financial_accounts WHERE id='7c000000-0000-4000-8000-0000000000a1';
  IF v_balance <> 2000000 THEN RAISE EXCEPTION 'delete did not restore linked cash'; END IF;
  SELECT current_balance_centavos INTO v_balance FROM financial_accounts WHERE id='7c000000-0000-4000-8000-0000000000a2';
  IF v_balance <> 1000000 THEN RAISE EXCEPTION 'delete did not restore source cash'; END IF;
END;
$$;
ROLLBACK;
