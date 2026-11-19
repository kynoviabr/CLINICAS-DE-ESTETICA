\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug,plan_name) VALUES
('20000000-0000-0000-0000-000000000051','PM Essencial','pm-ess','essencial'),
('20000000-0000-0000-0000-000000000052','PM Performance','pm-perf','performance');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('10000000-0000-0000-0000-000000000051','pm-admin@test',now()),
('10000000-0000-0000-0000-000000000052','pm-recep@test',now()),
('10000000-0000-0000-0000-000000000053','pm-outra@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-000000000051','20000000-0000-0000-0000-000000000051','admin',true),
('10000000-0000-0000-0000-000000000052','20000000-0000-0000-0000-000000000051','receptionist',true),
('10000000-0000-0000-0000-000000000053','20000000-0000-0000-0000-000000000052','admin',true);

-- Módulos por plano
SELECT pg_temp.assert_true(public.clinic_modules('20000000-0000-0000-0000-000000000051') = ARRAY['automation','core','crm'],'essencial modules');
SELECT pg_temp.assert_true(public.clinic_has_module('20000000-0000-0000-0000-000000000052','performance'),'performance has performance module');
SELECT pg_temp.assert_true(NOT public.clinic_has_module('20000000-0000-0000-0000-000000000051','clinical'),'essencial has no clinical');

-- Extras e bloqueios por clínica
INSERT INTO public.clinic_module_overrides(clinic_id,module_key,enabled) VALUES
('20000000-0000-0000-0000-000000000051','aura',true),
('20000000-0000-0000-0000-000000000051','crm',false);
SELECT pg_temp.assert_true(public.clinic_has_module('20000000-0000-0000-0000-000000000051','aura'),'add-on enables module');
SELECT pg_temp.assert_true(NOT public.clinic_has_module('20000000-0000-0000-0000-000000000051','crm'),'override disables module');
DELETE FROM public.clinic_module_overrides WHERE clinic_id='20000000-0000-0000-0000-000000000051';

-- Tela exige módulo, mesmo para admin
SELECT pg_temp.assert_true(public.has_menu_access('10000000-0000-0000-0000-000000000051','20000000-0000-0000-0000-000000000051','patients.view'),'admin sees core screen');
SELECT pg_temp.assert_true(NOT public.has_menu_access('10000000-0000-0000-0000-000000000051','20000000-0000-0000-0000-000000000051','goals.view'),'admin of essencial cannot see goals');
SELECT pg_temp.assert_true(public.has_menu_access('10000000-0000-0000-0000-000000000053','20000000-0000-0000-0000-000000000052','goals.view'),'admin of performance sees goals');

-- Usuário de outra clínica não lê os módulos
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000053';
SELECT pg_temp.assert_true(public.clinic_modules('20000000-0000-0000-0000-000000000051') = ARRAY[]::text[],'other clinic user gets no modules');
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000051';
SELECT pg_temp.assert_true(array_length(public.clinic_modules('20000000-0000-0000-0000-000000000051'),1) = 3,'own clinic user reads modules');
SELECT pg_temp.assert_true((SELECT used = 2 AND max_users = 3 FROM public.clinic_seats('20000000-0000-0000-0000-000000000051')),'seats used 2 of 3');
RESET request.jwt.claim.sub;

-- Limite de usuários: essencial = 3 (2 na equipe + 1 convite)
INSERT INTO public.team_invitations(clinic_id,email,role,status) VALUES ('20000000-0000-0000-0000-000000000051','terceira@test','receptionist','pending');
SELECT pg_temp.assert_true(true,'third seat invitation allowed');
-- Renovar o mesmo convite não conta duas vezes
INSERT INTO public.team_invitations(clinic_id,email,role,status) VALUES ('20000000-0000-0000-0000-000000000051','terceira@test','receptionist','pending')
  ON CONFLICT (clinic_id,email) DO UPDATE SET expires_at = now() + interval '7 days';
SELECT pg_temp.assert_true(true,'renewing same invitation allowed');
DO $$ BEGIN
  INSERT INTO public.team_invitations(clinic_id,email,role,status) VALUES ('20000000-0000-0000-0000-000000000051','quarta@test','receptionist','pending');
  RAISE EXCEPTION 'ASSERT: fourth seat should fail';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Seu plano permite até 3 usuários%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS: fourth seat blocked on essencial';
END $$;
-- Performance tem folga
INSERT INTO public.team_invitations(clinic_id,email,role,status) VALUES ('20000000-0000-0000-0000-000000000052','extra@test','receptionist','pending');
SELECT pg_temp.assert_true(true,'performance invitation allowed');

-- A clínica não muda o próprio plano pela API
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000051';
SET LOCAL ROLE authenticated;
-- O admin pode editar os dados da clínica...
UPDATE public.clinics SET phone='13999990000' WHERE id='20000000-0000-0000-0000-000000000051';
SELECT pg_temp.assert_true((SELECT phone='13999990000' FROM public.clinics WHERE id='20000000-0000-0000-0000-000000000051'),'admin still edits clinic data');
-- ...mas não o plano
DO $$ BEGIN
  UPDATE public.clinics SET plan_name='rede' WHERE id='20000000-0000-0000-0000-000000000051';
  RAISE EXCEPTION 'ASSERT: plan change by api should fail';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: api cannot change plan';
END $$;
RESET ROLE;
RESET request.jwt.claim.sub;
-- Kynovia (sem usuário da API) muda
UPDATE public.clinics SET plan_name='clinica' WHERE id='20000000-0000-0000-0000-000000000051';
SELECT pg_temp.assert_true((SELECT plan_name='clinica' FROM public.clinics WHERE id='20000000-0000-0000-0000-000000000051'),'service can change plan');

-- Clínica criada pela API nasce no Essencial
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  INSERT INTO public.clinics(id,name,slug,plan_name) VALUES ('20000000-0000-0000-0000-000000000059','PM Nova','pm-nova','rede');
EXCEPTION WHEN insufficient_privilege THEN NULL; -- sem política de insert no teste: tudo bem
END $$;
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.clinics WHERE id='20000000-0000-0000-0000-000000000059' AND plan_name <> 'essencial'),'api-created clinic never above essencial');

ROLLBACK;
