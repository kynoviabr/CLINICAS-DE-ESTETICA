\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE TEMP TABLE t_link(token text);
GRANT ALL ON t_link TO PUBLIC;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000f1','AL Clinica','al-clinica'),('20000000-0000-0000-0000-0000000000f2','AL Outra','al-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-0000000000f1','al-recep@test',now()),('10000000-0000-0000-0000-0000000000f2','al-outra@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000f1','20000000-0000-0000-0000-0000000000f1','receptionist',true),
('10000000-0000-0000-0000-0000000000f2','20000000-0000-0000-0000-0000000000f2','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name,date_of_birth) VALUES
('70000000-0000-0000-0000-0000000000f1','20000000-0000-0000-0000-0000000000f1','Maria Souza','1990-05-20'),
('70000000-0000-0000-0000-0000000000f2','20000000-0000-0000-0000-0000000000f1','Sem Nascimento',NULL);
INSERT INTO public.clinic_settings(clinic_id,key,value) VALUES ('20000000-0000-0000-0000-0000000000f1','anamnese_templates','[{"id":"t1","active":true}]');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000f2';
DO $$ BEGIN
  PERFORM public.create_anamnese_link('70000000-0000-0000-0000-0000000000f1');
  RAISE EXCEPTION 'ASSERT: other clinic should not create link';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: other clinic cannot create link';
END $$;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000f1';
DO $$ BEGIN
  PERFORM public.create_anamnese_link('70000000-0000-0000-0000-0000000000f2');
  RAISE EXCEPTION 'ASSERT: needs birth date';
EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'PASS: link needs birth date';
END $$;
INSERT INTO t_link SELECT public.create_anamnese_link('70000000-0000-0000-0000-0000000000f1') ->> 'token';
SELECT pg_temp.assert_true((SELECT length(token) = 64 FROM t_link), 'link token created');
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND bool_and(token_hash <> (SELECT token FROM t_link)) FROM public.anamnese_links), 'only hash stored');

-- Paciente (sem login)
SET LOCAL ROLE anon;
RESET request.jwt.claim.sub;
SELECT pg_temp.assert_true((SELECT public.anamnese_link_status((SELECT token FROM t_link)) ->> 'status' = 'ok'), 'status ok');
SELECT pg_temp.assert_true((SELECT public.anamnese_link_status('errado') ->> 'status' = 'invalid'), 'wrong token invalid');
SELECT pg_temp.assert_true((SELECT (public.anamnese_link_open((SELECT token FROM t_link), '1991-01-01') ->> 'ok')::boolean = false), 'wrong birth date refused');
SELECT pg_temp.assert_true((SELECT public.anamnese_link_open((SELECT token FROM t_link), '1990-05-20') ->> 'first_name' = 'Maria'), 'right birth date opens form');
DO $$ BEGIN
  PERFORM public.anamnese_link_submit((SELECT token FROM t_link), '1990-05-20', '{"consent":{"agrees_terms":true}}'::jsonb);
  RAISE EXCEPTION 'ASSERT: needs signature';
EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'PASS: signature required';
END $$;
SELECT pg_temp.assert_true((SELECT (public.anamnese_link_submit((SELECT token FROM t_link), '1990-05-20',
  '{"consent":{"agrees_terms":true,"signature_name":"Maria Souza"},"health_history":{"is_pregnant":false}}'::jsonb) ->> 'ok')::boolean), 'patient submits');
DO $$ BEGIN
  PERFORM public.anamnese_link_open((SELECT token FROM t_link), '1990-05-20');
  RAISE EXCEPTION 'ASSERT: single use';
EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'PASS: link is single use';
END $$;
RESET ROLE;

SELECT pg_temp.assert_true((SELECT status = 'filled' AND is_current AND source_type = 'patient_link' AND form_data #>> '{submission,filled_by}' = 'patient'
  FROM public.patient_anamneses WHERE patient_id='70000000-0000-0000-0000-0000000000f1'), 'anamnese saved on patient record');
SELECT pg_temp.assert_true((SELECT failed_attempts = 1 FROM public.anamnese_links), 'failed attempt counted');

-- 5 erros bloqueiam
UPDATE public.anamnese_links SET used_at = NULL, failed_attempts = 5;
SELECT pg_temp.assert_true((SELECT public.anamnese_link_status((SELECT token FROM t_link)) ->> 'status' = 'locked'), 'locked after 5 errors');

ROLLBACK;
