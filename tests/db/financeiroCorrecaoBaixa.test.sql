\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO auth.users(id,email) VALUES ('10000000-0000-0000-0000-0000000000b9','adm@fin.test');
INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000b9','Fin','fin-clinica');
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES ('10000000-0000-0000-0000-0000000000b9','20000000-0000-0000-0000-0000000000b9','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name) VALUES ('70000000-0000-0000-0000-0000000000b9','20000000-0000-0000-0000-0000000000b9','Bia');
INSERT INTO public.contracts(id,clinic_id,patient_id,contract_number,process_status,status) VALUES
  ('c0000000-0000-0000-0000-0000000000b9','20000000-0000-0000-0000-0000000000b9','70000000-0000-0000-0000-0000000000b9','C-B9','confirmed','active');
INSERT INTO public.contract_payment_plans(id,clinic_id,contract_id,patient_id,total_contract_value,total_predicted_value) VALUES
  ('a0000000-0000-0000-0000-0000000000b9','20000000-0000-0000-0000-0000000000b9','c0000000-0000-0000-0000-0000000000b9','70000000-0000-0000-0000-0000000000b9',300,300);
INSERT INTO public.contract_installments(id,clinic_id,contract_id,payment_plan_id,payment_method,installment_number,installments_count,due_date,amount,status) VALUES
  ('d0000000-0000-0000-0000-0000000000b9','20000000-0000-0000-0000-0000000000b9','c0000000-0000-0000-0000-0000000000b9','a0000000-0000-0000-0000-0000000000b9','pix',1,1,current_date,300,'previsto');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000b9',true);
UPDATE public.contract_installments SET status='pago', paid_at=current_date, paid_amount=300, paid_method='pix' WHERE id='d0000000-0000-0000-0000-0000000000b9';
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.installment_payment_log WHERE action='paid' AND amount=300), 'payment logged');

DO $$ BEGIN
  UPDATE public.contract_installments SET status='previsto', paid_at=NULL, paid_amount=NULL, paid_method=NULL WHERE id='d0000000-0000-0000-0000-0000000000b9';
  RAISE EXCEPTION 'should fail';
EXCEPTION WHEN SQLSTATE '22023' THEN RAISE NOTICE 'PASS: undo without reason blocked';
END $$;

DO $$ BEGIN
  PERFORM public.correct_installment_payment('d0000000-0000-0000-0000-0000000000b9', 'ok');
  RAISE EXCEPTION 'should fail';
EXCEPTION WHEN SQLSTATE '22023' THEN RAISE NOTICE 'PASS: short reason refused';
END $$;

SELECT public.correct_installment_payment('d0000000-0000-0000-0000-0000000000b9', 'Baixa lançada na parcela errada');
SELECT pg_temp.assert_true((SELECT status = 'previsto' AND paid_amount IS NULL FROM public.contract_installments WHERE id='d0000000-0000-0000-0000-0000000000b9'), 'installment back to open');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.installment_payment_log WHERE action='corrected' AND amount=300 AND method='pix' AND reason LIKE 'Baixa lançada%' AND created_by='10000000-0000-0000-0000-0000000000b9'), 'correction logged with old values, reason and author');
ROLLBACK;
