\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000d9','DE Clinica','de-clinica');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-0000000000d7','de-admin@test',now()),('10000000-0000-0000-0000-0000000000d8','de-recep@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000d7','20000000-0000-0000-0000-0000000000d9','admin',true),
('10000000-0000-0000-0000-0000000000d8','20000000-0000-0000-0000-0000000000d9','receptionist',true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000d7';
SELECT pg_temp.assert_true((public.my_mfa_policy() ->> 'required')::boolean, 'admin always required');
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000d8';
SELECT pg_temp.assert_true(NOT (public.my_mfa_policy() ->> 'required')::boolean, 'receptionist not required by default');
DO $$ BEGIN
  PERFORM public.set_clinic_mfa_required_all('20000000-0000-0000-0000-0000000000d9', true);
  RAISE EXCEPTION 'ASSERT: receptionist changed policy';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: only admin changes policy';
END $$;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000d7';
SELECT public.set_clinic_mfa_required_all('20000000-0000-0000-0000-0000000000d9', true);
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000d8';
SELECT pg_temp.assert_true((public.my_mfa_policy() ->> 'required')::boolean, 'receptionist required when clinic demands');
ROLLBACK;
