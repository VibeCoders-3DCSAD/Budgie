BEGIN;

INSERT INTO auth.users (id) VALUES ('5d000000-0000-4000-8000-000000000001'), ('5d000000-0000-4000-8000-000000000002');
INSERT INTO public.financial_accounts (id, user_id, name, kind, opening_balance_centavos, current_balance_centavos) VALUES
  ('5d000000-0000-4000-8000-0000000000a1', '5d000000-0000-4000-8000-000000000001', 'Wallet', 'cash', 1000000, 1000000),
  ('5d000000-0000-4000-8000-0000000000a2', '5d000000-0000-4000-8000-000000000001', 'Card', 'credit_card', 0, 0),
  ('5d000000-0000-4000-8000-0000000000a3', '5d000000-0000-4000-8000-000000000001', 'Thin wallet', 'cash', 15000, 15000);
INSERT INTO public.categories (id, user_id, slug, label, description, is_system) VALUES
  ('5d000000-0000-4000-8000-0000000000d1', '5d000000-0000-4000-8000-000000000001', 'bills-auto', 'Bills auto test', 'Bills auto test', false),
  ('5d000000-0000-4000-8000-0000000000d2', '5d000000-0000-4000-8000-000000000002', 'bills-other', 'Bills other test', 'Bills other test', false);
INSERT INTO public.subcategories (id, user_id, category_id, kind, slug, label, description, is_system) VALUES
  ('5d000000-0000-4000-8000-0000000000e1', '5d000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-0000000000d1', 'expense', 'rent-auto', 'Rent auto test', 'Rent auto test', false),
  ('5d000000-0000-4000-8000-0000000000e2', '5d000000-0000-4000-8000-000000000002', '5d000000-0000-4000-8000-0000000000d2', 'expense', 'rent-other', 'Rent other test', 'Rent other test', false);

INSERT INTO public.scheduled_payments (id, user_id, name, subcategory_id, source_account_id, amount_centavos, frequency, due_day_of_month, starts_on, auto_post, auto_post_from) VALUES
  -- Uncategorized and daily.
  ('5d000000-0000-4000-8000-0000000000b1', '5d000000-0000-4000-8000-000000000001', 'Padala', NULL, '5d000000-0000-4000-8000-0000000000a1', 10000, 'daily', NULL, '2026-11-01', true, '2026-11-01'),
  -- Monthly, categorized, partly paid by hand.
  ('5d000000-0000-4000-8000-0000000000b2', '5d000000-0000-4000-8000-000000000001', 'Rent', '5d000000-0000-4000-8000-0000000000e1', '5d000000-0000-4000-8000-0000000000a1', 300000, 'monthly', 2, '2026-11-01', true, '2026-11-01'),
  -- Paid from a credit card: left to the device.
  ('5d000000-0000-4000-8000-0000000000b3', '5d000000-0000-4000-8000-000000000001', 'Netflix', NULL, '5d000000-0000-4000-8000-0000000000a2', 50000, 'daily', NULL, '2026-11-01', true, '2026-11-01'),
  -- Auto-post off.
  ('5d000000-0000-4000-8000-0000000000b4', '5d000000-0000-4000-8000-000000000001', 'Manual', NULL, '5d000000-0000-4000-8000-0000000000a1', 50000, 'daily', NULL, '2026-11-01', false, NULL),
  -- Category owned by another user, so its post fails.
  ('5d000000-0000-4000-8000-0000000000b5', '5d000000-0000-4000-8000-000000000001', 'Broken', '5d000000-0000-4000-8000-0000000000e2', '5d000000-0000-4000-8000-0000000000a1', 50000, 'daily', NULL, '2026-11-01', true, '2026-11-01'),
  -- Its account covers Nov 1 but not Nov 1-3, so none of them post (as on the device).
  ('5d000000-0000-4000-8000-0000000000b6', '5d000000-0000-4000-8000-000000000001', 'Short', NULL, '5d000000-0000-4000-8000-0000000000a3', 10000, 'daily', NULL, '2026-11-01', true, '2026-11-01');

-- A manual partial payment of Rent's November 2 occurrence.
INSERT INTO public.transactions (id, user_id, transaction_type, transaction_date, amount_centavos, source_account_id, subcategory_id)
VALUES ('5d000000-0000-4000-8000-0000000000f1', '5d000000-0000-4000-8000-000000000001', 'expense', '2026-11-01', 100000, '5d000000-0000-4000-8000-0000000000a1', '5d000000-0000-4000-8000-0000000000e1');
INSERT INTO public.scheduled_payment_records (id, user_id, scheduled_payment_id, transaction_id, occurrence_date, payment_date, amount_centavos, source)
VALUES ('5d000000-0000-4000-8000-0000000000c1', '5d000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-0000000000b2', '5d000000-0000-4000-8000-0000000000f1', '2026-11-02', '2026-11-01', 100000, 'manual');

