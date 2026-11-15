\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE TEMP TABLE t_c(code text);
GRANT ALL ON t_c TO PUBLIC;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000c9','IN Clinica','in-clinica');
INSERT INTO public.clinic_service_settings(clinic_id, referral_enabled, referral_reward) VALUES ('20000000-0000-0000-0000-0000000000c9', true, 'R$ 50 de crédito');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-0000000000c8','in-pac@test',now()),('10000000-0000-0000-0000-0000000000c9','in-recep@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES ('10000000-0000-0000-0000-0000000000c9','20000000-0000-0000-0000-0000000000c9','receptionist',true);
INSERT INTO public.patients(id,clinic_id,full_name) VALUES ('70000000-0000-0000-0000-0000000000c9','20000000-0000-0000-0000-0000000000c9','Helena Prado');
INSERT INTO public.patient_users(patient_id,clinic_id,auth_user_id,status) VALUES ('70000000-0000-0000-0000-0000000000c9','20000000-0000-0000-0000-0000000000c9','10000000-0000-0000-0000-0000000000c8','active');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c8';
INSERT INTO t_c SELECT public.my_referral() ->> 'code';
SELECT pg_temp.assert_true((SELECT length(code) = 8 FROM t_c), 'patient gets code');
SELECT pg_temp.assert_true((SELECT public.my_referral() ->> 'code' = (SELECT code FROM t_c)), 'code is stable');

SET LOCAL ROLE anon;
RESET request.jwt.claim.sub;
SELECT pg_temp.assert_true((SELECT public.public_referral_page((SELECT code FROM t_c)) ->> 'referrer_first_name' = 'Helena'), 'public page shows referrer');
SELECT pg_temp.assert_true((SELECT public.submit_referral((SELECT code FROM t_c), 'Ivo', '11988887777') ->> 'reason' = 'invalid_name'), 'needs full name');
SELECT pg_temp.assert_true((SELECT (public.submit_referral((SELECT code FROM t_c), 'Ivo Lopes', '(11) 98888-7777') ->> 'ok')::boolean), 'referral submitted');
SELECT pg_temp.assert_true((SELECT (public.submit_referral((SELECT code FROM t_c), 'Ivo Lopes', '11988887777') ->> 'duplicate')::boolean), 'duplicate phone not duplicated');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c9';
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND bool_and(referrer_name = 'Helena Prado') FROM public.referral_list('20000000-0000-0000-0000-0000000000c9')), 'staff sees referral');
DO $$ BEGIN
  PERFORM public.mark_referral_reward((SELECT lead_id FROM public.referral_list('20000000-0000-0000-0000-0000000000c9')));
  RAISE EXCEPTION 'ASSERT: reward before closing';
EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'PASS: reward only after closing';
END $$;
RESET ROLE;
UPDATE public.leads SET kanban_stage = 'closed_won' WHERE referred_by_patient_id = '70000000-0000-0000-0000-0000000000c9';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c9';
SELECT public.mark_referral_reward((SELECT lead_id FROM public.referral_list('20000000-0000-0000-0000-0000000000c9')));
SELECT pg_temp.assert_true((SELECT reward_given_at IS NOT NULL FROM public.referral_list('20000000-0000-0000-0000-0000000000c9')), 'reward marked');
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c8';
SELECT pg_temp.assert_true((SELECT (public.my_referral() ->> 'closed')::int = 1), 'patient sees closed count');
ROLLBACK;
