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

INSERT INTO auth.users(id,email) VALUES ('10000000-0000-0000-0000-0000000000f5','r@canc.test');
INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000f5','Canc','canc-clinica');
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES ('10000000-0000-0000-0000-0000000000f5','20000000-0000-0000-0000-0000000000f5','receptionist',true);
INSERT INTO public.clinic_settings(clinic_id,key,value) VALUES ('20000000-0000-0000-0000-0000000000f5','contract_cancellation_fee_percent','10');
INSERT INTO public.patients(id,clinic_id,full_name,date_of_birth) VALUES ('70000000-0000-0000-0000-0000000000f5','20000000-0000-0000-0000-0000000000f5','Clara Nunes','1985-07-08');
INSERT INTO public.treatments(id,clinic_id,name,price,num_sessions,duration_minutes) VALUES ('e0000000-0000-0000-0000-0000000000f5','20000000-0000-0000-0000-0000000000f5','Laser',1000,10,30);
INSERT INTO public.proposals(id,clinic_id,patient_id,proposal_number,total_amount,final_amount,status) VALUES
  ('90000000-0000-0000-0000-0000000000f5','20000000-0000-0000-0000-0000000000f5','70000000-0000-0000-0000-0000000000f5','P-C5',1000,1000,'accepted'),
  ('90000000-0000-0000-0000-0000000000f6','20000000-0000-0000-0000-0000000000f5','70000000-0000-0000-0000-0000000000f5','P-C6',1000,1000,'accepted');
INSERT INTO public.proposal_items(proposal_id,treatment_id,quantity,unit_price,subtotal) VALUES
  ('90000000-0000-0000-0000-0000000000f5','e0000000-0000-0000-0000-0000000000f5',1,1000,1000),
  ('90000000-0000-0000-0000-0000000000f6','e0000000-0000-0000-0000-0000000000f5',1,1000,1000);
INSERT INTO public.contracts(id,clinic_id,patient_id,proposal_id,contract_number,template_snapshot_html,process_status,status,created_at) VALUES
  ('c0000000-0000-0000-0000-0000000000f5','20000000-0000-0000-0000-0000000000f5','70000000-0000-0000-0000-0000000000f5','90000000-0000-0000-0000-0000000000f5','C-C5','<p>x</p>','confirmed','active',now()-interval '30 days'),
  ('c0000000-0000-0000-0000-0000000000f6','20000000-0000-0000-0000-0000000000f5','70000000-0000-0000-0000-0000000000f5','90000000-0000-0000-0000-0000000000f6','C-C6','<p>x</p>','confirmed','active',now()-interval '30 days');
INSERT INTO public.contract_payment_plans(id,clinic_id,contract_id,patient_id,total_contract_value,total_predicted_value) VALUES
  ('a0000000-0000-0000-0000-0000000000f5','20000000-0000-0000-0000-0000000000f5','c0000000-0000-0000-0000-0000000000f5','70000000-0000-0000-0000-0000000000f5',1000,1000),
  ('a0000000-0000-0000-0000-0000000000f6','20000000-0000-0000-0000-0000000000f5','c0000000-0000-0000-0000-0000000000f6','70000000-0000-0000-0000-0000000000f5',1000,1000);
-- C5: pagou 600 (de 1000), fez 2 sessões (R$ 200). Multa 10% sobre não usado (800) = 80. Devolução = 600-200-80 = 320.
INSERT INTO public.contract_installments(clinic_id,contract_id,payment_plan_id,payment_method,installment_number,installments_count,due_date,amount,status,paid_at,paid_amount,paid_method) VALUES
  ('20000000-0000-0000-0000-0000000000f5','c0000000-0000-0000-0000-0000000000f5','a0000000-0000-0000-0000-0000000000f5','pix',1,2,current_date-20,600,'pago',current_date-20,600,'pix'),
  ('20000000-0000-0000-0000-0000000000f5','c0000000-0000-0000-0000-0000000000f5','a0000000-0000-0000-0000-0000000000f5','pix',2,2,current_date+10,400,'previsto',NULL,NULL,NULL),
-- C6: pagou 100, fez 5 sessões (R$ 500). Multa 10% de 500 = 50. Resultado = 100-500-50 = -450 (deve).
  ('20000000-0000-0000-0000-0000000000f5','c0000000-0000-0000-0000-0000000000f6','a0000000-0000-0000-0000-0000000000f6','pix',1,2,current_date-20,100,'pago',current_date-20,100,'pix'),
  ('20000000-0000-0000-0000-0000000000f5','c0000000-0000-0000-0000-0000000000f6','a0000000-0000-0000-0000-0000000000f6','pix',2,2,current_date+10,900,'previsto',NULL,NULL,NULL);
