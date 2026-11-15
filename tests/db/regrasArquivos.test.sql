\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000b1','RA Clinica','ra-clinica'),('20000000-0000-0000-0000-0000000000b2','RA Outra','ra-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('10000000-0000-0000-0000-0000000000b1','ra-ativo@test',now()),
('10000000-0000-0000-0000-0000000000b2','ra-inativo@test',now()),
('10000000-0000-0000-0000-0000000000b3','ra-outra@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-0000000000b1','admin',true),
('10000000-0000-0000-0000-0000000000b2','20000000-0000-0000-0000-0000000000b1','admin',false),
('10000000-0000-0000-0000-0000000000b3','20000000-0000-0000-0000-0000000000b2','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name) VALUES ('70000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-0000000000b1','Bia Reis');
INSERT INTO storage.objects(bucket_id,name) VALUES
('patient-files','20000000-0000-0000-0000-0000000000b1/70000000-0000-0000-0000-0000000000b1/exame.pdf'),
('patient-photos','20000000-0000-0000-0000-0000000000b1/70000000-0000-0000-0000-0000000000b1/foto.jpg');

SELECT pg_temp.assert_true(public.is_clinic_staff('10000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-0000000000b1'), 'active staff');
SELECT pg_temp.assert_true(NOT public.is_clinic_staff('10000000-0000-0000-0000-0000000000b2','20000000-0000-0000-0000-0000000000b1'), 'inactive is not staff');
SELECT pg_temp.assert_true(NOT public.has_clinic_role('10000000-0000-0000-0000-0000000000b2','20000000-0000-0000-0000-0000000000b1','admin'), 'inactive has no clinic role');
SELECT pg_temp.assert_true(NOT public.has_role('10000000-0000-0000-0000-0000000000b2','admin'), 'inactive has no role');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000b1';
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM storage.objects), 'active staff sees clinic files');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.patients), 'active staff sees patient');

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000b2';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM storage.objects), 'inactive sees no files');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.patients), 'inactive sees no patients');
DO $$ BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES ('patient-files','20000000-0000-0000-0000-0000000000b1/70000000-0000-0000-0000-0000000000b1/x.pdf');
  RAISE EXCEPTION 'ASSERT: inactive should not upload';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: inactive cannot upload';
END $$;

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000b3';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM storage.objects), 'other clinic sees no files');
DO $$ BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES ('patient-files','20000000-0000-0000-0000-0000000000b1/70000000-0000-0000-0000-0000000000b1/y.pdf');
  RAISE EXCEPTION 'ASSERT: other clinic should not upload';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: other clinic cannot upload';
END $$;

RESET ROLE;
SELECT pg_temp.assert_true((SELECT file_size_limit = 15728640 AND allowed_mime_types = ARRAY['image/*'] FROM storage.buckets WHERE id = 'patient-photos'), 'photo limits');

ROLLBACK;
