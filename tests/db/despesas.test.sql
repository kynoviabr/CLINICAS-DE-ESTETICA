\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES
('20000000-0000-0000-0000-0000000000c1','DS Clinica','ds-clinica'),
('20000000-0000-0000-0000-0000000000c2','DS Outra','ds-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('10000000-0000-0000-0000-0000000000c1','ds-dona@test',now()),
('10000000-0000-0000-0000-0000000000c2','ds-prof@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000c1','20000000-0000-0000-0000-0000000000c1','admin',true),
('10000000-0000-0000-0000-0000000000c2','20000000-0000-0000-0000-0000000000c1','professional',true);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c1';
INSERT INTO public.expenses(id,clinic_id,category,amount,expense_date,recurring) VALUES
('60000000-0000-0000-0000-0000000000c1','20000000-0000-0000-0000-0000000000c1','Aluguel',2500,(date_trunc('month', current_date) - interval '2 months' + interval '9 days')::date,true),
('60000000-0000-0000-0000-0000000000c2','20000000-0000-0000-0000-0000000000c1','Refeições',80,current_date,false);
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.expenses), 'admin adds expenses');

SELECT pg_temp.assert_true(public.ensure_recurring_expenses('20000000-0000-0000-0000-0000000000c1', current_date) = 1, 'recurring rent created for this month');
SELECT pg_temp.assert_true(public.ensure_recurring_expenses('20000000-0000-0000-0000-0000000000c1', current_date) = 0, 'not duplicated');
SELECT pg_temp.assert_true((SELECT extract(day FROM expense_date) = 10 AND NOT paid FROM public.expenses WHERE recurrence_parent='60000000-0000-0000-0000-0000000000c1'), 'same day of month, to pay');
SELECT pg_temp.assert_true(public.ensure_recurring_expenses('20000000-0000-0000-0000-0000000000c1', (current_date + interval '6 months')::date) = 0, 'no far future copies');

-- Profissional sem acesso ao Financeiro não vê nem lança
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c2';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.expenses), 'professional cannot see expenses');
DO $$ BEGIN
  INSERT INTO public.expenses(clinic_id,category,amount,expense_date) VALUES ('20000000-0000-0000-0000-0000000000c1','Outros',10,current_date);
  RAISE EXCEPTION 'ASSERT: professional should not add';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: professional cannot add expenses';
END $$;
DO $$ BEGIN
  PERFORM public.ensure_recurring_expenses('20000000-0000-0000-0000-0000000000c1', current_date);
  RAISE EXCEPTION 'ASSERT: professional should not generate';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: professional cannot generate recurring';
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

-- Custo do material fica gravado na baixa
INSERT INTO public.cost_items(id,clinic_id,name,type,unit,unit_cost) VALUES ('30000000-0000-0000-0000-0000000000c1','20000000-0000-0000-0000-0000000000c1','Ácido X','medication','ml',4);
INSERT INTO public.treatments(id,clinic_id,name,price) VALUES ('40000000-0000-0000-0000-0000000000c1','20000000-0000-0000-0000-0000000000c1','Peeling da casa',200);
INSERT INTO public.treatment_cost_items(treatment_id,cost_item_id,quantity) VALUES ('40000000-0000-0000-0000-0000000000c1','30000000-0000-0000-0000-0000000000c1',3);
INSERT INTO public.appointments(id,clinic_id,treatment_id,start_time,end_time,status,appointment_type) VALUES
('50000000-0000-0000-0000-0000000000c1','20000000-0000-0000-0000-0000000000c1','40000000-0000-0000-0000-0000000000c1',now(),now()+interval '1 hour','completed','session');
SELECT pg_temp.assert_true((SELECT unit_cost = 4 AND quantity = -3 FROM public.stock_movements WHERE appointment_id='50000000-0000-0000-0000-0000000000c1'), 'consumption stores unit cost');

ROLLBACK;
