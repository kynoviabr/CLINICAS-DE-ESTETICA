\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

SELECT pg_temp.assert_true(public.normalize_payment_method('Cartão de crédito: valor R$ 10') = 'credit', 'credit recognized');
SELECT pg_temp.assert_true(public.normalize_payment_method('Cartão de débito: R$ 10') = 'debit', 'debit recognized');
SELECT pg_temp.assert_true(public.normalize_payment_method('Cartão: valor R$ 10') = 'card', 'legacy card still works');
SELECT pg_temp.assert_true(public.normalize_payment_method('Transferência: R$ 10') = 'transfer', 'transfer recognized');

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000e1','FP Clinica','fp-clinica');
INSERT INTO public.patients(id,clinic_id,full_name) VALUES ('70000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','Cliente FP');
-- Mesmo texto de src/test/paymentMethods.test.ts
INSERT INTO public.contracts(id,clinic_id,patient_id,contract_number,status,start_date,notes) VALUES
('90000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','70000000-0000-0000-0000-0000000000e1','CT-FP-1','active','2026-11-10',
 E'Condição: Parcelado\nFormas: Pix: R$ 500.00 | Cartão de crédito: valor R$ 1200.00 | 3x de R$ 400.00 | Cartão de débito: R$ 200.00 | Dinheiro: R$ 100.00 | Transferência: R$ 50.00 | Boleto: valor R$ 600.00 | 2x de R$ 300.00');

SELECT private.upsert_contract_financial_forecast('90000000-0000-0000-0000-0000000000e1', true);

SELECT pg_temp.assert_true((SELECT count(*) = 6 FROM public.contract_payment_methods WHERE contract_id='90000000-0000-0000-0000-0000000000e1'), 'six payment methods');
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM public.contract_installments WHERE contract_id='90000000-0000-0000-0000-0000000000e1' AND payment_method='credit'), 'credit in 3 installments');
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND sum(amount) = 200 FROM public.contract_installments WHERE contract_id='90000000-0000-0000-0000-0000000000e1' AND payment_method='debit'), 'debit single');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.contract_installments WHERE contract_id='90000000-0000-0000-0000-0000000000e1' AND payment_method='boleto'), 'boleto in 2');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.contract_installments WHERE contract_id='90000000-0000-0000-0000-0000000000e1' AND payment_method='transfer'), 'transfer single');
SELECT pg_temp.assert_true((SELECT sum(amount) = 2650 FROM public.contract_installments WHERE contract_id='90000000-0000-0000-0000-0000000000e1'), 'total 2650');
SELECT pg_temp.assert_true((SELECT max(due_date) = '2027-01-10' FROM public.contract_installments WHERE contract_id='90000000-0000-0000-0000-0000000000e1' AND payment_method='credit'), 'monthly due dates');

ROLLBACK;
