\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000a7','Pagar','pagar-clinica');
INSERT INTO public.expenses(id,clinic_id,category,amount,expense_date,paid) VALUES
  ('e1000000-0000-0000-0000-0000000000a7','20000000-0000-0000-0000-0000000000a7','Aluguel',2000,'2026-12-01',false);
SELECT pg_temp.assert_true((SELECT due_date = '2026-12-01' AND paid_at IS NULL FROM public.expenses WHERE id='e1000000-0000-0000-0000-0000000000a7'), 'due date defaults to competence date');
UPDATE public.expenses SET paid = true WHERE id='e1000000-0000-0000-0000-0000000000a7';
SELECT pg_temp.assert_true((SELECT paid_at IS NOT NULL FROM public.expenses WHERE id='e1000000-0000-0000-0000-0000000000a7'), 'paid sets paid date');
UPDATE public.expenses SET paid = false WHERE id='e1000000-0000-0000-0000-0000000000a7';
SELECT pg_temp.assert_true((SELECT paid_at IS NULL FROM public.expenses WHERE id='e1000000-0000-0000-0000-0000000000a7'), 'unpaid clears paid date');
INSERT INTO public.expenses(clinic_id,category,amount,expense_date,due_date,paid,supplier,installment_group,installment_number,installments_count)
SELECT '20000000-0000-0000-0000-0000000000a7','Manutenção e equipamentos',500,'2026-12-05',('2027-01-05'::date + (g-1) * interval '1 month')::date,false,'Fornecedor X','e2000000-0000-0000-0000-0000000000a7',g,10 FROM generate_series(1,10) g;
SELECT pg_temp.assert_true((SELECT count(*) = 10 AND sum(amount) = 5000 AND min(due_date) = '2027-01-05' AND max(due_date) = '2027-10-05' FROM public.expenses WHERE installment_group='e2000000-0000-0000-0000-0000000000a7'), 'installment purchase: 10 bills with own due dates, same competence');
ROLLBACK;
