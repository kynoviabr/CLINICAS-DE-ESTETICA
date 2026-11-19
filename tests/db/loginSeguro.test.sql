\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES
('20000000-0000-0000-0000-000000000031','LS A','ls-test-a'),('20000000-0000-0000-0000-000000000032','LS B','ls-test-b');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000031','ls-admin@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-000000000031','20000000-0000-0000-0000-000000000031','admin',true);

INSERT INTO public.team_invitations(clinic_id,email,role,status) VALUES
('20000000-0000-0000-0000-000000000031','convidada@test','receptionist','pending'),
('20000000-0000-0000-0000-000000000031','vencido@test','receptionist','pending'),
('20000000-0000-0000-0000-000000000032','ls-admin@test','receptionist','pending');
UPDATE public.team_invitations SET expires_at = now() - interval '1 day' WHERE email='vencido@test';

-- S1: conta criada sem confirmar o e-mail não recebe o papel
INSERT INTO auth.users(id,email) VALUES ('10000000-0000-0000-0000-000000000032','Convidada@Test');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.user_roles WHERE user_id='10000000-0000-0000-0000-000000000032'),'unconfirmed signup gets no role');
SELECT pg_temp.assert_true((SELECT status='pending' FROM public.team_invitations WHERE email='convidada@test'),'invitation stays pending until confirmation');

-- Confirmou o e-mail: recebe o papel
UPDATE auth.users SET email_confirmed_at = now() WHERE id='10000000-0000-0000-0000-000000000032';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.user_roles WHERE user_id='10000000-0000-0000-0000-000000000032' AND clinic_id='20000000-0000-0000-0000-000000000031' AND role='receptionist'),'confirmed email gets the invited role');
SELECT pg_temp.assert_true((SELECT status='accepted' FROM public.team_invitations WHERE email='convidada@test'),'invitation marked accepted');

-- Login social já chega confirmado
INSERT INTO public.team_invitations(clinic_id,email,role,status) VALUES ('20000000-0000-0000-0000-000000000031','google@test','professional','pending');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000033','google@test',now());
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.user_roles WHERE user_id='10000000-0000-0000-0000-000000000033'),'confirmed social signup gets role');

-- Convite vencido não vale
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000034','vencido@test',now());
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.user_roles WHERE user_id='10000000-0000-0000-0000-000000000034'),'expired invitation ignored');

-- S2: quem já é de uma clínica não ganha papel em outra
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.user_roles WHERE user_id='10000000-0000-0000-0000-000000000031'),'existing member not moved by invitation');
DO $$ BEGIN
  INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
  ('10000000-0000-0000-0000-000000000031','20000000-0000-0000-0000-000000000032','receptionist',true);
  RAISE EXCEPTION 'ASSERT: second active clinic should be rejected';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: one active clinic per user';
END $$;

-- S3: busca por e-mail só para service_role
SELECT pg_temp.assert_true((SELECT email_confirmed FROM public.find_auth_user_by_email(' CONVIDADA@test ')),'find user by email ignores case/spaces');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.find_auth_user_by_email(text)','EXECUTE'),'authenticated cannot look up users by email');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.find_auth_user_by_email(text)','EXECUTE'),'anon cannot look up users by email');

ROLLBACK;
