-- Requesting a new export used to cancel the active one and insert its replacement in two
-- separate requests. A failed insert left the user with no export, and concurrent requests could
-- interleave and leave several active. The replacement now runs in one transaction, and the
-- database allows at most one active export per user.

-- Keep only the newest active request per user so the unique index can be built.
UPDATE public.data_export_requests AS stale
SET status = 'cancelled'
WHERE stale.status IN ('requested', 'processing')
  AND EXISTS (
    SELECT 1
    FROM public.data_export_requests AS newer
    WHERE newer.user_id = stale.user_id
      AND newer.status IN ('requested', 'processing')
      AND (newer.requested_at, newer.id) > (stale.requested_at, stale.id)
  );

CREATE UNIQUE INDEX data_export_requests_one_active_per_user_idx
  ON public.data_export_requests (user_id)
  WHERE status IN ('requested', 'processing');

-- Runs as the caller, so the owner-only RLS on data_export_requests still applies.
CREATE FUNCTION public.replace_data_export_request(p_metadata jsonb)
RETURNS TABLE (id uuid, status public.odin_request_status)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Serializes this user's replacements so a concurrent one waits instead of failing on the index.
  PERFORM pg_advisory_xact_lock(hashtextextended('data_export_requests:' || v_user_id::text, 0));

  UPDATE public.data_export_requests AS active
  SET status = 'cancelled'
  WHERE active.user_id = v_user_id
    AND active.status IN ('requested', 'processing');

  RETURN QUERY
  INSERT INTO public.data_export_requests (user_id, metadata)
  VALUES (v_user_id, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING data_export_requests.id, data_export_requests.status;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_data_export_request(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_data_export_request(jsonb) TO authenticated, service_role;
