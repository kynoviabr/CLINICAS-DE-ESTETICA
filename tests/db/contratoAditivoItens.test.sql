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

INSERT INTO auth.users(id,email) VALUES ('10000000-0000-0000-0000-0000000000e1','r@itens.test');
INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000e1','Itens','itens-clinica');
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES ('10000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','receptionist',true);
INSERT INTO public.patients(id,clinic_id,full_name,date_of_birth) VALUES ('70000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','Iara Souza','1992-03-04');
INSERT INTO public.treatments(id,clinic_id,name,price,num_sessions,duration_minutes) VALUES
  ('e0000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000e1','Laser',1000,10,30),
  ('e0000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-0000000000e1','Peeling',300,1,30);
INSERT INTO public.proposals(id,clinic_id,patient_id,proposal_number,total_amount,final_amount,status) VALUES
  ('90000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','70000000-0000-0000-0000-0000000000e1','P-I1',1000,1000,'accepted');
INSERT INTO public.proposal_items(proposal_id,treatment_id,quantity,unit_price,subtotal) VALUES
  ('90000000-0000-0000-0000-0000000000e1','e0000000-0000-0000-0000-0000000000a1',1,1000,1000);
INSERT INTO public.contracts(id,clinic_id,patient_id,proposal_id,contract_number,template_snapshot_html,process_status,status,created_at) VALUES
  ('c0000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','70000000-0000-0000-0000-0000000000e1','90000000-0000-0000-0000-0000000000e1','C-I1','<p>x</p>','confirmed','active',now()-interval '60 days');
INSERT INTO public.contract_payment_plans(id,clinic_id,contract_id,patient_id,total_contract_value,total_predicted_value) VALUES
  ('a0000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','c0000000-0000-0000-0000-0000000000e1','70000000-0000-0000-0000-0000000000e1',1000,1000);
INSERT INTO public.contract_payment_methods(id,clinic_id,contract_id,payment_plan_id,payment_method,amount,installments_count,installment_value) VALUES
  ('b0000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','c0000000-0000-0000-0000-0000000000e1','a0000000-0000-0000-0000-0000000000e1','boleto',1000,4,250);
INSERT INTO public.contract_installments(clinic_id,contract_id,payment_plan_id,payment_method_id,payment_method,installment_number,installments_count,due_date,amount,status,paid_at,paid_amount,paid_method) VALUES
  ('20000000-0000-0000-0000-0000000000e1','c0000000-0000-0000-0000-0000000000e1','a0000000-0000-0000-0000-0000000000e1','b0000000-0000-0000-0000-0000000000e1','boleto',1,4,current_date-30,250,'pago',current_date-30,250,'boleto'),
  ('20000000-0000-0000-0000-0000000000e1','c0000000-0000-0000-0000-0000000000e1','a0000000-0000-0000-0000-0000000000e1','b0000000-0000-0000-0000-0000000000e1','boleto',2,4,current_date,250,'previsto',NULL,NULL,NULL),
  ('20000000-0000-0000-0000-0000000000e1','c0000000-0000-0000-0000-0000000000e1','a0000000-0000-0000-0000-0000000000e1','b0000000-0000-0000-0000-0000000000e1','boleto',3,4,current_date+30,250,'previsto',NULL,NULL,NULL),
  ('20000000-0000-0000-0000-0000000000e1','c0000000-0000-0000-0000-0000000000e1','a0000000-0000-0000-0000-0000000000e1','b0000000-0000-0000-0000-0000000000e1','boleto',4,4,current_date+60,250,'previsto',NULL,NULL,NULL);
-- 4 sessões de laser já feitas (saldo não usado = 6)
INSERT INTO public.session_records(clinic_id,patient_id,treatment_id,performed_at,session_number,total_sessions)
SELECT '20000000-0000-0000-0000-0000000000e1','70000000-0000-0000-0000-0000000000e1','e0000000-0000-0000-0000-0000000000a1', now()-interval '1 day'*g, g, 10 FROM generate_series(1,4) g;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000e1',true);

