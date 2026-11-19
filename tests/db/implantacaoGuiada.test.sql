\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

SELECT pg_temp.assert_true((SELECT count(*) = 78 FROM public.treatment_catalog), 'catalog has 78 treatments');
SELECT pg_temp.assert_true((SELECT count(DISTINCT category_name) = 9 FROM public.treatment_catalog), 'catalog has 9 areas');

INSERT INTO public.clinics(id,name,slug) VALUES
('20000000-0000-0000-0000-000000000061','IG Nova','ig-nova'),
('20000000-0000-0000-0000-000000000062','IG Outra','ig-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('10000000-0000-0000-0000-000000000061','ig-dona@test',now()),
('10000000-0000-0000-0000-000000000062','ig-recep@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-000000000061','20000000-0000-0000-0000-000000000061','admin',true),
('10000000-0000-0000-0000-000000000062','20000000-0000-0000-0000-000000000061','receptionist',true);

-- Só o admin implanta
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000062';
DO $$ BEGIN
  PERFORM public.setup_clinic_defaults('20000000-0000-0000-0000-000000000061', ARRAY['Estética Facial']);
  RAISE EXCEPTION 'ASSERT: receptionist should not set up';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: non-admin cannot set up';
END $$;

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000061';
SELECT pg_temp.assert_true(
  (SELECT r = '{"roles": 4, "custom": 0, "treatments": 20, "categories": 2}'::jsonb
   FROM public.setup_clinic_defaults('20000000-0000-0000-0000-000000000061', ARRAY['Estética Facial','Peelings']) r),
  'admin copies 2 categories, 20 treatments, 4 roles');
SELECT pg_temp.assert_true((SELECT count(*) = 20 FROM public.treatments WHERE clinic_id='20000000-0000-0000-0000-000000000061' AND category_id IS NOT NULL AND price > 0),'treatments linked with price');

-- Rodar de novo não duplica; acrescentar categoria só traz a nova
SELECT pg_temp.assert_true(
  (SELECT r = '{"roles": 0, "custom": 0, "treatments": 10, "categories": 1}'::jsonb
   FROM public.setup_clinic_defaults('20000000-0000-0000-0000-000000000061', ARRAY['Estética Facial','Peelings','Emagrecimento']) r),
  'rerun is idempotent and adds only the new category');

-- Admin de outra clínica não implanta nesta
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000061';
DO $$ BEGIN
  PERFORM public.setup_clinic_defaults('20000000-0000-0000-0000-000000000062', ARRAY['Peelings']);
  RAISE EXCEPTION 'ASSERT: other clinic should fail';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: cannot set up another clinic';
END $$;
RESET request.jwt.claim.sub;

-- Categoria desconhecida é ignorada
SELECT pg_temp.assert_true(
  (SELECT (r->>'treatments')::int = 0 FROM public.setup_clinic_defaults('20000000-0000-0000-0000-000000000062', ARRAY['Inexistente']) r),
  'unknown category ignored');

-- Escolha tratamento a tratamento, com preço da clínica e tratamento próprio
INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-000000000063','IG Escolha','ig-escolha');
SELECT pg_temp.assert_true(
  (SELECT r = '{"roles": 4, "custom": 1, "treatments": 3, "categories": 2}'::jsonb
   FROM public.setup_clinic_defaults('20000000-0000-0000-0000-000000000063', ARRAY['Injetáveis'], '[
     {"name":"Toxina botulínica full face","category":"Injetáveis","price":"1500"},
     {"name":"Skinbooster","category":"Injetáveis"},
     {"name":"Nome que não existe","category":"Injetáveis","price":"10"},
     {"name":"Dermaplaning com peeling","category":"Meu protocolo","price":"260","sessions":"2","duration":"50","custom":true}
   ]'::jsonb) r),
  'picks only chosen catalog items plus custom one');
SELECT pg_temp.assert_true((SELECT price = 1500 AND default_price = 1500 AND min_price <= 1500 FROM public.treatments WHERE clinic_id='20000000-0000-0000-0000-000000000063' AND name='Toxina botulínica full face'),'clinic price applied');
SELECT pg_temp.assert_true((SELECT price = 700 FROM public.treatments WHERE clinic_id='20000000-0000-0000-0000-000000000063' AND name='Skinbooster'),'catalog price when none given');
SELECT pg_temp.assert_true((SELECT num_sessions = 2 AND duration_minutes = 50 AND category = 'Meu protocolo' FROM public.treatments WHERE clinic_id='20000000-0000-0000-0000-000000000063' AND name='Dermaplaning com peeling'),'custom treatment with its own area');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.treatments WHERE clinic_id='20000000-0000-0000-0000-000000000063' AND name='Preenchimento labial (1 ml)'),'unchosen catalog items not created');
SELECT pg_temp.assert_true((SELECT count(*) = 9 FROM public.treatment_catalog_areas),'nine catalog areas');
SELECT pg_temp.assert_true((SELECT notice IS NOT NULL FROM public.treatment_catalog_areas WHERE name='Injetáveis'),'injectables notice present');

ROLLBACK;
