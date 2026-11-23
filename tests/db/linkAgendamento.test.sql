\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE TEMP TABLE t_link(token text);
GRANT ALL ON t_link TO PUBLIC;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000c1','LA Clinica','la-clinica'),('20000000-0000-0000-0000-0000000000c2','LA Outra','la-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-0000000000c1','la-recep@test',now()),('10000000-0000-0000-0000-0000000000c2','la-outra@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000c1','20000000-0000-0000-0000-0000000000c1','receptionist',true),
('10000000-0000-0000-0000-0000000000c2','20000000-0000-0000-0000-0000000000c2','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name) VALUES ('70000000-0000-0000-0000-0000000000c1','20000000-0000-0000-0000-0000000000c1','Carla Dias');
INSERT INTO public.appointments(id,clinic_id,patient_id,start_time,end_time,status) VALUES
('a0000000-0000-0000-0000-0000000000c1','20000000-0000-0000-0000-0000000000c1','70000000-0000-0000-0000-0000000000c1',now()+interval '2 days',now()+interval '2 days 1 hour','scheduled'),
('a0000000-0000-0000-0000-0000000000c2','20000000-0000-0000-0000-0000000000c1','70000000-0000-0000-0000-0000000000c1',now()-interval '1 day',now()-interval '23 hours','scheduled'),
('a0000000-0000-0000-0000-0000000000c3','20000000-0000-0000-0000-0000000000c1','70000000-0000-0000-0000-0000000000c1',now()+interval '3 days',now()+interval '3 days 1 hour','cancelled');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c2';
DO $$ BEGIN
  PERFORM public.create_appointment_link('a0000000-0000-0000-0000-0000000000c1');
  RAISE EXCEPTION 'ASSERT: other clinic should not create link';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: other clinic cannot create link';
END $$;

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c1';
DO $$ BEGIN
  PERFORM public.create_appointment_link('a0000000-0000-0000-0000-0000000000c2');
  RAISE EXCEPTION 'ASSERT: past appointment';
EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'PASS: past appointment refused';
END $$;
DO $$ BEGIN
  PERFORM public.create_appointment_link('a0000000-0000-0000-0000-0000000000c3');
  RAISE EXCEPTION 'ASSERT: cancelled appointment';
EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'PASS: cancelled appointment refused';
END $$;
INSERT INTO t_link SELECT public.create_appointment_link('a0000000-0000-0000-0000-0000000000c1') ->> 'token';
SELECT pg_temp.assert_true((SELECT length(token) = 64 FROM t_link), 'token created');
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND bool_and(token_hash <> (SELECT token FROM t_link) AND length(token_hash) = 64) FROM public.appointment_links), 'only hash stored');
SELECT pg_temp.assert_true((SELECT l.expires_at = a.start_time FROM public.appointment_links l JOIN public.appointments a ON a.id = l.appointment_id), 'expires at appointment time');
DO $$ BEGIN
  UPDATE public.appointment_links SET expires_at = now() + interval '30 days';
  IF FOUND THEN RAISE EXCEPTION 'ASSERT: staff should not update links'; END IF;
  RAISE NOTICE 'PASS: no direct update';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: no direct update';
END $$;

SET LOCAL ROLE anon;
RESET request.jwt.claim.sub;
DO $$ BEGIN
  PERFORM 1 FROM public.appointment_links;
  IF FOUND THEN RAISE EXCEPTION 'ASSERT: anon reads links'; END IF;
  RAISE NOTICE 'PASS: anon reads no links';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon reads no links';
END $$;
DO $$ BEGIN
  PERFORM public.create_appointment_link('a0000000-0000-0000-0000-0000000000c1');
  RAISE EXCEPTION 'ASSERT: anon creates link';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot create link';
END $$;

ROLLBACK;
