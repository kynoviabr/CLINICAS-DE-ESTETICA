\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000f5','LG Clinica','lg-clinica');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-0000000000f5','lg-admin@test',now()),('10000000-0000-0000-0000-0000000000f6','lg-recep@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000f5','20000000-0000-0000-0000-0000000000f5','admin',true),
('10000000-0000-0000-0000-0000000000f6','20000000-0000-0000-0000-0000000000f5','receptionist',true);
INSERT INTO public.patients(id,clinic_id,full_name,cpf,phone,email,date_of_birth) VALUES ('70000000-0000-0000-0000-0000000000f5','20000000-0000-0000-0000-0000000000f5','Lia Gomes','12345678909','11911112222','lia@test','1990-01-01');
INSERT INTO public.patient_anamneses(anamnese_number,clinic_id,patient_id,form_data,status) VALUES
('', '20000000-0000-0000-0000-0000000000f5','70000000-0000-0000-0000-0000000000f5','{"consent":{"agrees_terms":true,"agrees_data_usage":true,"agrees_photos":true,"agrees_photos_marketing":false}}','filled');
INSERT INTO public.patient_photos(id,clinic_id,patient_id,photo_url) VALUES ('d0000000-0000-0000-0000-0000000000f5','20000000-0000-0000-0000-0000000000f5','70000000-0000-0000-0000-0000000000f5','x/y.webp');

SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM public.patient_consents), 'consents from anamnese');
SELECT pg_temp.assert_true(public.patient_consent_granted('70000000-0000-0000-0000-0000000000f5','photos_clinical'), 'photos consent');
SELECT pg_temp.assert_true(NOT public.patient_consent_granted('70000000-0000-0000-0000-0000000000f5','image_marketing'), 'no marketing consent');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000f6';
DO $$ BEGIN
  UPDATE public.patient_photos SET marketing_allowed = true WHERE id = 'd0000000-0000-0000-0000-0000000000f5';
  RAISE EXCEPTION 'ASSERT: marketing without consent';
EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'PASS: marketing blocked without consent';
END $$;
SELECT public.set_patient_consent('70000000-0000-0000-0000-0000000000f5','image_marketing', true, 'autorizou por escrito');
UPDATE public.patient_photos SET marketing_allowed = true WHERE id = 'd0000000-0000-0000-0000-0000000000f5';
SELECT pg_temp.assert_true((SELECT marketing_allowed FROM public.patient_photos), 'marketing after consent');
SELECT public.set_patient_consent('70000000-0000-0000-0000-0000000000f5','image_marketing', false, 'revogou');
SELECT pg_temp.assert_true((SELECT NOT marketing_allowed FROM public.patient_photos), 'revoking removes photos from marketing');
DO $$ BEGIN
  PERFORM public.export_patient_data('70000000-0000-0000-0000-0000000000f5');
  RAISE EXCEPTION 'ASSERT: receptionist exported';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: only admin exports';
END $$;

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000f5';
SELECT pg_temp.assert_true((SELECT public.export_patient_data('70000000-0000-0000-0000-0000000000f5') -> 'patient' ->> 'cpf' = '12345678909'), 'export has data');
DO $$ BEGIN
  PERFORM public.anonymize_patient('70000000-0000-0000-0000-0000000000f5', 'sim');
  RAISE EXCEPTION 'ASSERT: anonymize without confirm';
EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'PASS: needs confirmation word';
END $$;
SELECT public.anonymize_patient('70000000-0000-0000-0000-0000000000f5', 'anonimizar');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT cpf IS NULL AND phone IS NULL AND email IS NULL AND date_of_birth IS NULL AND full_name LIKE 'Paciente anonimizado%' AND anonymized_at IS NOT NULL FROM public.patients), 'personal data removed');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.patient_anamneses), 'clinical record kept');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.access_logs WHERE action IN ('data_export','data_anonymize')), 'export and anonymize logged');
ROLLBACK;
