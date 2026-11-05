-- Savings goals have two kinds, general and emergency fund, and is_emergency_fund
-- already records which is which. goal_type duplicated it (and drifted: the app
-- creates every goal as 'custom'), so it is dropped.

-- Keep any goal marked only by goal_type, when the user has no other emergency fund.
UPDATE public.savings_goals AS goal
SET is_emergency_fund = true
WHERE goal.goal_type = 'emergency_fund'
  AND goal.is_emergency_fund = false
  AND goal.deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM public.savings_goals AS other
    WHERE other.user_id = goal.user_id AND other.is_emergency_fund = true AND other.deleted = false
  );

CREATE OR REPLACE FUNCTION private.apply_savings_goal_contribution_schedule_sync_operation(p_operation_id uuid, p_device_id text, p_record_id uuid, p_operation_type text, p_base_version integer, p_changed_fields text[], p_payload jsonb)
 RETURNS TABLE(status text, reason text, current_version integer, conflicted_fields text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_current_version integer;
  v_existing_user_id uuid;
  v_existing_result jsonb;
  v_fields text[] := ARRAY[
    'linked_account_id', 'name', 'target_amount_centavos', 'starting_amount_centavos',
    'target_date', 'priority', 'emergency_fund_baseline_centavos',
    'auto_save_amount_centavos', 'planned_contribution_amount_centavos',
    'contribution_frequency', 'contribution_interval_count',
    'contribution_day_of_month', 'contribution_second_day_of_month',
    'contribution_day_of_week', 'custom_interval_days', 'next_contribution_date',
    'interest_rate_bps', 'notes', 'emergency_fund_target_method',
    'essential_expense_coverage_months', 'is_emergency_fund'
  ];
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_operation_type NOT IN ('create', 'update', 'delete') THEN RAISE EXCEPTION 'operation type is invalid'; END IF;
  IF p_changed_fields IS NOT NULL AND NOT (p_changed_fields <@ v_fields) THEN RAISE EXCEPTION 'invalid savings goal fields'; END IF;

  INSERT INTO applied_operations(operation_id, user_id, device_id, entity, record_id, operation_type, result)
  VALUES (p_operation_id, v_user_id, p_device_id, 'savings_goals', p_record_id, p_operation_type, jsonb_build_object('status', 'pending'))
  ON CONFLICT (operation_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT user_id, result INTO v_existing_user_id, v_existing_result FROM applied_operations WHERE operation_id = p_operation_id;
    IF v_existing_user_id IS DISTINCT FROM v_user_id THEN
      RETURN QUERY SELECT 'rejected'::text, 'operation belongs to another user'::text, NULL::integer, NULL::text[];
    ELSE
      RETURN QUERY SELECT COALESCE(v_existing_result->>'status', 'duplicate')::text, NULLIF(v_existing_result->>'reason', ''), CASE WHEN v_existing_result ? 'current_version' THEN (v_existing_result->>'current_version')::integer END, NULL::text[];
    END IF;
    RETURN;
  END IF;

  IF p_operation_type = 'create' OR (p_operation_type = 'update' AND 'linked_account_id' = ANY(p_changed_fields)) THEN
    IF NULLIF(btrim(p_payload->>'linked_account_id'), '') IS NULL THEN RAISE EXCEPTION 'an active linked financial account is required'; END IF;
  END IF;

  IF p_operation_type = 'create' THEN
    IF p_base_version IS NOT NULL
      OR NOT (p_payload ?& ARRAY['name', 'target_amount_centavos', 'starting_amount_centavos', 'target_date', 'priority', 'planned_contribution_amount_centavos', 'contribution_frequency', 'next_contribution_date'])
      OR p_payload->>'name' IS NULL OR length(btrim(p_payload->>'name')) = 0
      OR p_payload->>'priority' NOT IN ('low', 'medium', 'high')
      OR p_payload->>'contribution_frequency' NOT IN ('daily', 'weekly', 'biweekly', 'semi_monthly', 'monthly', 'quarterly', 'yearly', 'custom')
      OR p_payload->>'target_amount_centavos' !~ '^[1-9][0-9]*$'
      OR p_payload->>'starting_amount_centavos' !~ '^[0-9]+$'
      OR p_payload->>'planned_contribution_amount_centavos' !~ '^[0-9]+$'
      OR (p_payload->>'next_contribution_date')::date > (p_payload->>'target_date')::date
    THEN RAISE EXCEPTION 'invalid savings goal contribution schedule payload'; END IF;

    INSERT INTO savings_goals (
      id, user_id, linked_account_id, name, target_amount_centavos, starting_amount_centavos,
      target_date, priority, emergency_fund_baseline_centavos, auto_save_amount_centavos,
      planned_contribution_amount_centavos, contribution_frequency, contribution_interval_count,
      contribution_day_of_month, contribution_second_day_of_month, contribution_day_of_week,
      custom_interval_days, next_contribution_date, interest_rate_bps, notes,
      emergency_fund_target_method, essential_expense_coverage_months, is_emergency_fund,
      status, version, deleted
    ) VALUES (
      p_record_id, v_user_id, (p_payload->>'linked_account_id')::uuid, btrim(p_payload->>'name'),
      (p_payload->>'target_amount_centavos')::bigint, (p_payload->>'starting_amount_centavos')::bigint,
      (p_payload->>'target_date')::date, p_payload->>'priority',
      NULLIF(p_payload->>'emergency_fund_baseline_centavos', '')::bigint,
      COALESCE(NULLIF(p_payload->>'auto_save_amount_centavos', '')::bigint, (p_payload->>'planned_contribution_amount_centavos')::bigint),
      (p_payload->>'planned_contribution_amount_centavos')::bigint, p_payload->>'contribution_frequency',
      COALESCE(NULLIF(p_payload->>'contribution_interval_count', '')::integer, 1),
      NULLIF(p_payload->>'contribution_day_of_month', '')::integer,
      NULLIF(p_payload->>'contribution_second_day_of_month', '')::integer,
      NULLIF(p_payload->>'contribution_day_of_week', '')::integer,
      NULLIF(p_payload->>'custom_interval_days', '')::integer, (p_payload->>'next_contribution_date')::date,
      NULLIF(p_payload->>'interest_rate_bps', '')::integer, p_payload->>'notes',
      COALESCE(p_payload->>'emergency_fund_target_method', 'fixed_amount'),
      NULLIF(p_payload->>'essential_expense_coverage_months', '')::integer,
      COALESCE((p_payload->>'is_emergency_fund')::boolean, false), 'active', 1, false
    );
    UPDATE applied_operations SET result = jsonb_build_object('status', 'applied', 'current_version', 1) WHERE operation_id = p_operation_id;
    RETURN QUERY SELECT 'applied'::text, NULL::text, 1, NULL::text[];
    RETURN;
  END IF;

  SELECT version INTO v_current_version FROM savings_goals WHERE id = p_record_id AND user_id = v_user_id FOR UPDATE;
  IF v_current_version IS NULL THEN
    UPDATE applied_operations SET result = jsonb_build_object('status', 'rejected', 'reason', 'record not found') WHERE operation_id = p_operation_id;
    RETURN QUERY SELECT 'rejected'::text, 'record not found'::text, NULL::integer, NULL::text[];
    RETURN;
  END IF;
  IF p_base_version IS NULL OR p_base_version <> v_current_version THEN
    UPDATE applied_operations SET result = jsonb_build_object('status', 'conflict', 'current_version', v_current_version, 'conflicted_fields', to_jsonb(p_changed_fields)) WHERE operation_id = p_operation_id;
    RETURN QUERY SELECT 'conflict'::text, 'savings goal version changed'::text, v_current_version, p_changed_fields;
    RETURN;
  END IF;
  IF p_operation_type = 'delete' THEN
    UPDATE savings_goals SET status = 'deleted', deleted = true, version = version + 1, updated_at = now() WHERE id = p_record_id AND user_id = v_user_id;
  ELSE
    IF p_changed_fields IS NULL OR array_length(p_changed_fields, 1) IS NULL THEN RAISE EXCEPTION 'savings goal update requires changed fields'; END IF;
    UPDATE savings_goals SET
      linked_account_id = CASE WHEN 'linked_account_id' = ANY(p_changed_fields) THEN (p_payload->>'linked_account_id')::uuid ELSE linked_account_id END,
      name = CASE WHEN 'name' = ANY(p_changed_fields) THEN btrim(p_payload->>'name') ELSE name END,
      target_amount_centavos = CASE WHEN 'target_amount_centavos' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'target_amount_centavos', '')::bigint ELSE target_amount_centavos END,
      starting_amount_centavos = CASE WHEN 'starting_amount_centavos' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'starting_amount_centavos', '')::bigint ELSE starting_amount_centavos END,
      target_date = CASE WHEN 'target_date' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'target_date', '')::date ELSE target_date END,
      priority = CASE WHEN 'priority' = ANY(p_changed_fields) THEN p_payload->>'priority' ELSE priority END,
      emergency_fund_baseline_centavos = CASE WHEN 'emergency_fund_baseline_centavos' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'emergency_fund_baseline_centavos', '')::bigint ELSE emergency_fund_baseline_centavos END,
      auto_save_amount_centavos = CASE WHEN 'auto_save_amount_centavos' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'auto_save_amount_centavos', '')::bigint ELSE auto_save_amount_centavos END,
      planned_contribution_amount_centavos = CASE WHEN 'planned_contribution_amount_centavos' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'planned_contribution_amount_centavos', '')::bigint ELSE planned_contribution_amount_centavos END,
      contribution_frequency = CASE WHEN 'contribution_frequency' = ANY(p_changed_fields) THEN p_payload->>'contribution_frequency' ELSE contribution_frequency END,
      contribution_interval_count = CASE WHEN 'contribution_interval_count' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'contribution_interval_count', '')::integer ELSE contribution_interval_count END,
      contribution_day_of_month = CASE WHEN 'contribution_day_of_month' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'contribution_day_of_month', '')::integer ELSE contribution_day_of_month END,
      contribution_second_day_of_month = CASE WHEN 'contribution_second_day_of_month' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'contribution_second_day_of_month', '')::integer ELSE contribution_second_day_of_month END,
      contribution_day_of_week = CASE WHEN 'contribution_day_of_week' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'contribution_day_of_week', '')::integer ELSE contribution_day_of_week END,
      custom_interval_days = CASE WHEN 'custom_interval_days' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'custom_interval_days', '')::integer ELSE custom_interval_days END,
      next_contribution_date = CASE WHEN 'next_contribution_date' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'next_contribution_date', '')::date ELSE next_contribution_date END,
      interest_rate_bps = CASE WHEN 'interest_rate_bps' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'interest_rate_bps', '')::integer ELSE interest_rate_bps END,
      notes = CASE WHEN 'notes' = ANY(p_changed_fields) THEN p_payload->>'notes' ELSE notes END,
      emergency_fund_target_method = CASE WHEN 'emergency_fund_target_method' = ANY(p_changed_fields) THEN p_payload->>'emergency_fund_target_method' ELSE emergency_fund_target_method END,
      essential_expense_coverage_months = CASE WHEN 'essential_expense_coverage_months' = ANY(p_changed_fields) THEN NULLIF(p_payload->>'essential_expense_coverage_months', '')::integer ELSE essential_expense_coverage_months END,
      is_emergency_fund = CASE WHEN 'is_emergency_fund' = ANY(p_changed_fields) THEN COALESCE((p_payload->>'is_emergency_fund')::boolean, false) ELSE is_emergency_fund END,
      version = version + 1, updated_at = now()
    WHERE id = p_record_id AND user_id = v_user_id AND deleted = false;
  END IF;
  UPDATE applied_operations SET result = jsonb_build_object('status', 'applied', 'current_version', v_current_version + 1) WHERE operation_id = p_operation_id;
  RETURN QUERY SELECT 'applied'::text, NULL::text, v_current_version + 1, NULL::text[];
