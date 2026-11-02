-- A biller payment can settle its occurrence in full even when it is less than the scheduled amount
-- (a variable bill such as electricity). The flag is the only field a payment record may ever update.
ALTER TABLE public.scheduled_payment_records ADD COLUMN IF NOT EXISTS settles_occurrence boolean NOT NULL DEFAULT false;

-- Same function as 20261115000000, except a record update may set settles_occurrence and nothing else.
CREATE OR REPLACE FUNCTION public.apply_scheduled_payment_sync_operation(
  p_operation_id uuid, p_device_id text, p_entity text, p_record_id uuid,
  p_operation_type text, p_base_version integer, p_changed_fields text[], p_payload jsonb
) RETURNS TABLE(status text, reason text, current_version integer, conflicted_fields text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, auth AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_user_id uuid;
  v_version integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_entity NOT IN ('scheduled_payments', 'scheduled_payment_records') THEN RAISE EXCEPTION 'entity % is not a scheduled payment entity', p_entity; END IF;
  IF p_operation_type NOT IN ('create', 'update', 'delete') THEN RAISE EXCEPTION 'unsupported operation'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'payload must be an object'; END IF;

  INSERT INTO public.applied_operations (operation_id, user_id, device_id, entity, record_id, operation_type, result)
  VALUES (p_operation_id, v_user_id, p_device_id, p_entity, p_record_id, p_operation_type, jsonb_build_object('status', 'pending'))
  ON CONFLICT (operation_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT operation.user_id INTO v_existing_user_id FROM public.applied_operations AS operation WHERE operation.operation_id = p_operation_id;
    IF v_existing_user_id IS DISTINCT FROM v_user_id THEN
      RETURN QUERY SELECT 'rejected'::text, 'operation belongs to another user'::text, NULL::integer, NULL::text[];
    ELSE
      RETURN QUERY SELECT 'duplicate'::text, NULL::text, NULL::integer, NULL::text[];
    END IF;
    RETURN;
  END IF;

  IF p_payload ? 'subcategory_id' AND p_payload->>'subcategory_id' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.subcategories AS sub
     WHERE sub.id = (p_payload->>'subcategory_id')::uuid AND sub.user_id = v_user_id AND sub.kind = 'expense' AND sub.is_active AND NOT sub.deleted
  ) THEN RAISE EXCEPTION 'subcategory is not an accessible expense subcategory'; END IF;
  IF p_payload ? 'source_account_id' AND NOT EXISTS (
    SELECT 1 FROM public.financial_accounts AS account
     WHERE account.id = (p_payload->>'source_account_id')::uuid AND account.user_id = v_user_id AND account.status = 'active' AND NOT account.deleted
  ) THEN RAISE EXCEPTION 'source account is not an accessible active account'; END IF;

  IF p_entity = 'scheduled_payments' THEN
    IF p_operation_type = 'create' THEN
      -- Ids are client-generated; replaying an id this user already owns is a no-op.
      IF EXISTS (SELECT 1 FROM public.scheduled_payments AS payment WHERE payment.id = p_record_id AND payment.user_id = v_user_id) THEN
        UPDATE public.applied_operations AS operation SET result = jsonb_build_object('status', 'duplicate') WHERE operation.operation_id = p_operation_id;
        RETURN QUERY SELECT 'duplicate'::text, NULL::text, NULL::integer, NULL::text[];
        RETURN;
      END IF;
      INSERT INTO public.scheduled_payments (
        id, user_id, name, subcategory_id, source_account_id, amount_centavos, frequency,
        due_day_of_month, due_second_day_of_month, due_day_of_week, due_month, starts_on, ends_on,
        auto_post, auto_post_from, is_family_support, is_dependent_support, protected_by_default, notes, status
      ) VALUES (
        p_record_id, v_user_id, btrim(p_payload->>'name'), (p_payload->>'subcategory_id')::uuid,
        (p_payload->>'source_account_id')::uuid, (p_payload->>'amount_centavos')::bigint, p_payload->>'frequency',
        (p_payload->>'due_day_of_month')::smallint, (p_payload->>'due_second_day_of_month')::smallint,
        (p_payload->>'due_day_of_week')::smallint, (p_payload->>'due_month')::smallint,
        (p_payload->>'starts_on')::date, (p_payload->>'ends_on')::date,
        COALESCE((p_payload->>'auto_post')::boolean, false), (p_payload->>'auto_post_from')::date,
        COALESCE((p_payload->>'is_family_support')::boolean, false), COALESCE((p_payload->>'is_dependent_support')::boolean, false),
        COALESCE((p_payload->>'protected_by_default')::boolean, true), p_payload->>'notes', 'active'
      );
      v_version := 1;
    ELSE
      SELECT payment.version INTO v_version FROM public.scheduled_payments AS payment
       WHERE payment.id = p_record_id AND payment.user_id = v_user_id AND NOT payment.deleted FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'scheduled payment not found or inaccessible'; END IF;
      IF p_base_version IS NOT NULL AND p_base_version <> v_version THEN
        DELETE FROM public.applied_operations AS operation WHERE operation.operation_id = p_operation_id;
        RETURN QUERY SELECT 'conflict'::text, 'scheduled payment version changed'::text, v_version, p_changed_fields;
        RETURN;
      END IF;
      IF p_operation_type = 'delete' THEN
        UPDATE public.scheduled_payments AS payment SET deleted = true, auto_post = false, version = v_version + 1, updated_at = now()
         WHERE payment.id = p_record_id AND payment.user_id = v_user_id;
      ELSE
        UPDATE public.scheduled_payments AS payment SET
          name = CASE WHEN p_payload ? 'name' THEN btrim(p_payload->>'name') ELSE payment.name END,
          subcategory_id = CASE WHEN p_payload ? 'subcategory_id' THEN (p_payload->>'subcategory_id')::uuid ELSE payment.subcategory_id END,
          source_account_id = CASE WHEN p_payload ? 'source_account_id' THEN (p_payload->>'source_account_id')::uuid ELSE payment.source_account_id END,
          amount_centavos = CASE WHEN p_payload ? 'amount_centavos' THEN (p_payload->>'amount_centavos')::bigint ELSE payment.amount_centavos END,
          frequency = CASE WHEN p_payload ? 'frequency' THEN p_payload->>'frequency' ELSE payment.frequency END,
          due_day_of_month = CASE WHEN p_payload ? 'due_day_of_month' THEN (p_payload->>'due_day_of_month')::smallint ELSE payment.due_day_of_month END,
          due_second_day_of_month = CASE WHEN p_payload ? 'due_second_day_of_month' THEN (p_payload->>'due_second_day_of_month')::smallint ELSE payment.due_second_day_of_month END,
          due_day_of_week = CASE WHEN p_payload ? 'due_day_of_week' THEN (p_payload->>'due_day_of_week')::smallint ELSE payment.due_day_of_week END,
          due_month = CASE WHEN p_payload ? 'due_month' THEN (p_payload->>'due_month')::smallint ELSE payment.due_month END,
          starts_on = CASE WHEN p_payload ? 'starts_on' THEN (p_payload->>'starts_on')::date ELSE payment.starts_on END,
          ends_on = CASE WHEN p_payload ? 'ends_on' THEN (p_payload->>'ends_on')::date ELSE payment.ends_on END,
          auto_post = CASE WHEN p_payload ? 'auto_post' THEN (p_payload->>'auto_post')::boolean ELSE payment.auto_post END,
          auto_post_from = CASE WHEN p_payload ? 'auto_post_from' THEN (p_payload->>'auto_post_from')::date ELSE payment.auto_post_from END,
          is_family_support = CASE WHEN p_payload ? 'is_family_support' THEN (p_payload->>'is_family_support')::boolean ELSE payment.is_family_support END,
          is_dependent_support = CASE WHEN p_payload ? 'is_dependent_support' THEN (p_payload->>'is_dependent_support')::boolean ELSE payment.is_dependent_support END,
          protected_by_default = CASE WHEN p_payload ? 'protected_by_default' THEN (p_payload->>'protected_by_default')::boolean ELSE payment.protected_by_default END,
          notes = CASE WHEN p_payload ? 'notes' THEN p_payload->>'notes' ELSE payment.notes END,
          status = CASE WHEN p_payload ? 'status' THEN p_payload->>'status' ELSE payment.status END,
          version = v_version + 1, updated_at = now()
         WHERE payment.id = p_record_id AND payment.user_id = v_user_id;
      END IF;
      v_version := v_version + 1;
    END IF;
  ELSE
    IF p_operation_type = 'create' THEN
      IF EXISTS (SELECT 1 FROM public.scheduled_payment_records AS record WHERE record.id = p_record_id AND record.user_id = v_user_id) THEN
        UPDATE public.applied_operations AS operation SET result = jsonb_build_object('status', 'duplicate') WHERE operation.operation_id = p_operation_id;
        RETURN QUERY SELECT 'duplicate'::text, NULL::text, NULL::integer, NULL::text[];
        RETURN;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.scheduled_payments AS payment
         WHERE payment.id = (p_payload->>'scheduled_payment_id')::uuid AND payment.user_id = v_user_id AND payment.status = 'active' AND NOT payment.deleted
      ) THEN RAISE EXCEPTION 'payment requires an active scheduled payment'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.transactions AS tx
         WHERE tx.id = (p_payload->>'transaction_id')::uuid AND tx.user_id = v_user_id AND tx.transaction_type = 'expense' AND NOT tx.deleted
      ) THEN RAISE EXCEPTION 'payment requires an owned expense transaction'; END IF;
      INSERT INTO public.scheduled_payment_records (
        id, user_id, scheduled_payment_id, transaction_id, occurrence_date, payment_date, amount_centavos, source, notes
      ) VALUES (
        p_record_id, v_user_id, (p_payload->>'scheduled_payment_id')::uuid, (p_payload->>'transaction_id')::uuid,
        (p_payload->>'occurrence_date')::date, (p_payload->>'payment_date')::date, (p_payload->>'amount_centavos')::bigint,
        COALESCE(p_payload->>'source', 'manual'), p_payload->>'notes'
      );
      v_version := 1;
    ELSE
      SELECT record.version INTO v_version FROM public.scheduled_payment_records AS record
       WHERE record.id = p_record_id AND record.user_id = v_user_id AND NOT record.deleted FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'payment record not found or inaccessible'; END IF;
      IF p_base_version IS NOT NULL AND p_base_version <> v_version THEN
        DELETE FROM public.applied_operations AS operation WHERE operation.operation_id = p_operation_id;
        RETURN QUERY SELECT 'conflict'::text, 'payment record version changed'::text, v_version, p_changed_fields;
        RETURN;
      END IF;
      IF p_operation_type = 'update' THEN
        IF p_changed_fields IS DISTINCT FROM ARRAY['settles_occurrence'] OR jsonb_typeof(p_payload->'settles_occurrence') IS DISTINCT FROM 'boolean' THEN
          RAISE EXCEPTION 'payment records only update settles_occurrence; delete and record again';
        END IF;
        UPDATE public.scheduled_payment_records AS record SET settles_occurrence = (p_payload->>'settles_occurrence')::boolean, version = v_version + 1, updated_at = now()
         WHERE record.id = p_record_id AND record.user_id = v_user_id;
      ELSE
        UPDATE public.scheduled_payment_records AS record SET deleted = true, version = v_version + 1, updated_at = now()
         WHERE record.id = p_record_id AND record.user_id = v_user_id;
      END IF;
      v_version := v_version + 1;
    END IF;
  END IF;

  UPDATE public.applied_operations AS operation SET result = jsonb_build_object('status', 'applied', 'current_version', v_version) WHERE operation.operation_id = p_operation_id;
  RETURN QUERY SELECT 'applied'::text, NULL::text, v_version, NULL::text[];
