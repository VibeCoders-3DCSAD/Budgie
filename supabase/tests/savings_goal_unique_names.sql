BEGIN;

INSERT INTO auth.users (id) VALUES
  ('7e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-000000000002');

INSERT INTO public.financial_accounts (id, user_id, name, kind) VALUES
  ('7e000000-0000-4000-8000-0000000000b1', '7e000000-0000-4000-8000-000000000001', 'First bank', 'bank'),
  ('7e000000-0000-4000-8000-0000000000b2', '7e000000-0000-4000-8000-000000000002', 'Second bank', 'bank');

INSERT INTO public.savings_goals (id, user_id, linked_account_id, name, is_emergency_fund, target_amount_centavos) VALUES
  ('7e000000-0000-4000-8000-0000000000a1', '7e000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-0000000000b1', 'Travel', false, 100000),
  ('7e000000-0000-4000-8000-0000000000a2', '7e000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-0000000000b1', 'Emergency', false, 100000),
  ('7e000000-0000-4000-8000-0000000000a3', '7e000000-0000-4000-8000-000000000002', '7e000000-0000-4000-8000-0000000000b2', 'Travel', false, 100000);

DO $$
DECLARE
  v_name text;
  v_constraint text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['Travel', 'TRAVEL', ' travel '] LOOP
    BEGIN
      INSERT INTO public.savings_goals (id, user_id, linked_account_id, name, is_emergency_fund, target_amount_centavos)
      VALUES (gen_random_uuid(), '7e000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-0000000000b1', v_name, false, 100000);
      RAISE EXCEPTION 'duplicate goal name must be rejected';
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint <> 'savings_goals_user_name_live_idx' THEN RAISE; END IF;
    END;
  END LOOP;

  BEGIN
    UPDATE public.savings_goals SET name = ' travel '
    WHERE id = '7e000000-0000-4000-8000-0000000000a2';
    RAISE EXCEPTION 'renaming to another goal must be rejected';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  UPDATE public.savings_goals SET name = ' TRAVEL ', status = 'archived', archived_at = now()
  WHERE id = '7e000000-0000-4000-8000-0000000000a1';
  BEGIN
    INSERT INTO public.savings_goals (id, user_id, linked_account_id, name, is_emergency_fund, target_amount_centavos)
    VALUES (gen_random_uuid(), '7e000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-0000000000b1', 'Travel', false, 100000);
    RAISE EXCEPTION 'archived goal must reserve its name';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  UPDATE public.savings_goals SET deleted = true, status = 'deleted', deleted_at = now()
  WHERE id = '7e000000-0000-4000-8000-0000000000a1';
  INSERT INTO public.savings_goals (id, user_id, linked_account_id, name, is_emergency_fund, target_amount_centavos)
  VALUES (gen_random_uuid(), '7e000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-0000000000b1', 'Travel', false, 100000);
END;
$$;

ROLLBACK;