END;
$function$;

CREATE OR REPLACE FUNCTION private.apply_savings_goal_sync_operation_core(p_operation_id uuid, p_device_id text, p_record_id uuid, p_operation_type text, p_base_version integer, p_changed_fields text[], p_payload jsonb)
 RETURNS TABLE(status text, reason text, current_version integer, conflicted_fields text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_user_id uuid;
  v_existing_result jsonb;
  v_current_version integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_device_id IS NULL OR length(p_device_id) = 0 OR length(p_device_id) > 128 OR p_device_id !~ '^[A-Za-z0-9._:-]+$' THEN RAISE EXCEPTION 'invalid device id'; END IF;
  IF p_operation_type NOT IN ('create', 'update', 'delete') THEN RAISE EXCEPTION 'operation type is invalid'; END IF;

  INSERT INTO public.applied_operations(operation_id, user_id, device_id, entity, record_id, operation_type, result)
  VALUES (p_operation_id, v_user_id, p_device_id, 'savings_goals', p_record_id, p_operation_type, jsonb_build_object('status', 'pending'))
  ON CONFLICT (operation_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT user_id, result INTO v_existing_user_id, v_existing_result FROM public.applied_operations WHERE operation_id = p_operation_id;
    IF v_existing_user_id IS DISTINCT FROM v_user_id THEN
      RETURN QUERY SELECT 'rejected'::text, 'operation belongs to another user'::text, NULL::integer, NULL::text[];
    ELSE
      RETURN QUERY SELECT COALESCE(v_existing_result->>'status', 'duplicate')::text, NULLIF(v_existing_result->>'reason', '')::text,
        CASE WHEN v_existing_result ? 'current_version' THEN (v_existing_result->>'current_version')::integer END, NULL::text[];
    END IF;
    RETURN;
  END IF;

  IF p_operation_type = 'create' THEN
    IF p_base_version IS NOT NULL OR NOT (p_payload ?& ARRAY['name', 'target_amount_centavos', 'starting_amount_centavos', 'priority'])
      OR p_payload->>'name' IS NULL OR length(btrim(p_payload->>'name')) = 0
      OR p_payload->>'priority' NOT IN ('low', 'medium', 'high')
      OR p_payload->>'target_amount_centavos' !~ '^[1-9][0-9]*$'
      OR p_payload->>'starting_amount_centavos' !~ '^[0-9]+$'
      OR (p_payload ? 'emergency_fund_baseline_centavos' AND p_payload->>'emergency_fund_baseline_centavos' IS NOT NULL AND p_payload->>'emergency_fund_baseline_centavos' !~ '^[0-9]+$')
    THEN RAISE EXCEPTION 'invalid savings goal payload'; END IF;
    INSERT INTO public.savings_goals(id, user_id, name, target_amount_centavos, starting_amount_centavos, target_date, priority, emergency_fund_baseline_centavos, status, version, deleted)
    VALUES (p_record_id, v_user_id, btrim(p_payload->>'name'), (p_payload->>'target_amount_centavos')::bigint,
      (p_payload->>'starting_amount_centavos')::bigint, (p_payload->>'target_date')::date, p_payload->>'priority',
      CASE WHEN p_payload->>'emergency_fund_baseline_centavos' IS NULL THEN NULL ELSE (p_payload->>'emergency_fund_baseline_centavos')::bigint END,
      'active', 1, false)
    ON CONFLICT (id) DO UPDATE SET updated_at = public.savings_goals.updated_at WHERE public.savings_goals.user_id = v_user_id;
    UPDATE public.applied_operations SET result = jsonb_build_object('status', 'applied', 'current_version', 1) WHERE operation_id = p_operation_id;
    RETURN QUERY SELECT 'applied'::text, NULL::text, 1, NULL::text[];
    RETURN;
  END IF;

  SELECT version INTO v_current_version FROM public.savings_goals WHERE id = p_record_id AND user_id = v_user_id FOR UPDATE;
  IF v_current_version IS NULL THEN
    UPDATE public.applied_operations SET result = jsonb_build_object('status', 'rejected', 'reason', 'record not found') WHERE operation_id = p_operation_id;
    RETURN QUERY SELECT 'rejected'::text, 'record not found'::text, NULL::integer, NULL::text[];
    RETURN;
  END IF;
  IF p_base_version IS NULL OR p_base_version <> v_current_version THEN
    UPDATE public.applied_operations SET result = jsonb_build_object('status', 'conflict', 'current_version', v_current_version, 'conflicted_fields', to_jsonb(p_changed_fields)) WHERE operation_id = p_operation_id;
    RETURN QUERY SELECT 'conflict'::text, 'savings goal version changed'::text, v_current_version, p_changed_fields;
    RETURN;
  END IF;

  IF p_operation_type = 'delete' THEN
    UPDATE public.savings_goals SET deleted = true, version = version + 1, updated_at = now() WHERE id = p_record_id AND user_id = v_user_id;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'savings_goals' AND column_name = 'deleted_at'
    ) THEN
      EXECUTE 'UPDATE public.savings_goals SET status = ''deleted'', deleted_at = now() WHERE id = $1 AND user_id = $2'
        USING p_record_id, v_user_id;
    END IF;
  ELSE
    IF p_changed_fields IS NULL OR array_length(p_changed_fields, 1) IS NULL OR NOT (p_changed_fields <@ ARRAY['name', 'target_amount_centavos', 'starting_amount_centavos', 'target_date', 'priority', 'emergency_fund_baseline_centavos']) THEN RAISE EXCEPTION 'invalid savings goal fields'; END IF;
    UPDATE public.savings_goals SET
      name = CASE WHEN 'name' = ANY(p_changed_fields) THEN btrim(p_payload->>'name') ELSE name END,
      target_amount_centavos = CASE WHEN 'target_amount_centavos' = ANY(p_changed_fields) THEN (p_payload->>'target_amount_centavos')::bigint ELSE target_amount_centavos END,
      starting_amount_centavos = CASE WHEN 'starting_amount_centavos' = ANY(p_changed_fields) THEN (p_payload->>'starting_amount_centavos')::bigint ELSE starting_amount_centavos END,
      target_date = CASE WHEN 'target_date' = ANY(p_changed_fields) THEN (p_payload->>'target_date')::date ELSE target_date END,
      priority = CASE WHEN 'priority' = ANY(p_changed_fields) THEN p_payload->>'priority' ELSE priority END,
      emergency_fund_baseline_centavos = CASE WHEN 'emergency_fund_baseline_centavos' = ANY(p_changed_fields) THEN (p_payload->>'emergency_fund_baseline_centavos')::bigint ELSE emergency_fund_baseline_centavos END,
      version = version + 1, updated_at = now()
    WHERE id = p_record_id AND user_id = v_user_id AND deleted = false;
  END IF;
  UPDATE public.applied_operations SET result = jsonb_build_object('status', 'applied', 'current_version', v_current_version + 1) WHERE operation_id = p_operation_id;
  RETURN QUERY SELECT 'applied'::text, NULL::text, v_current_version + 1, NULL::text[];
END;
$function$;

ALTER TABLE public.savings_goals DROP CONSTRAINT IF EXISTS savings_goals_goal_type_check;
ALTER TABLE public.savings_goals DROP COLUMN goal_type;
