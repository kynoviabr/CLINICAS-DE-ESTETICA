\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES
('20000000-0000-0000-0000-000000000071','PI A','pi-a'),
('20000000-0000-0000-0000-000000000072','PI B','pi-b');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000071','pi-dona@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES ('10000000-0000-0000-0000-000000000071','20000000-0000-0000-0000-000000000071','admin',true);

-- Profissional com login e parceira sem login
INSERT INTO public.professionals(id,clinic_id,user_id,full_name,status) VALUES
('30000000-0000-0000-0000-000000000071','20000000-0000-0000-0000-000000000071','10000000-0000-0000-0000-000000000071','Dona','active'),
('30000000-0000-0000-0000-000000000072','20000000-0000-0000-0000-000000000071',NULL,'Parceira sem login','active'),
('30000000-0000-0000-0000-000000000073','20000000-0000-0000-0000-000000000072',NULL,'Outra clínica','active');
SELECT pg_temp.assert_true(true,'professional without login allowed');

-- Parceira sem login tem agenda
INSERT INTO public.professional_availability(clinic_id,professional_id,day_of_week,start_time,end_time,is_active)
VALUES ('20000000-0000-0000-0000-000000000071','30000000-0000-0000-0000-000000000072',1,'09:00','18:00',true);
INSERT INTO public.appointments(clinic_id,professional_id,start_time,end_time,status,appointment_type)
VALUES ('20000000-0000-0000-0000-000000000071','30000000-0000-0000-0000-000000000072',now()+interval '1 day',now()+interval '1 day 1 hour','scheduled','session');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.appointments WHERE professional_id='30000000-0000-0000-0000-000000000072'),'no-login professional gets appointments');

-- O login não serve mais como profissional
DO $$ BEGIN
  INSERT INTO public.appointments(clinic_id,professional_id,start_time,end_time,status,appointment_type)
  VALUES ('20000000-0000-0000-0000-000000000071','10000000-0000-0000-0000-000000000071',now(),now()+interval '1 hour','scheduled','session');
  RAISE EXCEPTION 'ASSERT: user id must not be accepted as professional';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: login id rejected as professional';
END $$;

-- Profissional de outra clínica é recusado
DO $$ BEGIN
  INSERT INTO public.professional_availability(clinic_id,professional_id,day_of_week,start_time,end_time,is_active)
  VALUES ('20000000-0000-0000-0000-000000000071','30000000-0000-0000-0000-000000000073',2,'09:00','18:00',true);
  RAISE EXCEPTION 'ASSERT: other clinic professional should fail';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: other clinic professional rejected';
END $$;

-- Meu cadastro de profissional
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000071';
SELECT pg_temp.assert_true(public.my_professional_id('20000000-0000-0000-0000-000000000071') = '30000000-0000-0000-0000-000000000071','my_professional_id resolves own record');
SELECT pg_temp.assert_true(public.my_professional_id('20000000-0000-0000-0000-000000000072') IS NULL,'no record in other clinic');
RESET request.jwt.claim.sub;

-- Histórico protegido: não apaga profissional com atendimento
DO $$ BEGIN
  DELETE FROM public.professionals WHERE id='30000000-0000-0000-0000-000000000072';
  RAISE EXCEPTION 'ASSERT: delete with appointments should fail';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: professional with history cannot be deleted';
END $$;

ROLLBACK;
