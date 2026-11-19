\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000d1','AU Clinica','au-clinica'),('20000000-0000-0000-0000-0000000000d2','AU Outra','au-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('10000000-0000-0000-0000-0000000000d1','au-admin@test',now()),
('10000000-0000-0000-0000-0000000000d2','au-recep@test',now()),
('10000000-0000-0000-0000-0000000000d3','au-outra@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-0000000000d1','admin',true),
('10000000-0000-0000-0000-0000000000d2','20000000-0000-0000-0000-0000000000d1','receptionist',true),
('10000000-0000-0000-0000-0000000000d3','20000000-0000-0000-0000-0000000000d2','admin',true);
INSERT INTO public.automation_runs(clinic_id,status,detail) VALUES ('20000000-0000-0000-0000-0000000000d1','sent','ok');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000d1';
INSERT INTO public.clinic_automations(clinic_id, reminder_enabled, reminder_hours_before) VALUES ('20000000-0000-0000-0000-0000000000d1', true, 24);
SELECT pg_temp.assert_true((SELECT reminder_enabled FROM public.clinic_automations), 'admin saves automation');
DO $$ BEGIN
  UPDATE public.clinic_automations SET reminder_hours_before = 200;
  RAISE EXCEPTION 'ASSERT: hours out of range';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: hours limited 2..72';
END $$;
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.automation_runs), 'staff sees runs');

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000d2';
UPDATE public.clinic_automations SET reminder_enabled = false;
SELECT pg_temp.assert_true((SELECT reminder_enabled FROM public.clinic_automations), 'receptionist cannot change');
DO $$ BEGIN
  INSERT INTO public.automation_runs(clinic_id,status) VALUES ('20000000-0000-0000-0000-0000000000d1','sent');
  RAISE EXCEPTION 'ASSERT: staff inserts runs';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: staff cannot write runs';
END $$;

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000d3';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.clinic_automations), 'other clinic sees no settings');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.automation_runs), 'other clinic sees no runs');

ROLLBACK;
