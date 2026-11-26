\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE FUNCTION pg_temp.expect_error(sql text, code text, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql; RAISE EXCEPTION 'ASSERT: % (no error)', msg;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> code THEN RAISE EXCEPTION 'ASSERT: % (got % %)', msg, SQLSTATE, SQLERRM; END IF;
  END;
  RAISE NOTICE 'PASS: %', msg;
END $$;

INSERT INTO auth.users(id,email) VALUES
  ('10000000-0000-0000-0000-0000000000a1','recep@a.test'),
  ('10000000-0000-0000-0000-0000000000b1','recep@b.test');
INSERT INTO public.clinics(id,name,slug) VALUES
  ('20000000-0000-0000-0000-0000000000a1','Clinica A','clinica-a-adit'),
  ('20000000-0000-0000-0000-0000000000b1','Clinica B','clinica-b-adit');
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
  ('10000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','receptionist',true),
  ('10000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-0000000000b1','receptionist',true);
INSERT INTO public.patients(id,clinic_id,full_name,phone,cpf) VALUES
  ('70000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','Ana Lima','(11) 90000-0000','11111111111');
INSERT INTO public.contracts(id,clinic_id,patient_id,contract_number,process_status,status) VALUES
  ('c0000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','70000000-0000-0000-0000-0000000000a1','C-A1','confirmed','active'),
  ('c0000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-0000000000a1','70000000-0000-0000-0000-0000000000a1','C-A2','overdue','active'),
  ('c0000000-0000-0000-0000-0000000000a3','20000000-0000-0000-0000-0000000000a1','70000000-0000-0000-0000-0000000000a1','C-A3','cancelled','cancelled');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);

-- Outra clínica não revisa.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000b1',true);
SELECT pg_temp.expect_error($$SELECT public.amend_contract_patient_data('c0000000-0000-0000-0000-0000000000a1','{"phone":"x"}','Telefone errado')$$,'42501','other clinic cannot amend');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.contract_amendments), 'other clinic sees no amendments');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000a1',true);
SELECT pg_temp.expect_error($$SELECT public.amend_contract_patient_data('c0000000-0000-0000-0000-0000000000a1','{"phone":"(11) 98888-7777"}','ok')$$,'22023','reason required');
SELECT pg_temp.expect_error($$SELECT public.amend_contract_patient_data('c0000000-0000-0000-0000-0000000000a1','{"notes":"x"}','Campo errado aqui')$$,'22023','field not allowed');
SELECT pg_temp.expect_error($$SELECT public.amend_contract_patient_data('c0000000-0000-0000-0000-0000000000a1','{"phone":"(11) 90000-0000"}','Sem mudança real')$$,'22023','no-op change refused');
SELECT pg_temp.expect_error($$SELECT public.amend_contract_patient_data('c0000000-0000-0000-0000-0000000000a3','{"phone":"1"}','Contrato cancelado')$$,'22023','cancelled contract not amendable');

SELECT public.amend_contract_patient_data('c0000000-0000-0000-0000-0000000000a1','{"phone":"(11) 98888-7777","cpf":"22222222222"}','Telefone e CPF digitados errados');
SELECT pg_temp.assert_true((SELECT phone = '(11) 98888-7777' AND cpf = '22222222222' FROM public.patients WHERE id='70000000-0000-0000-0000-0000000000a1'), 'patient updated');
SELECT pg_temp.assert_true((
  SELECT kind = 'patient_data' AND status = 'applied' AND NOT requires_acceptance
     AND changes->'patient'->'phone'->>'before' = '(11) 90000-0000'
     AND changes->'patient'->'phone'->>'after' = '(11) 98888-7777'
     AND changes->'patient' ? 'cpf' AND NOT (changes->'patient' ? 'full_name')
     AND created_by = '10000000-0000-0000-0000-0000000000a1'
  FROM public.contract_amendments WHERE contract_id='c0000000-0000-0000-0000-0000000000a1'), 'amendment records only changed fields with before/after');
SELECT pg_temp.expect_error($$INSERT INTO public.contract_amendments(clinic_id,contract_id,kind,reason) VALUES ('20000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-0000000000a1','patient_data','direto sem rpc')$$,'42501','direct insert blocked');

-- Aprovar revisão
SELECT pg_temp.expect_error($$SELECT public.approve_contract_review('c0000000-0000-0000-0000-0000000000a1','Aprovado ok')$$,'22023','only overdue can be approved');
SELECT public.approve_contract_review('c0000000-0000-0000-0000-0000000000a2','Ajuste interno conferido');
SELECT pg_temp.assert_true((SELECT process_status = 'confirmed' FROM public.contracts WHERE id='c0000000-0000-0000-0000-0000000000a2'), 'review approved -> active');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.contract_amendments WHERE contract_id='c0000000-0000-0000-0000-0000000000a2' AND kind='review_approved'), 'approval recorded');
ROLLBACK;