INSERT INTO public.session_records(clinic_id,patient_id,treatment_id,performed_at,session_number,total_sessions)
SELECT '20000000-0000-0000-0000-0000000000f5','70000000-0000-0000-0000-0000000000f5','e0000000-0000-0000-0000-0000000000f5', now()-interval '1 day'*g, g, 10 FROM generate_series(1,2) g;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000f5',true);

SELECT pg_temp.assert_true((SELECT (p->>'paid')::numeric = 600 AND (p->>'used_value')::numeric = 200 AND (p->>'fee')::numeric = 80 AND (p->>'refund')::numeric = 320 AND (p->>'default_fee_percent')::numeric = 10
  FROM (SELECT public.contract_cancellation_preview('c0000000-0000-0000-0000-0000000000f5') p) x), 'preview: 600 paid - 200 used - 80 fee = 320 refund');
SELECT pg_temp.expect_error($$SELECT public.propose_contract_cancellation('c0000000-0000-0000-0000-0000000000f5',150,'Paciente mudou de cidade')$$,'22023','fee over 100% refused');

CREATE TEMP TABLE am AS SELECT public.propose_contract_cancellation('c0000000-0000-0000-0000-0000000000f5',10,'Paciente mudou de cidade') AS id;
SELECT pg_temp.assert_true((SELECT process_status = 'confirmed' FROM public.contracts WHERE id='c0000000-0000-0000-0000-0000000000f5'), 'contract active until acceptance');
CREATE TEMP TABLE lk AS SELECT public.create_amendment_link((SELECT id FROM am)) ->> 'token' AS token;
GRANT SELECT ON lk TO anon;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT (public.accept_public_amendment(token, 'Clara Nunes', '1985-07-08') ->> 'ok')::boolean FROM lk), 'patient accepts cancellation term');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT process_status = 'cancelled' AND status = 'cancelled' FROM public.contracts WHERE id='c0000000-0000-0000-0000-0000000000f5'), 'contract cancelled');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.contract_installments WHERE contract_id='c0000000-0000-0000-0000-0000000000f5' AND status='previsto'), 'open installments cancelled');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.contract_installments WHERE contract_id='c0000000-0000-0000-0000-0000000000f5' AND status='pago'), 'paid installment kept');
SELECT pg_temp.assert_true((SELECT amount = 320 AND status = 'pending' FROM public.contract_refunds WHERE contract_id='c0000000-0000-0000-0000-0000000000f5'), 'refund of 320 pending');

SET LOCAL ROLE authenticated;
SELECT public.mark_contract_refund_paid((SELECT id FROM public.contract_refunds WHERE contract_id='c0000000-0000-0000-0000-0000000000f5'), 'pix', current_date, 'Pix enviado');
SELECT pg_temp.assert_true((SELECT status = 'paid' AND paid_method = 'pix' AND paid_by = '10000000-0000-0000-0000-0000000000f5' FROM public.contract_refunds WHERE contract_id='c0000000-0000-0000-0000-0000000000f5'), 'refund registered as paid');

-- C6: fez mais do que pagou -> deve a diferença.
UPDATE pg_temp.lk SET token = token; -- noop
RESET ROLE;
INSERT INTO public.session_records(clinic_id,patient_id,treatment_id,performed_at,session_number,total_sessions)
SELECT '20000000-0000-0000-0000-0000000000f5','70000000-0000-0000-0000-0000000000f5','e0000000-0000-0000-0000-0000000000f5', now()-interval '1 hour'*g, g, 10 FROM generate_series(1,3) g;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE am2 AS SELECT public.propose_contract_cancellation('c0000000-0000-0000-0000-0000000000f6',10,'Desistência da paciente') AS id;
SELECT pg_temp.assert_true((SELECT (changes->>'due')::numeric = 450 AND (changes->>'refund')::numeric = 0 FROM public.contract_amendments WHERE id=(SELECT id FROM am2)), 'patient owes 450');
CREATE TEMP TABLE lk2 AS SELECT public.create_amendment_link((SELECT id FROM am2)) ->> 'token' AS token;
GRANT SELECT ON lk2 TO anon;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT (public.accept_public_amendment(token, 'Clara Nunes', '1985-07-08') ->> 'ok')::boolean FROM lk2), 'patient accepts second cancellation');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND sum(amount) = 450 FROM public.contract_installments WHERE contract_id='c0000000-0000-0000-0000-0000000000f6' AND status='previsto' AND notes='Saldo do cancelamento'), 'amount due becomes one installment');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.contract_refunds WHERE contract_id='c0000000-0000-0000-0000-0000000000f6'), 'no refund when patient owes');
ROLLBACK;
