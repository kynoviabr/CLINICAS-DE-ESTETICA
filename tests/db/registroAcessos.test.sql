\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000e9','RA2 Clinica','ra2-clinica'),('20000000-0000-0000-0000-0000000000e8','RA2 Outra','ra2-outra');
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
('10000000-0000-0000-0000-0000000000e7','ra2-admin@test',now(),'{"full_name":"Ana Admin"}'),
('10000000-0000-0000-0000-0000000000e8','ra2-recep@test',now(),'{"full_name":"Rita Recep"}'),
('10000000-0000-0000-0000-0000000000e9','ra2-outra@test',now(),NULL);
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000e7','20000000-0000-0000-0000-0000000000e9','admin',true),
('10000000-0000-0000-0000-0000000000e8','20000000-0000-0000-0000-0000000000e9','receptionist',true),
('10000000-0000-0000-0000-0000000000e9','20000000-0000-0000-0000-0000000000e8','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name) VALUES ('70000000-0000-0000-0000-0000000000e9','20000000-0000-0000-0000-0000000000e9','Paula Prado');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000e8';
SELECT public.log_patient_access('70000000-0000-0000-0000-0000000000e9', 'record_view');
SELECT public.log_patient_access('70000000-0000-0000-0000-0000000000e9', 'record_view');
SELECT public.log_patient_access('70000000-0000-0000-0000-0000000000e9', 'photos_view');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.access_logs), 'receptionist cannot read log');
DO $$ BEGIN
  PERFORM public.access_log_list('20000000-0000-0000-0000-0000000000e9');
  RAISE EXCEPTION 'ASSERT: receptionist lists log';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: only admin lists log';
END $$;
DO $$ BEGIN
  INSERT INTO public.access_logs(clinic_id,user_id,action) VALUES ('20000000-0000-0000-0000-0000000000e9','10000000-0000-0000-0000-0000000000e8','record_view');
  RAISE EXCEPTION 'ASSERT: direct insert';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: no direct insert';
END $$;

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000e9';
SELECT public.log_patient_access('70000000-0000-0000-0000-0000000000e9', 'record_view');

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000e7';
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.access_log_list('20000000-0000-0000-0000-0000000000e9')), 'repeat ignored and other clinic not logged');
SELECT pg_temp.assert_true((SELECT bool_and(user_name = 'Rita Recep' AND patient_name = 'Paula Prado') FROM public.access_log_list('20000000-0000-0000-0000-0000000000e9')), 'names shown');

RESET ROLE;
DO $$ BEGIN
  DELETE FROM public.access_logs;
  RAISE EXCEPTION 'ASSERT: delete allowed';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: log cannot be deleted';
END $$;
DO $$ BEGIN
  UPDATE public.access_logs SET action = 'file_view';
  RAISE EXCEPTION 'ASSERT: update allowed';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: log cannot be changed';
END $$;
DELETE FROM public.patients WHERE id = '70000000-0000-0000-0000-0000000000e9';
SELECT pg_temp.assert_true((SELECT count(*) = 2 AND bool_and(patient_id IS NULL) FROM public.access_logs), 'patient deletion keeps log without link');
ROLLBACK;
