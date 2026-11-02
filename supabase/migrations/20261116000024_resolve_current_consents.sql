-- user_consents is an append-only history, so a consent's state is its newest event. Reading the
-- history with a fixed limit and checking whether any event granted the version let an older grant
-- outlive a newer withdrawal, and unrelated events could push the current terms past the limit.
-- This view keeps exactly the newest event per consent kind and version. id breaks recorded_at ties
-- so the answer is deterministic. security_invoker keeps the owner-only RLS of user_consents.
CREATE VIEW public.user_current_consents
WITH (security_invoker = true) AS
SELECT DISTINCT ON (user_id, consent_kind, version)
  user_id,
  consent_kind,
  status,
  version,
  recorded_at
FROM public.user_consents
ORDER BY user_id, consent_kind, version, recorded_at DESC, id DESC;

REVOKE ALL ON public.user_current_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_current_consents TO authenticated, service_role;