END;
$$;

-- Same job as 20261115000003, except an occurrence settled in full never posts its remainder, and a payment
-- whose source account cannot cover its due dates posts none of them (as on the device).
CREATE OR REPLACE FUNCTION private.post_due_scheduled_payments(p_today date DEFAULT (now() AT TIME ZONE 'Asia/Manila')::date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.scheduled_payments;
  v_due_date date;
  v_transaction_id uuid;
  v_record_id uuid;
  v_remaining bigint;
  v_posted integer := 0;
  v_payment_posted integer;
  -- Balances only reconcile at commit, so this run tracks what it has taken from each account itself.
  v_spent jsonb := '{}'::jsonb;
  v_available bigint;
  v_payment_spent bigint;
BEGIN
  FOR v_payment IN
    SELECT payment.*
      FROM public.scheduled_payments AS payment
      JOIN public.financial_accounts AS account ON account.id = payment.source_account_id AND account.user_id = payment.user_id
     WHERE payment.status = 'active' AND NOT payment.deleted AND payment.auto_post AND payment.auto_post_from IS NOT NULL
       AND account.kind <> 'credit_card' AND account.status = 'active' AND NOT account.deleted
     ORDER BY payment.id
  LOOP
    v_payment_posted := 0;
    v_payment_spent := 0;
    SELECT account.current_balance_centavos - COALESCE((v_spent->>account.id::text)::bigint, 0) INTO v_available
      FROM public.financial_accounts AS account WHERE account.id = v_payment.source_account_id;
    BEGIN
      FOR v_due_date IN SELECT due_date FROM private.scheduled_payment_due_dates(v_payment, v_payment.auto_post_from, p_today) AS due_date LOOP
        v_transaction_id := private.scheduled_payment_post_id(v_payment.id, v_due_date, 'transaction');
        v_record_id := private.scheduled_payment_post_id(v_payment.id, v_due_date, 'record');
        -- Either id existing, even deleted, means this occurrence was already posted; a deleted post stays deleted.
        CONTINUE WHEN EXISTS (SELECT 1 FROM public.scheduled_payment_records WHERE id = v_record_id)
                   OR EXISTS (SELECT 1 FROM public.transactions WHERE id = v_transaction_id);

        SELECT v_payment.amount_centavos - COALESCE(SUM(record.amount_centavos), 0) INTO v_remaining
          FROM public.scheduled_payment_records AS record
         WHERE record.scheduled_payment_id = v_payment.id AND record.occurrence_date = v_due_date AND NOT record.deleted;
        CONTINUE WHEN v_remaining <= 0 OR EXISTS (
          SELECT 1 FROM public.scheduled_payment_records AS record
           WHERE record.scheduled_payment_id = v_payment.id AND record.occurrence_date = v_due_date AND record.settles_occurrence AND NOT record.deleted
        );
        -- Raising rolls back this payment's earlier due dates too, like the device's per-payment transaction.
        IF v_remaining > v_available - v_payment_spent THEN
          RAISE EXCEPTION 'the source account has insufficient funds for automatic posting';
        END IF;

        INSERT INTO public.transactions (
          id, user_id, transaction_type, status, entry_source, transaction_date, posted_at, amount_centavos,
          subcategory_id, source_account_id, merchant_name, client_mutation_id, version, deleted, created_at, updated_at
        ) VALUES (
          v_transaction_id, v_payment.user_id, 'expense', 'posted', 'recurring', v_due_date, now(), v_remaining,
          v_payment.subcategory_id, v_payment.source_account_id, v_payment.name,
          'scheduled-payment:' || v_payment.id::text || ':' || to_char(v_due_date, 'YYYY-MM-DD'), 1, false, now(), now()
        ) ON CONFLICT (id) DO NOTHING;
        INSERT INTO public.scheduled_payment_records (
          id, user_id, scheduled_payment_id, transaction_id, occurrence_date, payment_date, amount_centavos, source
        ) VALUES (
          v_record_id, v_payment.user_id, v_payment.id, v_transaction_id, v_due_date, v_due_date, v_remaining, 'auto'
        ) ON CONFLICT (id) DO NOTHING;
        v_payment_posted := v_payment_posted + 1;
        v_payment_spent := v_payment_spent + v_remaining;
      END LOOP;
      v_posted := v_posted + v_payment_posted;
      v_spent := jsonb_set(v_spent, ARRAY[v_payment.source_account_id::text],
        to_jsonb(COALESCE((v_spent->>v_payment.source_account_id::text)::bigint, 0) + v_payment_spent));
    EXCEPTION WHEN OTHERS THEN
      -- One payment that cannot post (for example an inactive category) must not block the others.
      RAISE WARNING 'scheduled payment % auto-post skipped: %', v_payment.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_posted;
END;
$$;
