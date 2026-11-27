\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO auth.users(id,email) VALUES ('10000000-0000-0000-0000-0000000000c3','adm@maq.test');
INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000c3','Maq','maq-clinica');
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES ('10000000-0000-0000-0000-0000000000c3','20000000-0000-0000-0000-0000000000c3','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name) VALUES ('70000000-0000-0000-0000-0000000000c3','20000000-0000-0000-0000-0000000000c3','Mia');
INSERT INTO public.contracts(id,clinic_id,patient_id,contract_number,process_status,status) VALUES
  ('c0000000-0000-0000-0000-0000000000c3','20000000-0000-0000-0000-0000000000c3','70000000-0000-0000-0000-0000000000c3','C-M3','confirmed','active');
INSERT INTO public.contract_payment_plans(id,clinic_id,contract_id,patient_id,total_contract_value,total_predicted_value) VALUES
  ('a0000000-0000-0000-0000-0000000000c3','20000000-0000-0000-0000-0000000000c3','c0000000-0000-0000-0000-0000000000c3','70000000-0000-0000-0000-0000000000c3',1500,1500);
INSERT INTO public.contract_payment_methods(id,clinic_id,contract_id,payment_plan_id,payment_method,amount,installments_count,installment_value) VALUES
  ('b0000000-0000-0000-0000-0000000000c3','20000000-0000-0000-0000-0000000000c3','c0000000-0000-0000-0000-0000000000c3','a0000000-0000-0000-0000-0000000000c3','credit',1200,6,200),
  ('b0000000-0000-0000-0000-0000000000c4','20000000-0000-0000-0000-0000000000c3','c0000000-0000-0000-0000-0000000000c3','a0000000-0000-0000-0000-0000000000c3','credit',300,3,100);
INSERT INTO public.contract_installments(clinic_id,contract_id,payment_plan_id,payment_method_id,payment_method,installment_number,installments_count,due_date,amount,status)
SELECT '20000000-0000-0000-0000-0000000000c3','c0000000-0000-0000-0000-0000000000c3','a0000000-0000-0000-0000-0000000000c3','b0000000-0000-0000-0000-0000000000c3','credit',g,6,current_date + 30*(g-1),200,'previsto' FROM generate_series(1,6) g;
INSERT INTO public.contract_installments(clinic_id,contract_id,payment_plan_id,payment_method_id,payment_method,installment_number,installments_count,due_date,amount,status)
SELECT '20000000-0000-0000-0000-0000000000c3','c0000000-0000-0000-0000-0000000000c3','a0000000-0000-0000-0000-0000000000c3','b0000000-0000-0000-0000-0000000000c4','credit',g,3,current_date + 30*(g-1),100,'previsto' FROM generate_series(1,3) g;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000c3',true);
INSERT INTO public.payment_terminals(id,clinic_id,name,credit_mode,advance_days,credit_2_6_fee) VALUES ('f0000000-0000-0000-0000-0000000000c3','20000000-0000-0000-0000-0000000000c3','Stone antecipada','advance',1,5);
INSERT INTO public.payment_terminals(id,clinic_id,name,credit_mode,credit_2_6_fee) VALUES ('f0000000-0000-0000-0000-0000000000c4','20000000-0000-0000-0000-0000000000c3','Cielo no fluxo','flow',3);

-- Venda 1: R$ 1.200 em 6x na maquininha antecipada (5%): tudo em D+1, líquido 1.140.
CREATE TEMP TABLE s1 AS SELECT public.register_card_sale((SELECT id FROM public.contract_installments WHERE payment_method_id='b0000000-0000-0000-0000-0000000000c3' AND installment_number=1), 'f0000000-0000-0000-0000-0000000000c3', 'credit', 6, current_date) AS id;
SELECT pg_temp.assert_true((SELECT count(*) = 6 FROM public.contract_installments WHERE payment_method_id='b0000000-0000-0000-0000-0000000000c3' AND status='pago'), 'all 6 card installments paid at once');
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND sum(gross) = 1200 AND sum(fee_amount) = 60 AND sum(net) = 1140 AND min(expected_date) = current_date + 1 FROM public.card_receivables WHERE sale_id=(SELECT id FROM s1)), 'advance: one receivable D+1, net 1140');

-- Venda 2: R$ 300 em 3x no fluxo (3%): 3 recebíveis a cada 30 dias.
CREATE TEMP TABLE s2 AS SELECT public.register_card_sale((SELECT id FROM public.contract_installments WHERE payment_method_id='b0000000-0000-0000-0000-0000000000c4' AND installment_number=1), 'f0000000-0000-0000-0000-0000000000c4', 'credit', 3, current_date) AS id;
SELECT pg_temp.assert_true((SELECT count(*) = 3 AND sum(gross) = 300 AND sum(net) = 291 AND max(expected_date) = current_date + 90 FROM public.card_receivables WHERE sale_id=(SELECT id FROM s2)), 'flow: 3 receivables 30/60/90, net 291');

-- Recebe a 1ª da venda 2 e depois estorna: 2 restantes canceladas, débito do que já caiu, devolução registrada.
SELECT public.mark_card_receivable_received((SELECT id FROM public.card_receivables WHERE sale_id=(SELECT id FROM s2) AND number=1), current_date);
SELECT public.reverse_card_sale((SELECT id FROM s2), 'refund', 'Paciente desistiu no mesmo mês');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.card_receivables WHERE sale_id=(SELECT id FROM s2) AND kind='sale' AND status='cancelled'), 'not-yet-paid receivables cancelled');
SELECT pg_temp.assert_true((SELECT net = -97 AND status = 'expected' FROM public.card_receivables WHERE sale_id=(SELECT id FROM s2) AND kind='reversal'), 'already-received becomes a debit (-97)');
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND sum(amount) = 300 FROM public.contract_refunds WHERE contract_id='c0000000-0000-0000-0000-0000000000c3' AND paid_method='card_reversal'), 'refund to patient registered (enters DRE)');
DO $$ BEGIN
  PERFORM public.reverse_card_sale((SELECT id FROM s2), 'refund', 'De novo por engano');
  RAISE EXCEPTION 'should fail';
EXCEPTION WHEN SQLSTATE '22023' THEN RAISE NOTICE 'PASS: cannot reverse twice';
END $$;
ROLLBACK;
