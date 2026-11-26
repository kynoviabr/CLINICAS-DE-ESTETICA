\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO auth.users(id,email) VALUES ('10000000-0000-0000-0000-0000000000c7','c@copy.test'),('10000000-0000-0000-0000-0000000000c8','d@copy.test');
INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000c7','Copia','copia-clinica'),('20000000-0000-0000-0000-0000000000c8','Outra','outra-copia');
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
  ('10000000-0000-0000-0000-0000000000c7','20000000-0000-0000-0000-0000000000c7','receptionist',true),
  ('10000000-0000-0000-0000-0000000000c8','20000000-0000-0000-0000-0000000000c8','receptionist',true);
INSERT INTO public.patients(id,clinic_id,full_name,date_of_birth) VALUES ('70000000-0000-0000-0000-0000000000c7','20000000-0000-0000-0000-0000000000c7','Carla Dias','1990-01-01');
INSERT INTO public.contracts(id,clinic_id,patient_id,contract_number,template_snapshot_html,process_status,status) VALUES
  ('c0000000-0000-0000-0000-0000000000c7','20000000-0000-0000-0000-0000000000c7','70000000-0000-0000-0000-0000000000c7','C-C7','<p>Contrato</p>','confirmed','active');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000c8',true);
DO $$ BEGIN
  PERFORM public.create_contract_copy_link('c0000000-0000-0000-0000-0000000000c7'); RAISE EXCEPTION 'should fail';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: other clinic cannot create copy link'; END $$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000c7',true);
CREATE TEMP TABLE t AS SELECT public.create_contract_copy_link('c0000000-0000-0000-0000-0000000000c7') ->> 'token' AS token;
GRANT SELECT ON t TO anon;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT (public.get_public_contract_copy(token) ->> 'ok')::boolean AND (public.get_public_contract_copy(token) ->> 'can_sign')::boolean = false FROM t), 'copy opens read-only for active contract');
DO $$ DECLARE r jsonb; BEGIN
  SELECT public.sign_public_contract(token, 'Carla Dias', '1990-01-01') INTO r FROM t;
  IF r ->> 'ok' = 'true' THEN RAISE EXCEPTION 'ASSERT: copy link signed'; END IF;
  RAISE NOTICE 'PASS: copy link cannot sign';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: copy link cannot sign';
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.contract_signatures), 'no signature recorded from copy link');
SELECT pg_temp.assert_true((public.get_public_contract_copy(repeat('a',64)) ->> 'ok')::boolean = false, 'unknown token invalid');
ROLLBACK;
