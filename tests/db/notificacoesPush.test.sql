\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO auth.users(id,email) VALUES
  ('10000000-0000-0000-0000-0000000000f1','a@push.test'),
  ('10000000-0000-0000-0000-0000000000f2','b@push.test');
INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000f1','Push Clinica','push-clinica');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000f1',true);
SELECT public.register_push_device('tok-aaaaaaaaaaaaaaaaaaaaaaaa', 'android');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.push_devices), 'owner registers and sees device');

-- Mesmo aparelho, outra pessoa logada: o aparelho passa para ela.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000f2',true);
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.push_devices), 'other user does not see device');
SELECT public.register_push_device('tok-aaaaaaaaaaaaaaaaaaaaaaaa', 'android');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.push_devices), 'device moves to new user');

DO $$ BEGIN
  BEGIN PERFORM public.register_push_device('curto', 'android'); RAISE EXCEPTION 'should fail';
  EXCEPTION WHEN SQLSTATE '22023' THEN RAISE NOTICE 'PASS: invalid token refused'; END;
  BEGIN INSERT INTO public.push_devices(user_id, platform, token) VALUES (auth.uid(), 'ios', 'tok-bbbbbbbbbbbbbbbbbbbbbbbbb'); RAISE EXCEPTION 'should fail';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: direct insert blocked'; END;
END $$;

SELECT public.unregister_push_device('tok-aaaaaaaaaaaaaaaaaaaaaaaa');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.push_devices), 'unregister removes device');
RESET ROLE;

-- Aviso para quem tem aparelho não falha mesmo sem pg_net/segredos.
INSERT INTO public.push_devices(user_id, platform, token) VALUES ('10000000-0000-0000-0000-0000000000f1', 'ios', 'tok-cccccccccccccccccccccccc');
INSERT INTO public.notifications(clinic_id, user_id, title, message, channel, status)
  VALUES ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'Novo agendamento', 'Teste', 'in_app', 'sent');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.notifications WHERE title = 'Novo agendamento'), 'notification insert not blocked by push trigger');
ROLLBACK;
