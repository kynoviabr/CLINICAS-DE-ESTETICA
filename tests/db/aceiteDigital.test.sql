\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE TEMP TABLE t_tok(kind text, token text);
GRANT ALL ON t_tok TO PUBLIC;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000e1','AD Clinica','ad-clinica');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-0000000000e1','ad-admin@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES ('10000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','admin',true);
INSERT INTO public.patients(id,clinic_id,full_name,date_of_birth,cpf) VALUES
('70000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','Elisa  Moura','1988-03-10',NULL),
('70000000-0000-0000-0000-0000000000e2','20000000-0000-0000-0000-0000000000e1','Fabio Lins',NULL,'123.456.789-09');
INSERT INTO public.treatments(id,clinic_id,name,price) VALUES ('80000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','Peeling',300);
INSERT INTO public.proposals(id,clinic_id,patient_id,proposal_number,total_amount,final_amount,status,valid_until) VALUES
('90000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','70000000-0000-0000-0000-0000000000e1','P-E1',300,300,'sent',current_date+5),
('90000000-0000-0000-0000-0000000000e2','20000000-0000-0000-0000-0000000000e1','70000000-0000-0000-0000-0000000000e2','P-E2',300,300,'sent',current_date-1);
INSERT INTO public.proposal_items(proposal_id,treatment_id,quantity,unit_price,subtotal) VALUES ('90000000-0000-0000-0000-0000000000e1','80000000-0000-0000-0000-0000000000e1',1,300,300);
INSERT INTO public.leads(id,clinic_id,full_name,proposal_id,kanban_stage) VALUES ('b0000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','Elisa','90000000-0000-0000-0000-0000000000e1','proposal_sent');
INSERT INTO public.contracts(id,clinic_id,patient_id,contract_number,template_snapshot_html,process_status) VALUES
('c0000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-0000000000e1','70000000-0000-0000-0000-0000000000e1','C-E1','<p>Contrato da Elisa</p>','pending_upload'),
('c0000000-0000-0000-0000-0000000000e2','20000000-0000-0000-0000-0000000000e1','70000000-0000-0000-0000-0000000000e2','C-E2',NULL,'pending_upload');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000e1';
INSERT INTO t_tok SELECT 'p1', public.create_proposal_link('90000000-0000-0000-0000-0000000000e1') ->> 'token';
INSERT INTO t_tok SELECT 'p2', public.create_proposal_link('90000000-0000-0000-0000-0000000000e2') ->> 'token';
INSERT INTO t_tok SELECT 'c1', public.create_contract_link('c0000000-0000-0000-0000-0000000000e1') ->> 'token';
DO $$ BEGIN
  PERFORM public.create_contract_link('c0000000-0000-0000-0000-0000000000e2');
  RAISE EXCEPTION 'ASSERT: contract without document';
EXCEPTION WHEN invalid_parameter_value THEN RAISE NOTICE 'PASS: contract needs document';
END $$;

SET LOCAL ROLE anon;
RESET request.jwt.claim.sub;
SELECT pg_temp.assert_true((SELECT public.get_public_proposal((SELECT token FROM t_tok WHERE kind='p1')) ->> 'identity_check' = 'birth_date'), 'asks birth date');
SELECT pg_temp.assert_true((SELECT (public.get_public_proposal((SELECT token FROM t_tok WHERE kind='p1')) ->> 'can_accept')::boolean), 'can accept');
SELECT pg_temp.assert_true((SELECT public.get_public_proposal((SELECT token FROM t_tok WHERE kind='p2')) ->> 'identity_check' = 'cpf'), 'asks cpf when no birth date');
SELECT pg_temp.assert_true((SELECT NOT (public.get_public_proposal((SELECT token FROM t_tok WHERE kind='p2')) ->> 'can_accept')::boolean), 'expired proposal cannot be accepted');
SELECT pg_temp.assert_true((SELECT public.accept_public_proposal((SELECT token FROM t_tok WHERE kind='p1'), 'Elisa Moura', '1990-01-01') ->> 'reason' = 'identity'), 'wrong birth date refused');
SELECT pg_temp.assert_true((SELECT public.accept_public_proposal((SELECT token FROM t_tok WHERE kind='p1'), 'Outra Pessoa', '1988-03-10') ->> 'reason' = 'identity'), 'wrong name refused');
SELECT pg_temp.assert_true((SELECT (public.accept_public_proposal((SELECT token FROM t_tok WHERE kind='p1'), ' elisa moura ', '1988-03-10') ->> 'ok')::boolean), 'accepted with right data (case and spaces ignored)');
SELECT pg_temp.assert_true((SELECT public.accept_public_proposal((SELECT token FROM t_tok WHERE kind='p1'), 'Elisa Moura', '1988-03-10') ->> 'reason' = 'already_accepted'), 'accept only once');
SELECT pg_temp.assert_true((SELECT public.get_public_proposal((SELECT token FROM t_tok WHERE kind='p1')) -> 'acceptance' ->> 'signer_name' = 'elisa moura'), 'page shows acceptance');
SELECT pg_temp.assert_true((SELECT public.accept_public_proposal((SELECT token FROM t_tok WHERE kind='p2'), 'Fabio Lins', '123') ->> 'reason' = 'not_acceptable'), 'expired proposal refused');

SELECT pg_temp.assert_true((SELECT public.get_public_contract((SELECT token FROM t_tok WHERE kind='c1')) ->> 'html' = '<p>Contrato da Elisa</p>'), 'contract html');
SELECT pg_temp.assert_true((SELECT (public.sign_public_contract((SELECT token FROM t_tok WHERE kind='c1'), 'Elisa Moura', '1988-03-10') ->> 'ok')::boolean), 'contract signed');
SELECT pg_temp.assert_true((SELECT public.sign_public_contract((SELECT token FROM t_tok WHERE kind='c1'), 'Elisa Moura', '1988-03-10') ->> 'reason' = 'already_signed'), 'sign only once');
DO $$ BEGIN
  PERFORM 1 FROM public.contract_signatures;
  IF FOUND THEN RAISE EXCEPTION 'ASSERT: anon reads signatures'; END IF;
  RAISE NOTICE 'PASS: anon reads no signatures';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon reads no signatures';
END $$;

RESET ROLE;
SELECT pg_temp.assert_true((SELECT status = 'accepted' FROM public.proposals WHERE id='90000000-0000-0000-0000-0000000000e1'), 'proposal accepted');
SELECT pg_temp.assert_true((SELECT kanban_stage = 'closed_won' FROM public.leads WHERE id='b0000000-0000-0000-0000-0000000000e1'), 'lead closed won');
SELECT pg_temp.assert_true((SELECT length(document_hash) = 64 AND snapshot ->> 'proposal_number' = 'P-E1' FROM public.proposal_acceptances), 'acceptance evidence');
SELECT pg_temp.assert_true((SELECT process_status = 'pending_confirmation' AND signed_at IS NOT NULL AND document_hash = encode(sha256(convert_to('<p>Contrato da Elisa</p>','UTF8')),'hex') FROM public.contracts WHERE id='c0000000-0000-0000-0000-0000000000e1'), 'contract ready to activate, hash recorded');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.notifications WHERE user_id='10000000-0000-0000-0000-0000000000e1'), 'staff notified twice');
SELECT pg_temp.assert_true((SELECT failed_attempts = 2 FROM public.proposal_links WHERE proposal_id='90000000-0000-0000-0000-0000000000e1'), 'failed attempts counted');

ROLLBACK;
