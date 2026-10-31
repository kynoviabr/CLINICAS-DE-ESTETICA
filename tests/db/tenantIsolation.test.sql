\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE FUNCTION pg_temp.expect_error(sql_text text, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql_text;
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN RAISE NOTICE 'PASS: %', msg; RETURN;
  END;
  RAISE EXCEPTION 'ASSERT: expected error: %', msg;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text), pg_temp.expect_error(text, text) TO anon, authenticated;

INSERT INTO auth.users(id,email) VALUES
('10000000-0000-0000-0000-000000000011','iso-admin-a@test'),('10000000-0000-0000-0000-000000000012','iso-admin-b@test');
INSERT INTO public.clinics(id,name,slug) VALUES
('20000000-0000-0000-0000-000000000011','ISO A','iso-test-a'),('20000000-0000-0000-0000-000000000012','ISO B','iso-test-b');
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000011','admin',true),
('10000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-000000000012','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name,phone) VALUES
('30000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-000000000012','Paciente B','11999990000');
INSERT INTO public.treatments(id,clinic_id,name) VALUES
('50000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-000000000012','Trat B');
INSERT INTO public.contracts(id,clinic_id,patient_id,contract_number,created_by) VALUES
('60000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-000000000012','30000000-0000-0000-0000-000000000012','ISO-B-1','10000000-0000-0000-0000-000000000012');
INSERT INTO public.renewal_tasks(clinic_id,patient_id,treatment_id,trigger_type) VALUES
('20000000-0000-0000-0000-000000000012','30000000-0000-0000-0000-000000000012','50000000-0000-0000-0000-000000000012','time_based');

-- Visitante anônimo (chave pública do site)
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.v_renewal_tasks_active WHERE clinic_id='20000000-0000-0000-0000-000000000012'),'anon cannot read renewal view');
SELECT pg_temp.expect_error($q$SELECT * FROM public.get_finance_contract_sellers('20000000-0000-0000-0000-000000000012')$q$,'anon cannot call finance sellers');
SELECT pg_temp.expect_error($q$SELECT public.get_finance_contract_forecast_detail('60000000-0000-0000-0000-000000000012')$q$,'anon cannot call forecast detail');
RESET ROLE;

-- Admin da clínica A tentando ler/alterar a clínica B
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000011',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.v_renewal_tasks_active WHERE clinic_id='20000000-0000-0000-0000-000000000012'),'other clinic cannot read renewal view');
SELECT pg_temp.expect_error($q$SELECT * FROM public.get_finance_contract_sellers('20000000-0000-0000-0000-000000000012')$q$,'cross tenant finance sellers denied');
SELECT pg_temp.expect_error($q$SELECT public.get_finance_contract_forecast_detail('60000000-0000-0000-0000-000000000012')$q$,'cross tenant forecast detail denied');
SELECT pg_temp.expect_error($q$SELECT public.backfill_contract_financial_forecast('20000000-0000-0000-0000-000000000012')$q$,'cross tenant backfill denied');
SELECT pg_temp.expect_error($q$SELECT public.upsert_contract_financial_forecast('60000000-0000-0000-0000-000000000012')$q$,'cross tenant forecast upsert denied');
SELECT pg_temp.expect_error($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('clinic-logos','20000000-0000-0000-0000-000000000012/logo.png')$q$,'cross tenant logo upload denied');
RESET ROLE;

-- Admin da clínica B nos próprios dados
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000012',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.v_renewal_tasks_active WHERE clinic_id='20000000-0000-0000-0000-000000000012'),'own clinic reads renewal view');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.get_finance_contract_sellers('20000000-0000-0000-0000-000000000012')),'own clinic reads finance sellers');
SELECT pg_temp.assert_true(public.get_finance_contract_forecast_detail('60000000-0000-0000-0000-000000000012') IS NOT NULL,'own clinic reads forecast detail');
SELECT pg_temp.assert_true((public.backfill_contract_financial_forecast('20000000-0000-0000-0000-000000000012') ->> 'status')='ok','own clinic runs backfill');
INSERT INTO storage.objects(bucket_id,name) VALUES ('clinic-logos','20000000-0000-0000-0000-000000000012/logo.png');
SELECT pg_temp.assert_true(true,'own clinic uploads logo');
RESET ROLE;

ROLLBACK;
