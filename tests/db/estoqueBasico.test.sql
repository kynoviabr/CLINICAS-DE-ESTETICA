\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE FUNCTION pg_temp.saldo(item uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT balance FROM public.stock_balances WHERE cost_item_id = item $$;

INSERT INTO public.clinics(id,name,slug) VALUES
('20000000-0000-0000-0000-0000000000a1','EB Clinica','eb-clinica'),
('20000000-0000-0000-0000-0000000000a2','EB Outra','eb-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('10000000-0000-0000-0000-0000000000a1','eb-dona@test',now()),
('10000000-0000-0000-0000-0000000000a2','eb-recep@test',now()),
('10000000-0000-0000-0000-0000000000a3','eb-estoque@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','admin',true),
('10000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-0000000000a1','receptionist',true),
('10000000-0000-0000-0000-0000000000a3','20000000-0000-0000-0000-0000000000a1','receptionist',true);

INSERT INTO public.cost_items(id,clinic_id,name,type,unit,unit_cost) VALUES
('30000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','Toxina 100U','medication','frasco',800),
('30000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-0000000000a1','Luva','supply','par',1),
('30000000-0000-0000-0000-0000000000a3','20000000-0000-0000-0000-0000000000a1','Hora técnica','labor','h',50);
INSERT INTO public.treatments(id,clinic_id,name,price) VALUES ('40000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','Botox',1200);
INSERT INTO public.treatment_cost_items(treatment_id,cost_item_id,quantity) VALUES
('40000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000a1',0.5),
('40000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000a2',2),
('40000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000a3',1);

-- Permissão: admin define quem gerencia
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000a2';
DO $$ BEGIN
  INSERT INTO public.stock_movements(clinic_id,cost_item_id,kind,quantity) VALUES ('20000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000a2','entrada',10);
  RAISE EXCEPTION 'ASSERT: receptionist without flag should not add stock';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: receptionist without flag cannot add stock';
END $$;
DO $$ BEGIN
  PERFORM public.set_stock_manager('20000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-0000000000a3',true);
  RAISE EXCEPTION 'ASSERT: non-admin should not grant';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: only admin grants stock manager';
END $$;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000a1';
SELECT public.set_stock_manager('20000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-0000000000a3',true);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000a3';
INSERT INTO public.stock_movements(clinic_id,cost_item_id,kind,quantity,unit_cost,expires_at) VALUES
('20000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000a1','entrada',2,1000,current_date + 5),
('20000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000a2','entrada',10,NULL,NULL);
SELECT pg_temp.assert_true(pg_temp.saldo('30000000-0000-0000-0000-0000000000a1') = 2, 'stock manager adds entry');
DO $$ BEGIN
  INSERT INTO public.stock_movements(clinic_id,cost_item_id,kind,quantity) VALUES ('20000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000a2','consumo',-1);
  RAISE EXCEPTION 'ASSERT: manual consumption should be blocked';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: consumption is automatic only';
END $$;
DO $$ BEGIN
  INSERT INTO public.stock_movements(clinic_id,cost_item_id,kind,quantity) VALUES ('20000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-0000000000a2','entrada',1);
  RAISE EXCEPTION 'ASSERT: other clinic should be blocked';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: cannot add to another clinic';
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;

SELECT pg_temp.assert_true((SELECT unit_cost = 1000 FROM public.cost_items WHERE id='30000000-0000-0000-0000-0000000000a1'), 'first entry sets cost');
INSERT INTO public.stock_movements(clinic_id,cost_item_id,kind,quantity,unit_cost) VALUES
('20000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000a1','entrada',2,600);
SELECT pg_temp.assert_true((SELECT unit_cost = 800 FROM public.cost_items WHERE id='30000000-0000-0000-0000-0000000000a1'), 'average cost updated');

-- Baixa ao concluir na agenda; desfazer devolve
INSERT INTO public.appointments(id,clinic_id,treatment_id,start_time,end_time,status,appointment_type) VALUES
('50000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','40000000-0000-0000-0000-0000000000a1',now(),now()+interval '1 hour','scheduled','session');
SELECT pg_temp.assert_true(pg_temp.saldo('30000000-0000-0000-0000-0000000000a1') = 4, 'scheduling does not consume');
UPDATE public.appointments SET status='completed' WHERE id='50000000-0000-0000-0000-0000000000a1';
SELECT pg_temp.assert_true(pg_temp.saldo('30000000-0000-0000-0000-0000000000a1') = 3.5 AND pg_temp.saldo('30000000-0000-0000-0000-0000000000a2') = 8, 'completing consumes recipe');
SELECT pg_temp.assert_true(pg_temp.saldo('30000000-0000-0000-0000-0000000000a3') = 0, 'labor is not stock');
UPDATE public.appointments SET status='completed', notes='x' WHERE id='50000000-0000-0000-0000-0000000000a1';
SELECT pg_temp.assert_true(pg_temp.saldo('30000000-0000-0000-0000-0000000000a1') = 3.5, 'no double consumption');
UPDATE public.appointments SET status='scheduled' WHERE id='50000000-0000-0000-0000-0000000000a1';
SELECT pg_temp.assert_true(pg_temp.saldo('30000000-0000-0000-0000-0000000000a1') = 4, 'undo returns material');

ROLLBACK;
