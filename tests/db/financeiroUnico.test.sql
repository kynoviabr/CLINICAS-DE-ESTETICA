\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE FUNCTION pg_temp.expect_error(sql_text text, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql_text;
  EXCEPTION WHEN insufficient_privilege OR raise_exception OR check_violation THEN RAISE NOTICE 'PASS: %', msg; RETURN;
  END;
  RAISE EXCEPTION 'ASSERT: expected error: %', msg;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text), pg_temp.expect_error(text, text) TO anon, authenticated;

INSERT INTO auth.users(id,email) VALUES
('11000000-0000-0000-0000-000000000001','fin-admin-a@test'),
('11000000-0000-0000-0000-000000000002','fin-admin-b@test'),
('11000000-0000-0000-0000-000000000003','fin-paciente-a@test');
INSERT INTO public.clinics(id,name,slug) VALUES
('21000000-0000-0000-0000-000000000001','FIN A','fin-test-a'),('21000000-0000-0000-0000-000000000002','FIN B','fin-test-b');
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('11000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','admin',true),
('11000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000002','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name,phone) VALUES
('31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Paciente A1','11999990001'),
('31000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','Paciente A2','11999990002');
INSERT INTO public.patient_users(clinic_id,patient_id,auth_user_id) VALUES
('21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003');
INSERT INTO public.contracts(id,clinic_id,patient_id,contract_number,created_by,notes) VALUES
('61000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','FIN-A-1','11000000-0000-0000-0000-000000000001',
 E'Condição: Parcelado\nFormas: Cartão: valor R$ 300.00 | 3x de R$ 100.00'),
('61000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000002','FIN-A-2','11000000-0000-0000-0000-000000000001',
 E'Condição: À vista\nFormas: Pix: R$ 50.00');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT public.upsert_contract_financial_forecast(id, true) FROM public.contracts WHERE clinic_id='21000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT pg_temp.assert_true((SELECT count(*)=4 FROM public.contract_installments WHERE clinic_id='21000000-0000-0000-0000-000000000001'),'forecast generates installments');
SELECT pg_temp.assert_true((SELECT array_agg(amount ORDER BY installment_number) = ARRAY[100,100,100]::numeric[] FROM public.contract_installments WHERE contract_id='61000000-0000-0000-0000-000000000001'),'card split in 3x of 100.00');
SELECT pg_temp.assert_true((SELECT payment_method='card' AND installments_count=3 FROM public.contract_installments WHERE contract_id='61000000-0000-0000-0000-000000000001' AND installment_number=1),'card entry keeps method and count');
SELECT pg_temp.assert_true((SELECT amount=50 FROM public.contract_installments WHERE contract_id='61000000-0000-0000-0000-000000000002'),'pix 50.00 read as fifty');
SELECT pg_temp.assert_true(public.parse_brl_amount('R$ 1.234,56')=1234.56 AND public.parse_brl_amount('300.00')=300 AND public.parse_brl_amount('1.500')=1500 AND public.parse_brl_amount('50.00.')=50,'brl parser handles comma and dot decimals');

-- Admin da clínica B não dá baixa na clínica A
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
UPDATE public.contract_installments SET status='pago', paid_at=current_date, paid_amount=100 WHERE contract_id='61000000-0000-0000-0000-000000000001';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.contract_installments WHERE status='pago'),'other clinic cannot register payment');

-- Admin da clínica A dá baixa
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
UPDATE public.contract_installments SET status='pago', paid_at=current_date, paid_amount=100, paid_method='card'
WHERE contract_id='61000000-0000-0000-0000-000000000001' AND installment_number=1;
SELECT pg_temp.assert_true((SELECT paid_by='11000000-0000-0000-0000-000000000001' FROM public.contract_installments WHERE status='pago'),'payment records who registered it');
SELECT pg_temp.expect_error($q$UPDATE public.contract_installments SET status='pago' WHERE contract_id='61000000-0000-0000-0000-000000000001' AND installment_number=2$q$,'paid installment requires date and amount');
SELECT pg_temp.expect_error($q$SELECT public.upsert_contract_financial_forecast('61000000-0000-0000-0000-000000000001', true)$q$,'forecast regeneration cannot erase payments');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.v_renewal_tasks_active) IS NOT NULL,'renewal view still works');
RESET ROLE;

-- Paciente A1 vê só as parcelas do próprio contrato
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM public.contract_installments),'patient sees only own installments');
UPDATE public.contract_installments SET status='previsto', paid_at=NULL, paid_amount=NULL, paid_method=NULL;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.contract_installments WHERE status='pago'),'patient cannot change installments');

-- Excluir o contrato inteiro continua possível
DELETE FROM public.contracts WHERE id='61000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.contract_installments WHERE contract_id='61000000-0000-0000-0000-000000000001'),'deleting contract removes its installments');

ROLLBACK;
