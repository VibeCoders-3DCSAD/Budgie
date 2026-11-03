-- The deletion request route checked for an active request and then inserted in a separate
-- request, so two concurrent submissions could both see none and schedule two deletions. The
-- database now allows at most one active deletion request per user.

-- Keep only the newest active request per user so the unique index can be built.
UPDATE public.account_deletion_requests AS stale
SET status = 'cancelled',
    cancelled_at = COALESCE(stale.cancelled_at, now())
WHERE stale.status IN ('requested', 'processing')
  AND EXISTS (
    SELECT 1
    FROM public.account_deletion_requests AS newer
    WHERE newer.user_id = stale.user_id
      AND newer.status IN ('requested', 'processing')
      AND (newer.requested_at, newer.id) > (stale.requested_at, stale.id)
  );

CREATE UNIQUE INDEX account_deletion_requests_one_active_per_user_idx
  ON public.account_deletion_requests (user_id)
  WHERE status IN ('requested', 'processing');
