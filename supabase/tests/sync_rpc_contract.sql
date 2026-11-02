BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(
        '[{"categoryId":null,"subcategoryId":"00000000-0000-0000-0000-000000000001"}]'::jsonb
      ) AS allocation(value)
     WHERE (NULLIF(allocation.value->>'categoryId', '') IS NULL)
         = (NULLIF(allocation.value->>'subcategoryId', '') IS NULL)
  ) THEN
    RAISE EXCEPTION 'a nullable inactive Financial Plan allocation target must be valid';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(
        '[{"debtAccountId":"00000000-0000-0000-0000-000000000001","creditCardStatementId":null}]'::jsonb
      ) AS reservation(value)
     WHERE (NULLIF(reservation.value->>'debtAccountId', '') IS NULL)
         = (NULLIF(reservation.value->>'creditCardStatementId', '') IS NULL)
  ) THEN
    RAISE EXCEPTION 'a nullable inactive Financial Plan debt reservation target must be valid';
  END IF;

  IF pg_get_functiondef('private.apply_financial_plan_sync_operation_base(uuid, text, text, uuid, text, integer, text[], jsonb)'::regprocedure)
     NOT LIKE '%NULLIF(a.value->>''categoryId'', '''') IS NULL%' THEN
    RAISE EXCEPTION 'Financial Plan sync must accept a null inactive allocation target';
  END IF;

  IF pg_get_functiondef('private.apply_financial_plan_sync_operation_base(uuid, text, text, uuid, text, integer, text[], jsonb)'::regprocedure)
     NOT LIKE '%NULLIF(r.value->>''debtAccountId'', '''') IS NULL%' THEN
    RAISE EXCEPTION 'Financial Plan sync must accept a null inactive debt reservation target';
  END IF;

  IF pg_get_functiondef('private.apply_financial_plan_sync_operation_base(uuid, text, text, uuid, text, integer, text[], jsonb)'::regprocedure)
     NOT LIKE '%Financial Plans can only cover the current calendar month or the one that just ended%' THEN
    RAISE EXCEPTION 'Financial Plan sync must only accept the current calendar month or the one that just ended';
  END IF;

  IF to_regprocedure('public.apply_financial_plan_sync_operation_base(uuid, text, text, uuid, text, integer, text[], jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'the Financial Plan sync base must not live in the exposed public schema';
  END IF;

  IF has_function_privilege('authenticated', 'private.apply_financial_plan_sync_operation_base(uuid, text, text, uuid, text, integer, text[], jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'private.apply_financial_plan_sync_operation_base(uuid, text, text, uuid, text, integer, text[], jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'the Financial Plan sync base is executable by an API role';
  END IF;

  IF pg_get_functiondef('public.apply_financial_plan_sync_operation(uuid, text, text, uuid, text, integer, text[], jsonb)'::regprocedure)
     NOT LIKE '%private.apply_financial_plan_sync_operation_base(%' THEN
    RAISE EXCEPTION 'the Financial Plan sync wrapper must call the private base';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('public.write_daily_financial_report(uuid, date, text, text, date, jsonb, jsonb)'),
        ('public.seed_hfce_taxonomy_for_user(uuid)'),
        ('public.seed_hfce_subcategories_for_user(uuid)')
      ) AS caller_scoped(signature)
      CROSS JOIN (VALUES ('anon'), ('authenticated')) AS api(role_name)
     WHERE to_regprocedure(caller_scoped.signature) IS NOT NULL
       AND has_function_privilege(api.role_name, caller_scoped.signature, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'a function that trusts p_user_id is executable by an API role';
  END IF;

  IF has_schema_privilege('authenticated', 'private', 'USAGE') THEN
    RAISE EXCEPTION 'authenticated has USAGE on the private schema';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
     WHERE namespace.nspname = 'public'
       AND (
         procedure.proname = 'apply_sync_operation_ledger_core'
         OR procedure.proname = 'apply_debt_sync_operation_hardened'
         OR procedure.proname LIKE 'apply_debt_sync_operation_v%'
         OR procedure.proname = 'apply_credit_card_sync_operation_core'
         OR procedure.proname LIKE 'apply_credit_card_sync_operation_v%'
       )
       AND has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'an internal sync RPC is executable by authenticated';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
     WHERE namespace.nspname = 'private'
       AND procedure.proname IN (
         'apply_sync_operation_ledger_core',
         'apply_debt_sync_operation_hardened',
         'apply_credit_card_sync_operation_core',
         'apply_credit_card_repayment_preference_sync_operation_core'
       )
       AND has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'a private sync implementation is executable by authenticated';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('apply_sync_operation'),
        ('apply_debt_sync_operation'),
        ('apply_credit_card_sync_operation')
      ) AS expected(procedure_name)
     WHERE NOT EXISTS (
       SELECT 1
         FROM pg_proc AS procedure
         JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.proname = expected.procedure_name
          AND procedure.pronargs = 8
          AND has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
     )
  ) THEN
    RAISE EXCEPTION 'a canonical sync RPC is not executable by authenticated';
  END IF;

  IF pg_get_functiondef('public.apply_debt_sync_operation(uuid, text, text, uuid, text, integer, text[], jsonb)'::regprocedure)
     NOT LIKE '%private.apply_debt_sync_operation_hardened%' THEN
    RAISE EXCEPTION 'debt sync must route non-account operations to the private implementation';
  END IF;

  IF pg_get_functiondef('public.apply_debt_sync_operation(uuid, text, text, uuid, text, integer, text[], jsonb)'::regprocedure)
     NOT LIKE '%status = CASE WHEN p_payload ? ''status''%' THEN
    RAISE EXCEPTION 'debt account status updates must not collide with RPC result columns';
  END IF;

  IF pg_get_functiondef('public.apply_sync_operation(uuid, text, text, uuid, text, integer, text[], jsonb)'::regprocedure)
     LIKE '%transaction would overdraw a financial account%' THEN
    RAISE EXCEPTION 'transaction sync must allow recovery from a historical overdraft';
  END IF;
END;
$$;

ROLLBACK;