SELECT pg_temp.assert_true((SELECT (public.contract_items_summary('c0000000-0000-0000-0000-0000000000e1')->'items'->0->>'used')::int = 4), 'used sessions counted');
SELECT pg_temp.expect_error($$SELECT public.propose_contract_items_amendment('c0000000-0000-0000-0000-0000000000e1','[]','[{"treatment_id":"e0000000-0000-0000-0000-0000000000a1","sessions":7,"value":700}]',NULL,NULL,'Remover laser não usado')$$,'22023','cannot remove more than unused balance (6)');
SELECT pg_temp.expect_error($$SELECT public.propose_contract_items_amendment('c0000000-0000-0000-0000-0000000000e1','[{"treatment_id":"e0000000-0000-0000-0000-0000000000a2","packages":1,"value":300}]','[]',NULL,current_date,'Adicionar peeling')$$,'22023','added value requires payment methods');

-- Remove 6 sessões de laser (R$ 600) e adiciona 1 peeling (R$ 300): diferença -300, abate das parcelas em aberto.
CREATE TEMP TABLE am AS SELECT public.propose_contract_items_amendment('c0000000-0000-0000-0000-0000000000e1',
  '[{"treatment_id":"e0000000-0000-0000-0000-0000000000a2","packages":1,"value":300}]',
  '[{"treatment_id":"e0000000-0000-0000-0000-0000000000a1","sessions":6,"value":600}]', NULL, NULL, 'Paciente trocou o laser restante por peeling') AS id;
SELECT pg_temp.assert_true((SELECT (changes->>'delta')::numeric = -300 FROM public.contract_amendments WHERE id=(SELECT id FROM am)), 'delta computed');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.contract_item_adjustments), 'nothing applied before acceptance');
CREATE TEMP TABLE lk AS SELECT public.create_amendment_link((SELECT id FROM am)) ->> 'token' AS token;
GRANT SELECT ON lk TO anon;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT (public.accept_public_amendment(token, 'Iara Souza', '1992-03-04') ->> 'ok')::boolean FROM lk), 'patient accepts items amendment');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.contract_item_adjustments WHERE contract_id='c0000000-0000-0000-0000-0000000000e1'), 'two adjustments recorded');
SELECT pg_temp.assert_true((SELECT sum(amount) = 450 FROM public.contract_installments WHERE contract_id='c0000000-0000-0000-0000-0000000000e1' AND status='previsto'), 'open balance reduced 750 -> 450 (from last installments)');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.contract_installments WHERE contract_id='c0000000-0000-0000-0000-0000000000e1' AND status='pago'), 'paid installment untouched');
SELECT pg_temp.assert_true((SELECT total_contract_value = 700 FROM public.contract_payment_plans WHERE id='a0000000-0000-0000-0000-0000000000e1'), 'contract value 1000 -> 700');
SELECT pg_temp.assert_true((SELECT (changes->>'refund_due')::numeric = 0 FROM public.contract_amendments WHERE id=(SELECT id FROM am)), 'no refund when open balance covers');
SELECT pg_temp.assert_true((SELECT contracted = 4 FROM private.contract_items_now('c0000000-0000-0000-0000-0000000000e1') WHERE name='Laser'), 'laser now 4 sessions (all used)');

-- Adiciona item com valor maior: gera parcelas novas para a diferença.
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE am2 AS SELECT public.propose_contract_items_amendment('c0000000-0000-0000-0000-0000000000e1',
  '[{"treatment_id":"e0000000-0000-0000-0000-0000000000a2","packages":2,"value":600}]','[]',
  '[{"method":"credit","amount":600,"installments":3}]', current_date + 10, 'Mais duas sessões de peeling') AS id;
CREATE TEMP TABLE lk2 AS SELECT public.create_amendment_link((SELECT id FROM am2)) ->> 'token' AS token;
GRANT SELECT ON lk2 TO anon;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT (public.accept_public_amendment(token, 'Iara Souza', '1992-03-04') ->> 'ok')::boolean FROM lk2), 'second amendment accepted');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) = 3 AND sum(amount) = 600 FROM public.contract_installments WHERE contract_id='c0000000-0000-0000-0000-0000000000e1' AND payment_method='credit'), 'difference charged in 3 new installments');
SELECT pg_temp.assert_true((SELECT total_contract_value = 1300 FROM public.contract_payment_plans WHERE id='a0000000-0000-0000-0000-0000000000e1'), 'contract value 700 -> 1300');
ROLLBACK;
