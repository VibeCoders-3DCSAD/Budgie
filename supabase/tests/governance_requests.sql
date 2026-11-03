BEGIN;

INSERT INTO auth.users (id) VALUES
  ('7a000000-0000-4000-8000-000000000001'),
  ('7a000000-0000-4000-8000-000000000002');

-- Consents: a withdrawal needs its withdrawal time, and the newest event per version decides.
DO $$
DECLARE
  v_status text;
BEGIN
  BEGIN
    INSERT INTO public.user_consents (user_id, consent_kind, status, version)
    VALUES ('7a000000-0000-4000-8000-000000000001', 'terms', 'withdrawn', '2026-06');
    RAISE EXCEPTION 'a withdrawal without withdrawn_at must be rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.user_consents (user_id, consent_kind, status, version, recorded_at)
  VALUES ('7a000000-0000-4000-8000-000000000001', 'terms', 'granted', '2026-06', now() - interval '2 days');
  INSERT INTO public.user_consents (user_id, consent_kind, status, version, recorded_at, withdrawn_at)
  VALUES ('7a000000-0000-4000-8000-000000000001', 'terms', 'withdrawn', '2026-06', now() - interval '1 day', now() - interval '1 day');

  SELECT status::text INTO v_status FROM public.user_current_consents
  WHERE user_id = '7a000000-0000-4000-8000-000000000001' AND consent_kind = 'terms' AND version = '2026-06';
  IF v_status IS DISTINCT FROM 'withdrawn' THEN
    RAISE EXCEPTION 'a later withdrawal must replace the grant, got %', v_status;
  END IF;

  INSERT INTO public.user_consents (user_id, consent_kind, status, version)
  VALUES ('7a000000-0000-4000-8000-000000000001', 'terms', 'granted', '2026-06');

  SELECT status::text INTO v_status FROM public.user_current_consents
  WHERE user_id = '7a000000-0000-4000-8000-000000000001' AND consent_kind = 'terms' AND version = '2026-06';
  IF v_status IS DISTINCT FROM 'granted' THEN
    RAISE EXCEPTION 'a grant after a withdrawal must be current, got %', v_status;
  END IF;

  INSERT INTO public.user_consents (user_id, consent_kind, status, version)
  VALUES ('7a000000-0000-4000-8000-000000000002', 'terms', 'granted', '2026-06');
END;
$$;

-- Exports: one active request per user, replaced atomically through the caller's own RLS.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  v_first uuid;
  v_second uuid;
  v_active integer;
  v_visible integer;
BEGIN
  SELECT count(*) INTO v_visible FROM public.user_current_consents;
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'the consent view must show only the caller''s rows, saw %', v_visible;
  END IF;

  SELECT id INTO v_first FROM public.replace_data_export_request('{"format": "json"}'::jsonb);
  SELECT id INTO v_second FROM public.replace_data_export_request('{"format": "csv"}'::jsonb);

  IF (SELECT status::text FROM public.data_export_requests WHERE id = v_first) <> 'cancelled' THEN
    RAISE EXCEPTION 'the previous export must be cancelled';
  END IF;

  SELECT count(*) INTO v_active FROM public.data_export_requests
  WHERE status IN ('requested', 'processing');
  IF v_active <> 1 THEN
    RAISE EXCEPTION 'exactly one active export expected, found %', v_active;
  END IF;

  IF (SELECT metadata ->> 'format' FROM public.data_export_requests WHERE id = v_second) <> 'csv' THEN
    RAISE EXCEPTION 'the new export must keep its metadata';
  END IF;

  -- A failed insert must roll the cancellation back with it.
  BEGIN
    PERFORM public.replace_data_export_request('"not an object"'::jsonb);
    PERFORM 1 / 0;
  EXCEPTION WHEN division_by_zero THEN NULL;
  END;
  IF (SELECT status::text FROM public.data_export_requests WHERE id = v_second) <> 'requested' THEN
    RAISE EXCEPTION 'a failed replacement must leave the active export in place';
  END IF;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.data_export_requests (user_id) VALUES ('7a000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'a second active export must be rejected';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Deletion requests: one active request per user, whether requested or already confirmed.
  INSERT INTO public.account_deletion_requests (user_id) VALUES ('7a000000-0000-4000-8000-000000000001');
  BEGIN
    INSERT INTO public.account_deletion_requests (user_id) VALUES ('7a000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'a second active deletion request must be rejected';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE public.account_deletion_requests SET status = 'processing'
  WHERE user_id = '7a000000-0000-4000-8000-000000000001';
  BEGIN
    INSERT INTO public.account_deletion_requests (user_id) VALUES ('7a000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'a confirmed deletion request must block another';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE public.account_deletion_requests SET status = 'cancelled', cancelled_at = now()
  WHERE user_id = '7a000000-0000-4000-8000-000000000001';
  INSERT INTO public.account_deletion_requests (user_id) VALUES ('7a000000-0000-4000-8000-000000000001');

  IF has_function_privilege('anon', 'public.replace_data_export_request(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not be able to replace exports';
  END IF;
  IF has_table_privilege('anon', 'public.user_current_consents', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not read current consents';
  END IF;
END;
$$;

ROLLBACK;
