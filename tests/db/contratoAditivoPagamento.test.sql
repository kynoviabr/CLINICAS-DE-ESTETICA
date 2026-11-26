\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE FUNCTION pg_temp.expect_error(sql text, code text, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql; RAISE EXCEPTION 'ASSERT: % (no error)', msg;
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> code THEN RAISE EXCEPTION 'ASSERT: % (got % %)', msg, SQLSTATE, SQLERRM; END IF; END;
  RAISE NOTICE 'PASS: %', msg;
END $$;

INSERT INTO auth.users(id,email) VALUES ('10000000-0000-0000-0000-0000000000d1','r@pag.test'),('10000000-0000-0000-0000-0000000000d2','x@pag.test');
INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000d1','Pag','pag-clinica'),('20000000-0000-0000-0000-0000000000d2','Outra','outra-pag');
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
  ('10000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-0000000000d1','receptionist',true),
  ('10000000-0000-0000-0000-0000000000d2','20000000-0000-0000-0000-0000000000d2','receptionist',true);
INSERT INTO public.patients(id,clinic_id,full_name,date_of_birth) VALUES ('70000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-0000000000d1','Paula Rocha','1988-05-10');
INSERT INTO public.contracts(id,clinic_id,patient_id,contract_number,template_snapshot_html,process_status,status) VALUES
  ('c0000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-0000000000d1','70000000-0000-0000-0000-0000000000d1','C-D1','<p>x</p>','confirmed','active');
INSERT INTO public.contract_payment_plans(id,clinic_id,contract_id,patient_id,total_contract_value,total_predicted_value) VALUES
  ('a0000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000d1','70000000-0000-0000-0000-0000000000d1',900,900);
INSERT INTO public.contract_payment_methods(id,clinic_id,contract_id,payment_plan_id,payment_method,amount,installments_count,installment_value) VALUES
  ('b0000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000d1','a0000000-0000-0000-0000-0000000000d1','boleto',900,3,300);
INSERT INTO public.contract_installments(clinic_id,contract_id,payment_plan_id,payment_method_id,payment_method,installment_number,installments_count,due_date,amount,status,paid_at,paid_amount,paid_method) VALUES
  ('20000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000d1','a0000000-0000-0000-0000-0000000000d1','b0000000-0000-0000-0000-0000000000d1','boleto',1,3,current_date-30,300,'pago',current_date-30,300,'boleto'),
  ('20000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000d1','a0000000-0000-0000-0000-0000000000d1','b0000000-0000-0000-0000-0000000000d1','boleto',2,3,current_date,300,'previsto',NULL,NULL,NULL),
  ('20000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-0000000000d1','a0000000-0000-0000-0000-0000000000d1','b0000000-0000-0000-0000-0000000000d1','boleto',3,3,current_date+30,300,'previsto',NULL,NULL,NULL);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000d2',true);
SELECT pg_temp.expect_error($$SELECT public.propose_contract_payment_amendment('c0000000-0000-0000-0000-0000000000d1','[{"method":"pix","amount":600}]',current_date,'Paciente pediu Pix')$$,'42501','other clinic cannot propose');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000d1',true);
SELECT pg_temp.expect_error($$SELECT public.propose_contract_payment_amendment('c0000000-0000-0000-0000-0000000000d1','[{"method":"pix","amount":500}]',current_date,'Paciente pediu Pix')$$,'22023','sum must equal open balance (600)');
SELECT pg_temp.expect_error($$SELECT public.propose_contract_payment_amendment('c0000000-0000-0000-0000-0000000000d1','[{"method":"pix","amount":600,"installments":3}]',current_date,'Paciente pediu Pix')$$,'22023','pix cannot be split');
SELECT pg_temp.expect_error($$SELECT public.propose_contract_payment_amendment('c0000000-0000-0000-0000-0000000000d1','[{"method":"pix","amount":600}]',current_date,'ok')$$,'22023','reason required');

CREATE TEMP TABLE am AS SELECT public.propose_contract_payment_amendment('c0000000-0000-0000-0000-0000000000d1',
  '[{"method":"pix","amount":200},{"method":"credit","amount":400,"installments":4,"card_brand":"Visa","card_last4":"1234"}]', current_date + 5, 'Paciente pediu para pagar no cartão') AS id;
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.contract_installments WHERE contract_id='c0000000-0000-0000-0000-0000000000d1' AND status='previsto'), 'nothing changes before acceptance');
SELECT pg_temp.expect_error($$SELECT public.propose_contract_payment_amendment('c0000000-0000-0000-0000-0000000000d1','[{"method":"pix","amount":600}]',current_date,'Outra revisão aqui')$$,'22023','only one pending amendment');

CREATE TEMP TABLE lk AS SELECT public.create_amendment_link((SELECT id FROM am)) ->> 'token' AS token;
GRANT SELECT ON lk TO anon;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT (public.get_public_amendment(token) ->> 'can_accept')::boolean FROM lk), 'patient sees amendment');
SELECT pg_temp.assert_true((SELECT public.accept_public_amendment(token, 'Paula Rocha', '1990-01-01') ->> 'reason' = 'identity' FROM lk), 'wrong birth date refused');
SELECT pg_temp.assert_true((SELECT (public.accept_public_amendment(token, 'Paula Rocha', '1988-05-10') ->> 'ok')::boolean FROM lk), 'patient accepts');
RESET ROLE;

SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.contract_installments WHERE contract_id='c0000000-0000-0000-0000-0000000000d1' AND status='pago'), 'paid installment kept');
SELECT pg_temp.assert_true((SELECT count(*) = 5 AND sum(amount) = 600 FROM public.contract_installments WHERE contract_id='c0000000-0000-0000-0000-0000000000d1' AND status='previsto'), 'open installments replaced: 1 pix + 4 credit = 600');
SELECT pg_temp.assert_true((SELECT min(due_date) = current_date + 5 FROM public.contract_installments WHERE contract_id='c0000000-0000-0000-0000-0000000000d1' AND status='previsto'), 'first due date respected');
SELECT pg_temp.assert_true((SELECT total_predicted_value = 900 FROM public.contract_payment_plans WHERE id='a0000000-0000-0000-0000-0000000000d1'), 'plan total stays 900');
SELECT pg_temp.assert_true((SELECT status = 'applied' AND accepted_name = 'Paula Rocha' AND accepted_verified_by = 'birth_date' AND accepted_hash IS NOT NULL FROM public.contract_amendments WHERE id=(SELECT id FROM am)), 'acceptance evidence recorded');
SELECT pg_temp.assert_true((SELECT (public.accept_public_amendment(token, 'Paula Rocha', '1988-05-10') ->> 'ok')::boolean = false FROM lk), 'cannot accept twice');

-- Desistir
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000d1',true);
CREATE TEMP TABLE am2 AS SELECT public.propose_contract_payment_amendment('c0000000-0000-0000-0000-0000000000d1','[{"method":"pix","amount":600}]',current_date,'Volta para Pix à vista') AS id;
SELECT public.discard_contract_amendment((SELECT id FROM am2));
SELECT pg_temp.assert_true((SELECT status = 'discarded' FROM public.contract_amendments WHERE id=(SELECT id FROM am2)), 'staff can discard pending amendment');
ROLLBACK;
