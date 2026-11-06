\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES
('20000000-0000-0000-0000-0000000000d1','FT Clinica','ft-clinica'),
('20000000-0000-0000-0000-0000000000d2','FT Outra','ft-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('10000000-0000-0000-0000-0000000000d1','ft-recep@test',now()),
('10000000-0000-0000-0000-0000000000d2','ft-outra@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-0000000000d1','receptionist',true),
('10000000-0000-0000-0000-0000000000d2','20000000-0000-0000-0000-0000000000d2','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name) VALUES ('70000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-0000000000d1','Paciente Foto');
INSERT INTO public.patient_photos(id,clinic_id,patient_id,photo_url,photo_type) VALUES
('80000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-0000000000d1','70000000-0000-0000-0000-0000000000d1','c/p/x.webp','progress');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000d1';
UPDATE public.patient_photos SET photo_type='before', description='frontal' WHERE id='80000000-0000-0000-0000-0000000000d1';
SELECT pg_temp.assert_true((SELECT photo_type = 'before' AND description = 'frontal' FROM public.patient_photos WHERE id='80000000-0000-0000-0000-0000000000d1'), 'staff edits photo label and comment');

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000d2';
UPDATE public.patient_photos SET description='invadido' WHERE id='80000000-0000-0000-0000-0000000000d1';
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT pg_temp.assert_true((SELECT description = 'frontal' FROM public.patient_photos WHERE id='80000000-0000-0000-0000-0000000000d1'), 'other clinic cannot edit');

ROLLBACK;
