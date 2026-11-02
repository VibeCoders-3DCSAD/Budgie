-- Onboarding now keeps only the answers behind the four financial health checks
-- and the seasonal preferences. The eligibility profile, Metro Manila data, and
-- retired questionnaire answers have no remaining readers.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    NEW.id,
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'display_name', '')), '')
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_privacy_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM seed_hfce_taxonomy_for_user(NEW.id);

  RETURN NEW;
END;
$$;

DROP TABLE IF EXISTS public.user_eligibility_profiles;
DROP TABLE IF EXISTS public.metro_manila_localities;
DROP TYPE IF EXISTS public.odin_metro_manila_presence;
DROP TYPE IF EXISTS public.odin_employment_classification;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS metro_manila_city;

-- The API rejects retired answer keys, so drafts still holding them could not be submitted.
UPDATE public.onboarding_sessions
SET raw_answers = raw_answers - ARRAY[
  'display_name', 'date_of_birth', 'is_filipino', 'metro_manila_presence', 'metro_manila_locality_code',
  'primary_employment_classification', 'employment_status', 'monthly_deductions', 'monthly_deduction_amounts',
  'liquid_emergency_savings', 'monthly_debt_payments', 'credit_card_payment_behavior',
  'protected_categories', 'protected_category_costs', 'has_dependents'
]
WHERE status = 'in_progress';

-- Retired option values are cleared so the questionnaire asks those steps again.
UPDATE public.onboarding_sessions
SET raw_answers = raw_answers - 'credit_card_revolving_months'
WHERE status = 'in_progress'
  AND raw_answers ->> 'credit_card_revolving_months' NOT IN ('no_credit_card', 'always_before_due', '1_to_11_months', 'over_a_year');

UPDATE public.onboarding_sessions
SET raw_answers = raw_answers - 'emergency_savings_runway'
WHERE status = 'in_progress'
  AND raw_answers ->> 'emergency_savings_runway' NOT IN ('1_month', '2_months', '3_months', 'more_than_3_months', 'not_sure');
