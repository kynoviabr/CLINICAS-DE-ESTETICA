\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE TEMP TABLE t_link(token text);
GRANT ALL ON t_link TO PUBLIC;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000a1','PP Clinica','pp-clinica'),('20000000-0000-0000-0000-0000000000a2','PP Outra','pp-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-0000000000a1','pp-recep@test',now()),('10000000-0000-0000-0000-0000000000a2','pp-outra@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','receptionist',true),
('10000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-0000000000a2','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name,phone,cpf,email) VALUES
('70000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','Ana Lima','11999990000','12345678909','ana@test');
INSERT INTO public.treatments(id,clinic_id,name,price) VALUES
('80000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','Limpeza de pele',200);
INSERT INTO public.proposals(id,clinic_id,patient_id,proposal_number,total_amount,final_amount,notes) VALUES
('90000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','70000000-0000-0000-0000-0000000000a1','P-001',400,380,'Obs');
INSERT INTO public.proposal_items(proposal_id,treatment_id,quantity,unit_price,subtotal) VALUES
('90000000-0000-0000-0000-0000000000a1','80000000-0000-0000-0000-0000000000a1',2,200,400);

-- Equipe de outra clínica não gera link
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000a2';
DO $$ BEGIN
  PERFORM public.create_proposal_link('90000000-0000-0000-0000-0000000000a1');
  RAISE EXCEPTION 'ASSERT: other clinic should not create link';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: other clinic cannot create link';
END $$;
DO $$ BEGIN
  PERFORM public.revoke_proposal_links('90000000-0000-0000-0000-0000000000a1');
  RAISE EXCEPTION 'ASSERT: other clinic should not revoke';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: other clinic cannot revoke';
END $$;
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.proposal_links), 'other clinic sees no links');

-- Equipe da clínica gera
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000a1';
INSERT INTO t_link SELECT public.create_proposal_link('90000000-0000-0000-0000-0000000000a1') ->> 'token';
SELECT pg_temp.assert_true((SELECT length(token) = 64 FROM t_link), 'token created');
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND bool_and(token_hash <> (SELECT token FROM t_link)) FROM public.proposal_links), 'only hash stored');
SELECT pg_temp.assert_true((SELECT expires_at BETWEEN now() + interval '14 days' AND now() + interval '16 days' FROM public.proposal_links), 'default 15 days');
DO $$ BEGIN
  INSERT INTO public.proposal_links(clinic_id,proposal_id,token_hash,expires_at) VALUES ('20000000-0000-0000-0000-0000000000a1','90000000-0000-0000-0000-0000000000a1','x',now());
  RAISE EXCEPTION 'ASSERT: staff should not insert directly';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: no direct insert';
END $$;

-- Cliente sem login
SET LOCAL ROLE anon;
RESET request.jwt.claim.sub;
CREATE TEMP TABLE t_p AS SELECT public.get_public_proposal((SELECT token FROM t_link)) AS j;
SELECT pg_temp.assert_true((SELECT (j->>'ok')::boolean AND j->>'proposal_number' = 'P-001' FROM t_p), 'opens with token');
SELECT pg_temp.assert_true((SELECT (j->>'final_amount')::numeric = 380 AND jsonb_array_length(j->'items') = 1 FROM t_p), 'amounts and items');
SELECT pg_temp.assert_true((SELECT j->'patient' = '{"full_name":"Ana Lima"}'::jsonb FROM t_p), 'only patient name exposed');
SELECT pg_temp.assert_true((SELECT public.get_public_proposal('90000000-0000-0000-0000-0000000000a1') ->> 'reason' = 'invalid'), 'old id link no longer opens');
SELECT pg_temp.assert_true((SELECT public.get_public_proposal(repeat('a', 64)) ->> 'reason' = 'invalid'), 'wrong token invalid');
DO $$ BEGIN
  PERFORM 1 FROM public.proposal_links LIMIT 1;
  RAISE NOTICE 'PASS: anon reads no links';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon reads no links';
END $$;

RESET ROLE;
SELECT pg_temp.assert_true((SELECT open_count = 1 AND first_opened_at IS NOT NULL FROM public.proposal_links), 'open recorded');

-- Vencido
UPDATE public.proposal_links SET expires_at = now() - interval '1 minute';
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT public.get_public_proposal((SELECT token FROM t_link)) ->> 'reason' = 'expired'), 'expired link');
RESET ROLE;
UPDATE public.proposal_links SET expires_at = now() + interval '1 day';

-- Invalidado pela equipe
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000a1';
SELECT pg_temp.assert_true((SELECT public.revoke_proposal_links('90000000-0000-0000-0000-0000000000a1') = 1), 'revoke counts');
SET LOCAL ROLE anon;
RESET request.jwt.claim.sub;
SELECT pg_temp.assert_true((SELECT public.get_public_proposal((SELECT token FROM t_link)) ->> 'reason' = 'revoked'), 'revoked link');

ROLLBACK;
