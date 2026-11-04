BEGIN;

-- 1: confirmed and due. 2: confirmed, not yet due. 3: requested but never confirmed. 4: cancelled.
INSERT INTO auth.users (id) VALUES
  ('7d000000-0000-4000-8000-000000000001'),
  ('7d000000-0000-4000-8000-000000000002'),
  ('7d000000-0000-4000-8000-000000000003'),
  ('7d000000-0000-4000-8000-000000000004');

INSERT INTO public.account_deletion_requests (id, user_id, status, requested_at, confirmed_at, scheduled_delete_at, cancelled_at) VALUES
  ('7d100000-0000-4000-8000-000000000001', '7d000000-0000-4000-8000-000000000001', 'processing', now() - interval '31 days', now() - interval '31 days', now() - interval '1 day', NULL),
  ('7d100000-0000-4000-8000-000000000002', '7d000000-0000-4000-8000-000000000002', 'processing', now(), now(), now() + interval '30 days', NULL),
  ('7d100000-0000-4000-8000-000000000003', '7d000000-0000-4000-8000-000000000003', 'requested', now() - interval '31 days', NULL, now() - interval '1 day', NULL),
  ('7d100000-0000-4000-8000-000000000004', '7d000000-0000-4000-8000-000000000004', 'cancelled', now() - interval '31 days', now() - interval '31 days', now() - interval '1 day', now() - interval '20 days');

-- Financial plans have no ON DELETE rule, so the procedure must remove them itself.
INSERT INTO public.financial_plans (
  id, user_id, period_start, period_end, status, forecast_month, forecast_total_centavos,
  forecast_model_version, forecast_generated_at, forecast_quality, available_funds_centavos
) VALUES (
  '7d200000-0000-4000-8000-000000000001', '7d000000-0000-4000-8000-000000000001', '2026-11-01', '2026-11-30', 'accepted',
  '2026-11', 0, 'test', now(), 'test', 0
);
INSERT INTO public.financial_plan_forecast_points (plan_id, category_key, amount_centavos)
VALUES ('7d200000-0000-4000-8000-000000000001', 'food', 100);

DO $$
DECLARE
  v_deleted integer;
BEGIN
  v_deleted := private.process_account_deletion_queue();
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'only the confirmed, due request must be processed, deleted %', v_deleted;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = '7d000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'the due account must be deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = '7d000000-0000-4000-8000-000000000001')
     OR EXISTS (SELECT 1 FROM public.financial_plans WHERE user_id = '7d000000-0000-4000-8000-000000000001')
     OR EXISTS (SELECT 1 FROM public.financial_plan_forecast_points WHERE plan_id = '7d200000-0000-4000-8000-000000000001')
     OR EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE user_id = '7d000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'the deleted account must leave no user data behind';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.account_deletion_log WHERE request_id = '7d100000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'a processed request must be logged';
  END IF;

  IF (SELECT count(*) FROM auth.users WHERE id IN (
        '7d000000-0000-4000-8000-000000000002', '7d000000-0000-4000-8000-000000000003', '7d000000-0000-4000-8000-000000000004')) <> 3 THEN
    RAISE EXCEPTION 'requests that are not due, not confirmed, or cancelled must not delete accounts';
  END IF;

  IF private.process_account_deletion_queue() <> 0 THEN
    RAISE EXCEPTION 'a second run must find nothing left to delete';
  END IF;

  IF has_function_privilege('authenticated', 'private.process_account_deletion_queue(timestamptz, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.delete_user_account(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'private.delete_user_account(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'API roles must not run the deletion functions';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-account-deletions' AND schedule = '0 16 * * *') THEN
    RAISE EXCEPTION 'the daily deletion job must be scheduled';
  END IF;
END;
$$;

ROLLBACK;
