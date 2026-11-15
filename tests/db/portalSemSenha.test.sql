\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE TEMP TABLE t_tok(token text);
GRANT ALL ON t_tok TO PUBLIC;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000f7','PS Clinica','ps-clinica'),('20000000-0000-0000-0000-0000000000f8','PS Outra','ps-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('10000000-0000-0000-0000-0000000000f7','ps-recep@test',now()),
('10000000-0000-0000-0000-0000000000f8','ps-outra@test',now()),
('10000000-0000-0000-0000-0000000000f9','ps-paciente@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000f7','20000000-0000-0000-0000-0000000000f7','receptionist',true),
('10000000-0000-0000-0000-0000000000f8','20000000-0000-0000-0000-0000000000f8','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name,date_of_birth) VALUES ('70000000-0000-0000-0000-0000000000f7','20000000-0000-0000-0000-0000000000f7','Gabi Rocha','1995-07-01');
INSERT INTO public.patient_users(patient_id,clinic_id,auth_user_id,status) VALUES ('70000000-0000-0000-0000-0000000000f7','20000000-0000-0000-0000-0000000000f7','10000000-0000-0000-0000-0000000000f9','active');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000f8';
DO $$ BEGIN
  PERFORM public.create_portal_link('70000000-0000-0000-0000-0000000000f7');
  RAISE EXCEPTION 'ASSERT: other clinic';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: other clinic cannot create portal link';
END $$;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000f7';
INSERT INTO t_tok SELECT public.create_portal_link('70000000-0000-0000-0000-0000000000f7') ->> 'token';

SET LOCAL ROLE anon;
RESET request.jwt.claim.sub;
SELECT pg_temp.assert_true((SELECT public.portal_link_status((SELECT token FROM t_tok)) ->> 'first_name' = 'Gabi'), 'status shows first name');
SELECT pg_temp.assert_true((SELECT public.portal_link_status((SELECT token FROM t_tok)) ->> 'identity_check' = 'birth_date'), 'asks birth date');
DO $$ BEGIN
  PERFORM public.portal_link_check((SELECT token FROM t_tok), '1995-07-01');
  RAISE EXCEPTION 'ASSERT: anon checks link';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: only the server checks the link';
END $$;

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true((SELECT public.portal_link_check((SELECT token FROM t_tok), '2000-01-01') ->> 'reason' = 'identity'), 'wrong birth date refused');
SELECT pg_temp.assert_true((SELECT public.portal_link_check((SELECT token FROM t_tok), '1995-07-01') ->> 'patient_id' = '70000000-0000-0000-0000-0000000000f7'), 'right data returns patient');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000f9';
SELECT pg_temp.assert_true((SELECT length(public.create_my_anamnese_link() ->> 'token') = 64), 'patient creates own anamnese link');
SELECT pg_temp.assert_true((SELECT public.my_portal_summary() ->> 'has_birth_date' = 'true'), 'portal summary');
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000f7';
DO $$ BEGIN
  PERFORM public.create_my_anamnese_link();
  RAISE EXCEPTION 'ASSERT: staff without portal';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: needs portal access';
END $$;

RESET ROLE;
SELECT pg_temp.assert_true((SELECT failed_attempts = 1 AND use_count = 1 FROM public.portal_links), 'attempts and uses counted');

ROLLBACK;
