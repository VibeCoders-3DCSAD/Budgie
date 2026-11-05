BEGIN;

INSERT INTO auth.users (id) VALUES
  ('7f000000-0000-4000-8000-000000000001'),
  ('7f000000-0000-4000-8000-000000000002');
INSERT INTO public.financial_accounts (id, user_id, name, kind, status, deleted) VALUES
  ('7f000000-0000-4000-8000-0000000000a1', '7f000000-0000-4000-8000-000000000001', 'Active account', 'bank', 'active', false),
  ('7f000000-0000-4000-8000-0000000000a2', '7f000000-0000-4000-8000-000000000002', 'Other user account', 'bank', 'active', false),
  ('7f000000-0000-4000-8000-0000000000a3', '7f000000-0000-4000-8000-000000000001', 'Archived account', 'bank', 'archived', false),
  ('7f000000-0000-4000-8000-0000000000a4', '7f000000-0000-4000-8000-000000000001', 'Deleted account', 'bank', 'active', true),
  ('7f000000-0000-4000-8000-0000000000a5', '7f000000-0000-4000-8000-000000000001', 'Second active account', 'bank', 'active', false);
SELECT set_config('request.jwt.claim.sub', '7f000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  v_account uuid;
  v_result record;
  v_payload jsonb := jsonb_build_object(
    'name', 'Travel', 'target_amount_centavos', 100000,
    'starting_amount_centavos', 0, 'target_date', '2027-05-17', 'priority', 'high',
    'planned_contribution_amount_centavos', 0, 'contribution_frequency', NULL,
    'next_contribution_date', NULL,
    'linked_account_id', '7f000000-0000-4000-8000-0000000000a1'
  );
BEGIN
  SELECT * INTO v_result FROM public.apply_sync_operation(
    '7f000000-0000-4000-8000-0000000000b1', 'account-link-test', 'savings_goals',
    '7f000000-0000-4000-8000-0000000000c1', 'create', NULL,
    ARRAY['name', 'linked_account_id'], v_payload
  );
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'valid linked goal did not sync: %', v_result; END IF;
  SELECT linked_account_id INTO v_account FROM public.savings_goals WHERE id = '7f000000-0000-4000-8000-0000000000c1';
  IF v_account IS DISTINCT FROM '7f000000-0000-4000-8000-0000000000a1'::uuid THEN RAISE EXCEPTION 'synced link was not persisted'; END IF;

  FOREACH v_account IN ARRAY ARRAY[
    NULL::uuid,
    '7f000000-0000-4000-8000-0000000000a2'::uuid,
    '7f000000-0000-4000-8000-0000000000a3'::uuid,
    '7f000000-0000-4000-8000-0000000000a4'::uuid,
    '7f000000-0000-4000-8000-000000000099'::uuid
  ] LOOP
    BEGIN
      PERFORM public.apply_sync_operation(
        gen_random_uuid(), 'account-link-test', 'savings_goals', gen_random_uuid(), 'create', NULL,
        ARRAY['name', 'linked_account_id'], v_payload || jsonb_build_object('name', 'Invalid goal', 'linked_account_id', v_account)
      );
      RAISE EXCEPTION 'invalid create was accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT IN ('an active linked financial account is required', 'linked account must be active and owned by the user') THEN RAISE; END IF;
    END;
    BEGIN
      PERFORM public.apply_sync_operation(
        gen_random_uuid(), 'account-link-test', 'savings_goals', '7f000000-0000-4000-8000-0000000000c1', 'update', 1,
        ARRAY['linked_account_id'], jsonb_build_object('linked_account_id', v_account)
      );
      RAISE EXCEPTION 'invalid relink was accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT IN ('an active linked financial account is required', 'linked account must be active and owned by the user') THEN RAISE; END IF;
    END;
  END LOOP;

  BEGIN
    INSERT INTO public.savings_goals (id, user_id, name, is_emergency_fund, target_amount_centavos)
    VALUES (gen_random_uuid(), '7f000000-0000-4000-8000-000000000001', 'Unlinked direct insert', false, 100000);
    RAISE EXCEPTION 'unlinked direct insert was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'an active linked financial account is required' THEN RAISE; END IF;
  END;

  SELECT * INTO v_result FROM public.apply_sync_operation(
    gen_random_uuid(), 'account-link-test', 'savings_goals', '7f000000-0000-4000-8000-0000000000c1', 'update', 1,
    ARRAY['linked_account_id'], jsonb_build_object('linked_account_id', '7f000000-0000-4000-8000-0000000000a5')
  );
  IF v_result.status <> 'applied' OR v_result.current_version <> 2 THEN RAISE EXCEPTION 'valid relink did not sync'; END IF;
  SELECT linked_account_id INTO v_account FROM public.savings_goals WHERE id = '7f000000-0000-4000-8000-0000000000c1';
  IF v_account IS DISTINCT FROM '7f000000-0000-4000-8000-0000000000a5'::uuid THEN RAISE EXCEPTION 'relinked account was not persisted'; END IF;

  UPDATE public.financial_accounts SET status = 'archived' WHERE id = v_account;
  SELECT * INTO v_result FROM public.apply_sync_operation(
    gen_random_uuid(), 'account-link-test', 'savings_goals', '7f000000-0000-4000-8000-0000000000c1', 'update', 2,
    ARRAY['name'], jsonb_build_object('name', 'Japan trip')
  );
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'unrelated edit of an existing link must remain valid'; END IF;

  SELECT * INTO v_result FROM public.apply_sync_operation(
    '7f000000-0000-4000-8000-0000000000b1', 'account-link-test', 'savings_goals',
    '7f000000-0000-4000-8000-0000000000c1', 'create', NULL,
    ARRAY['name', 'linked_account_id'], v_payload
  );
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'duplicate create must return its cached result'; END IF;

  SELECT * INTO v_result FROM public.apply_sync_operation(
    gen_random_uuid(), 'account-link-test', 'savings_goals', '7f000000-0000-4000-8000-0000000000c1', 'update', 3,
    ARRAY['status', 'archived_at'], jsonb_build_object('status', 'archived', 'archived_at', now())
  );
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'archive route was not preserved'; END IF;
  SELECT * INTO v_result FROM public.apply_sync_operation(
    gen_random_uuid(), 'account-link-test', 'savings_goals', '7f000000-0000-4000-8000-0000000000c1', 'delete', 4,
    ARRAY[]::text[], '{}'::jsonb
  );
  IF v_result.status <> 'applied' THEN RAISE EXCEPTION 'delete route was not preserved'; END IF;

END;
$$;

ROLLBACK;
