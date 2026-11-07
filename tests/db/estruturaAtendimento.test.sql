\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000e1','EA Clinica','ea-clinica'),('20000000-0000-0000-0000-0000000000e2','EA Outra','ea-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('10000000-0000-0000-0000-0000000000e1','ea-admin@test',now()),('10000000-0000-0000-0000-0000000000e2','ea-recep@test',now()),('10000000-0000-0000-0000-0000000000e3','ea-outra@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
 ('10000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','admin',true),
 ('10000000-0000-0000-0000-0000000000e2','20000000-0000-0000-0000-0000000000e1','receptionist',true),
 ('10000000-0000-0000-0000-0000000000e3','20000000-0000-0000-0000-0000000000e2','admin',true);

SET LOCAL ROLE authenticated;
-- Administrador configura
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000e1';
INSERT INTO public.clinic_business_hours(clinic_id,day_of_week,opens_at,closes_at) VALUES ('20000000-0000-0000-0000-0000000000e1',1,'09:00','19:00');
INSERT INTO public.clinic_closures(clinic_id,closed_on,reason) VALUES ('20000000-0000-0000-0000-0000000000e1','2026-12-25','Natal');
INSERT INTO public.clinic_service_settings(clinic_id,payment_methods,max_installments,parking,accepts_insurance,insurance_plans,evaluation_free)
 VALUES ('20000000-0000-0000-0000-0000000000e1','{pix,credito}',10,'partner',false,'{}',true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.clinic_service_settings), 'admin saves settings');

DO $$ BEGIN
  INSERT INTO public.clinic_service_settings(clinic_id,payment_methods) VALUES ('20000000-0000-0000-0000-0000000000e1','{cheque}')
  ON CONFLICT (clinic_id) DO UPDATE SET payment_methods = EXCLUDED.payment_methods;
  RAISE EXCEPTION 'ASSERT: unknown payment method accepted';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: unknown payment method rejected';
END $$;
DO $$ BEGIN
  INSERT INTO public.clinic_business_hours(clinic_id,day_of_week,opens_at,closes_at) VALUES ('20000000-0000-0000-0000-0000000000e1',2,'19:00','09:00');
  RAISE EXCEPTION 'ASSERT: closing before opening accepted';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: closing before opening rejected';
END $$;

-- Recepção lê, não altera
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000e2';
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.clinic_business_hours), 'staff reads hours');
UPDATE public.clinic_service_settings SET parking = 'none';
SELECT pg_temp.assert_true((SELECT parking = 'partner' FROM public.clinic_service_settings), 'staff cannot change settings');

-- Outra clínica não vê nada
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000e3';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.clinic_business_hours), 'other clinic sees no hours');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.clinic_service_settings), 'other clinic sees no settings');
DO $$ BEGIN
  INSERT INTO public.clinic_closures(clinic_id,closed_on) VALUES ('20000000-0000-0000-0000-0000000000e1','2026-12-31');
  RAISE EXCEPTION 'ASSERT: other clinic wrote closure';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: other clinic cannot write closures';
END $$;

SET LOCAL ROLE anon;
RESET request.jwt.claim.sub;
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.clinic_service_settings), 'anon sees nothing');
RESET ROLE;
ROLLBACK;