DO $$
DECLARE
  v_padala uuid := '5d000000-0000-4000-8000-0000000000b1';
  v_rent uuid := '5d000000-0000-4000-8000-0000000000b2';
  v_posted integer;
  v_dates date[];
  v_payment public.scheduled_payments;
BEGIN
  -- Ids must match scheduledPaymentPostIds on the device (apps/app/local-db/__tests__/uuid.test.ts).
  IF private.scheduled_payment_post_id('5c000000-0000-4000-8000-0000000000b1', '2026-11-05', 'transaction') <> '9f45b94d-fb39-5356-921b-4af15e3b7490'
     OR private.scheduled_payment_post_id('5c000000-0000-4000-8000-0000000000b1', '2026-11-05', 'record') <> 'ddd44214-650e-553f-a0a8-87ff51dd975a' THEN
    RAISE EXCEPTION 'server post ids must match the device';
  END IF;

  -- Due dates must match dueDatesBetween in apps/app/features/billers/schedule.ts.
  v_payment := ROW('5d000000-0000-4000-8000-0000000000ff', '5d000000-0000-4000-8000-000000000001', 'x', NULL, '5d000000-0000-4000-8000-0000000000a1', 1, 'monthly', 31, NULL, NULL, NULL,
    '2026-09-01', NULL, false, NULL, false, false, true, NULL, 'active', 1, false, now(), now(), NULL)::public.scheduled_payments;
  v_dates := ARRAY(SELECT private.scheduled_payment_due_dates(v_payment, '2026-09-01', '2026-12-31'));
  IF v_dates <> ARRAY['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31']::date[] THEN RAISE EXCEPTION 'monthly clamps to short months: %', v_dates; END IF;
  v_payment.frequency := 'semi_monthly'; v_payment.due_day_of_month := 30; v_payment.due_second_day_of_month := 15;
  v_dates := ARRAY(SELECT private.scheduled_payment_due_dates(v_payment, '2027-02-01', '2027-03-20'));
  IF v_dates <> ARRAY['2027-02-15', '2027-02-28', '2027-03-15']::date[] THEN RAISE EXCEPTION 'semi-monthly days in order: %', v_dates; END IF;
  v_payment.frequency := 'weekly'; v_payment.due_day_of_week := 5; v_payment.due_day_of_month := NULL; v_payment.due_second_day_of_month := NULL;
  v_dates := ARRAY(SELECT private.scheduled_payment_due_dates(v_payment, '2026-09-01', '2026-09-20'));
  IF v_dates <> ARRAY['2026-09-04', '2026-09-11', '2026-09-18']::date[] THEN RAISE EXCEPTION 'weekly from the first matching weekday: %', v_dates; END IF;
  v_payment.frequency := 'biweekly';
  v_dates := ARRAY(SELECT private.scheduled_payment_due_dates(v_payment, '2026-09-10', '2026-10-10'));
  IF v_dates <> ARRAY['2026-09-18', '2026-10-02']::date[] THEN RAISE EXCEPTION 'every two weeks: %', v_dates; END IF;
  v_payment.frequency := 'quarterly'; v_payment.due_day_of_week := NULL; v_payment.due_day_of_month := 20;
  v_dates := ARRAY(SELECT private.scheduled_payment_due_dates(v_payment, '2026-09-01', '2027-06-30'));
  IF v_dates <> ARRAY['2026-09-20', '2026-12-20', '2027-03-20', '2027-06-20']::date[] THEN RAISE EXCEPTION 'quarterly from the start month: %', v_dates; END IF;
  v_payment.frequency := 'yearly'; v_payment.due_day_of_month := 29; v_payment.due_month := 2;
  v_dates := ARRAY(SELECT private.scheduled_payment_due_dates(v_payment, '2026-09-01', '2028-12-31'));
  IF v_dates <> ARRAY['2027-02-28', '2028-02-29']::date[] THEN RAISE EXCEPTION 'yearly clamps to February: %', v_dates; END IF;
  v_payment.frequency := 'daily'; v_payment.due_day_of_month := NULL; v_payment.due_month := NULL; v_payment.starts_on := '2026-09-29'; v_payment.ends_on := '2026-10-01';
  v_dates := ARRAY(SELECT private.scheduled_payment_due_dates(v_payment, '2026-09-01', '2026-10-31'));
  IF v_dates <> ARRAY['2026-09-29', '2026-09-30', '2026-10-01']::date[] THEN RAISE EXCEPTION 'daily within start and end: %', v_dates; END IF;

  -- Padala: Nov 1-3 (3). Rent: the Nov 2 remainder (1). Credit card, auto-post off, the broken payment and the
  -- underfunded payment post nothing.
  v_posted := private.post_due_scheduled_payments('2026-11-03');
  IF v_posted <> 4 THEN RAISE EXCEPTION 'the first run must post 4 occurrences, posted %', v_posted; END IF;

  IF (SELECT array_agg(transaction_date ORDER BY transaction_date) FROM public.transactions WHERE merchant_name = 'Padala' AND subcategory_id IS NULL AND entry_source = 'recurring')
     <> ARRAY['2026-11-01', '2026-11-02', '2026-11-03']::date[] THEN
    RAISE EXCEPTION 'uncategorized daily posts must be named after the biller';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.scheduled_payment_records AS record JOIN public.transactions AS tx ON tx.id = record.transaction_id
     WHERE record.id = private.scheduled_payment_post_id(v_padala, '2026-11-02', 'record')
       AND tx.id = private.scheduled_payment_post_id(v_padala, '2026-11-02', 'transaction') AND record.source = 'auto'
  ) THEN RAISE EXCEPTION 'posts must use the derived ids'; END IF;
  IF (SELECT amount_centavos FROM public.transactions WHERE id = private.scheduled_payment_post_id(v_rent, '2026-11-02', 'transaction')) <> 200000 THEN
    RAISE EXCEPTION 'a partly paid occurrence posts only the remainder';
  END IF;
  IF (SELECT client_mutation_id FROM public.transactions WHERE id = private.scheduled_payment_post_id(v_padala, '2026-11-02', 'transaction'))
     <> 'scheduled-payment:' || v_padala || ':2026-11-02' THEN
    RAISE EXCEPTION 'posts must carry the biller marker the device uses';
  END IF;
  BEGIN
    INSERT INTO public.transactions (user_id, transaction_type, transaction_date, amount_centavos, source_account_id)
    VALUES ('5d000000-0000-4000-8000-000000000001', 'expense', '2026-11-02', 100, '5d000000-0000-4000-8000-0000000000a1');
    RAISE EXCEPTION 'an uncategorized expense that is not a biller payment must be rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE merchant_name IN ('Netflix', 'Manual', 'Broken', 'Short')) THEN
    RAISE EXCEPTION 'credit-card, manual, failing and underfunded payments must not post';
  END IF;

  SET CONSTRAINTS ALL IMMEDIATE;
  IF (SELECT current_balance_centavos FROM public.financial_accounts WHERE id = '5d000000-0000-4000-8000-0000000000a1') <> 1000000 - 100000 - 30000 - 200000 THEN
    RAISE EXCEPTION 'posts must reduce the account balance';
  END IF;
  SET CONSTRAINTS ALL DEFERRED;

  v_posted := private.post_due_scheduled_payments('2026-11-03');
  IF v_posted <> 0 THEN RAISE EXCEPTION 'a second run must post nothing, posted %', v_posted; END IF;

  -- A device posted Nov 4 offline and its transaction synced first: the server must not post it again.
  INSERT INTO public.transactions (id, user_id, transaction_type, transaction_date, amount_centavos, source_account_id, merchant_name, client_mutation_id)
  VALUES (private.scheduled_payment_post_id(v_padala, '2026-11-04', 'transaction'), '5d000000-0000-4000-8000-000000000001', 'expense', '2026-11-04', 10000,
          '5d000000-0000-4000-8000-0000000000a1', 'Padala', 'scheduled-payment:' || v_padala || ':2026-11-04');
  -- The user deleted the Nov 3 post: it must stay deleted.
  UPDATE public.transactions SET deleted = true, status = 'deleted', deleted_at = now() WHERE id = private.scheduled_payment_post_id(v_padala, '2026-11-03', 'transaction');
  UPDATE public.scheduled_payment_records SET deleted = true WHERE id = private.scheduled_payment_post_id(v_padala, '2026-11-03', 'record');

  v_posted := private.post_due_scheduled_payments('2026-11-05');
  IF v_posted <> 1 THEN RAISE EXCEPTION 'only Nov 5 is new, posted %', v_posted; END IF;
  IF (SELECT count(*) FROM public.transactions WHERE merchant_name = 'Padala') <> 5 THEN
    RAISE EXCEPTION 'device-posted and deleted occurrences must not be posted again';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'post-due-scheduled-payments' AND schedule = '*/5 * * * *') THEN
    RAISE EXCEPTION 'the auto-post job must run every 5 minutes';
  END IF;
END;
$$;

ROLLBACK;
