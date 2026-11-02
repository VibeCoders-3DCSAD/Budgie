-- These SECURITY DEFINER functions write rows for whatever p_user_id the caller passes and never
-- compare it with auth.uid(). Supabase grants new public functions to anon and authenticated by
-- default, so revoking only from PUBLIC (or PUBLIC and authenticated) still left them callable with
-- the anon key. Only trusted server code (the service role and the auth-user trigger, which runs as
-- the function owner) may call them.
REVOKE ALL ON FUNCTION public.write_daily_financial_report(uuid, date, text, text, date, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_daily_financial_report(uuid, date, text, text, date, jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.seed_hfce_taxonomy_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_hfce_taxonomy_for_user(uuid) TO service_role;

DO $$
BEGIN
  -- Older installs may still carry the subcategory-only seeder.
  IF to_regprocedure('public.seed_hfce_subcategories_for_user(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.seed_hfce_subcategories_for_user(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.seed_hfce_subcategories_for_user(uuid) TO service_role;
  END IF;
END;
$$;
