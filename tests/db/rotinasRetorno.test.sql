\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000a9','RR Clinica','rr-clinica'),('20000000-0000-0000-0000-0000000000a8','RR Outra','rr-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-0000000000a9','rr@test',now()),('10000000-0000-0000-0000-0000000000a8','rr-outra@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000a9','20000000-0000-0000-0000-0000000000a9','receptionist',true),
('10000000-0000-0000-0000-0000000000a8','20000000-0000-0000-0000-0000000000a8','admin',true);
INSERT INTO public.treatments(id,clinic_id,name,price,maintenance_days) VALUES ('80000000-0000-0000-0000-0000000000a9','20000000-0000-0000-0000-0000000000a9','Toxina',900,120);
INSERT INTO public.patients(id,clinic_id,full_name,phone,date_of_birth) VALUES
('70000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a9','Manu Tenção','11900000001',NULL),
('70000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-0000000000a9','Sumida Silva','11900000002',NULL),
('70000000-0000-0000-0000-0000000000a3','20000000-0000-0000-0000-0000000000a9','Ani Versário','11900000003',(current_date - interval '30 years' + interval '3 days')::date),
('70000000-0000-0000-0000-0000000000a4','20000000-0000-0000-0000-0000000000a9','Já Marcou','11900000004',NULL);
INSERT INTO public.appointments(clinic_id,patient_id,treatment_id,start_time,end_time,status) VALUES
('20000000-0000-0000-0000-0000000000a9','70000000-0000-0000-0000-0000000000a1','80000000-0000-0000-0000-0000000000a9',now()-interval '118 days',now()-interval '118 days'+interval '1 hour','completed'),
('20000000-0000-0000-0000-0000000000a9','70000000-0000-0000-0000-0000000000a2',NULL,now()-interval '90 days',now()-interval '90 days'+interval '1 hour','completed'),
('20000000-0000-0000-0000-0000000000a9','70000000-0000-0000-0000-0000000000a4',NULL,now()-interval '90 days',now()-interval '90 days'+interval '1 hour','completed'),
('20000000-0000-0000-0000-0000000000a9','70000000-0000-0000-0000-0000000000a4',NULL,now()+interval '5 days',now()+interval '5 days'+interval '1 hour','scheduled');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000a9';
CREATE TEMP TABLE t_l AS SELECT * FROM public.retention_lists('20000000-0000-0000-0000-0000000000a9');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM t_l WHERE kind='maintenance' AND full_name='Manu Tenção'), 'maintenance due listed');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM t_l WHERE kind='inactive' AND full_name='Sumida Silva'), 'inactive listed');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM t_l WHERE full_name='Já Marcou'), 'patient with future booking hidden');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM t_l WHERE kind='birthday' AND full_name='Ani Versário'), 'birthday listed');
INSERT INTO public.retention_contacts(clinic_id,patient_id,kind,contacted_by) VALUES ('20000000-0000-0000-0000-0000000000a9','70000000-0000-0000-0000-0000000000a2','inactive','10000000-0000-0000-0000-0000000000a9');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.retention_lists('20000000-0000-0000-0000-0000000000a9') WHERE full_name='Sumida Silva'), 'contacted hidden for 30 days');
SELECT pg_temp.assert_true((SELECT contacted = 1 FROM public.retention_results('20000000-0000-0000-0000-0000000000a9', current_date - 1, current_date + 1) WHERE kind='inactive'), 'results count contact');

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000a8';
DO $$ BEGIN
  PERFORM * FROM public.retention_lists('20000000-0000-0000-0000-0000000000a9');
  RAISE EXCEPTION 'ASSERT: other clinic';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: other clinic denied';
END $$;
DO $$ BEGIN
  INSERT INTO public.retention_contacts(clinic_id,patient_id,kind,contacted_by) VALUES ('20000000-0000-0000-0000-0000000000a9','70000000-0000-0000-0000-0000000000a1','inactive','10000000-0000-0000-0000-0000000000a8');
  RAISE EXCEPTION 'ASSERT: other clinic insert';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: other clinic cannot record contact';
END $$;

ROLLBACK;
