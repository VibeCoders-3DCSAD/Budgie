-- Confirmed account deletion requests form a queue. A daily pg_cron job deletes every account whose
-- scheduled_delete_at has passed. Each account is deleted in its own subtransaction, so one failure
-- does not block the rest; a failed request stays queued and is retried the next day.

-- What remains of a processed request once the account is gone. It holds no user id or personal data,
-- because the request row itself is removed with the account.
CREATE TABLE private.account_deletion_log (
  request_id uuid PRIMARY KEY,
  requested_at timestamptz NOT NULL,
  scheduled_delete_at timestamptz,
  completed_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.account_deletion_log FROM PUBLIC, anon, authenticated;

-- Deletes the account and all its data. Everything owned by the user cascades from auth.users,
-- except financial plans, whose foreign keys have no ON DELETE rule and must go first.
CREATE FUNCTION private.delete_user_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required';
  END IF;

  DELETE FROM public.financial_plan_allocations
   WHERE plan_id IN (SELECT id FROM public.financial_plans WHERE user_id = p_user_id);
  DELETE FROM public.financial_plan_debt_reservations
   WHERE plan_id IN (SELECT id FROM public.financial_plans WHERE user_id = p_user_id);
  DELETE FROM public.financial_plan_savings_reservations
   WHERE plan_id IN (SELECT id FROM public.financial_plans WHERE user_id = p_user_id);
  DELETE FROM public.financial_plan_forecast_points
   WHERE plan_id IN (SELECT id FROM public.financial_plans WHERE user_id = p_user_id);
  DELETE FROM public.financial_plans WHERE user_id = p_user_id;

  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

-- Deletes every account whose confirmed request is due. SKIP LOCKED lets an overlapping run pass over
-- requests another run is already handling. Returns the number of accounts deleted.
CREATE FUNCTION private.process_account_deletion_queue(p_now timestamptz DEFAULT now(), p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request record;
  v_deleted integer := 0;
BEGIN
  FOR v_request IN
    SELECT request.id, request.user_id, request.requested_at, request.scheduled_delete_at
      FROM public.account_deletion_requests AS request
     WHERE request.status = 'processing'
       AND request.confirmed_at IS NOT NULL
       AND request.scheduled_delete_at <= p_now
     ORDER BY request.scheduled_delete_at, request.id
     LIMIT p_limit
       FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      INSERT INTO private.account_deletion_log (request_id, requested_at, scheduled_delete_at)
      VALUES (v_request.id, v_request.requested_at, v_request.scheduled_delete_at);
      PERFORM private.delete_user_account(v_request.user_id);
      v_deleted := v_deleted + 1;
    EXCEPTION WHEN OTHERS THEN
      -- The subtransaction rolled back, so the request is still queued. Record the attempt on it.
      UPDATE public.account_deletion_requests AS request
         SET metadata = request.metadata || jsonb_build_object(
               'deletion_attempts', COALESCE((request.metadata->>'deletion_attempts')::integer, 0) + 1,
               'last_deletion_error', SQLSTATE,
               'last_deletion_attempt_at', p_now)
       WHERE request.id = v_request.id;
      RAISE WARNING 'account deletion request % failed: % %', v_request.id, SQLSTATE, SQLERRM;
    END;
  END LOOP;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION private.delete_user_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.process_account_deletion_queue(timestamptz, integer) FROM PUBLIC, anon, authenticated;

-- Midnight in Asia/Manila (16:00 UTC).
SELECT cron.schedule('process-account-deletions', '0 16 * * *', 'SELECT private.process_account_deletion_queue()');
