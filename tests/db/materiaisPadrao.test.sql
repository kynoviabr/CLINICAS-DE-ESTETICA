\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

SELECT pg_temp.assert_true((SELECT count(DISTINCT treatment_name) = 78 FROM public.treatment_catalog_materials), 'every catalog treatment has materials');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.treatment_catalog tc
  WHERE NOT EXISTS (SELECT 1 FROM public.treatment_catalog_materials m WHERE m.treatment_name = tc.name)), 'names match the catalog');

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000b1','MP Clinica','mp-clinica');
INSERT INTO public.treatments(id,clinic_id,name,price) VALUES ('40000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-0000000000b1','Toxina botulínica full face',1800);
SELECT pg_temp.assert_true((SELECT count(*) = 7 FROM public.treatment_cost_items WHERE treatment_id='40000000-0000-0000-0000-0000000000b1'), 'new catalog treatment gets its composition');
SELECT pg_temp.assert_true((SELECT unit_cost = 800 AND unit = 'frasco' FROM public.cost_items WHERE clinic_id='20000000-0000-0000-0000-0000000000b1' AND name='Toxina botulínica 100U'), 'material created with reference cost');

INSERT INTO public.treatments(id,clinic_id,name,price) VALUES ('40000000-0000-0000-0000-0000000000b2','20000000-0000-0000-0000-0000000000b1','Toxina botulínica terço superior',1200);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.cost_items WHERE clinic_id='20000000-0000-0000-0000-0000000000b1' AND name='Toxina botulínica 100U'), 'shared material not duplicated');
SELECT pg_temp.assert_true((SELECT quantity = 0.3 FROM public.treatment_cost_items tci JOIN public.cost_items ci ON ci.id = tci.cost_item_id
  WHERE tci.treatment_id='40000000-0000-0000-0000-0000000000b2' AND ci.name='Toxina botulínica 100U'), 'quantity per session');

INSERT INTO public.treatments(id,clinic_id,name,price) VALUES ('40000000-0000-0000-0000-0000000000b3','20000000-0000-0000-0000-0000000000b1','Protocolo da casa',300);
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.treatment_cost_items WHERE treatment_id='40000000-0000-0000-0000-0000000000b3'), 'own treatment untouched');
SELECT pg_temp.assert_true((SELECT movements = 0 AND balance = 0 FROM public.stock_balances sb JOIN public.cost_items ci ON ci.id = sb.cost_item_id WHERE ci.clinic_id='20000000-0000-0000-0000-0000000000b1' AND ci.name='Luva de procedimento'), 'catalog material starts untracked');

ROLLBACK;
