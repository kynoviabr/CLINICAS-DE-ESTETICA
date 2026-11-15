\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000a1','PP Clinica','pp-clinica');
INSERT INTO public.patients(id,clinic_id,full_name,phone,cpf,email) VALUES
('70000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','Ana Lima','11999990000','12345678909','ana@test');
INSERT INTO public.treatments(id,clinic_id,name,price) VALUES
('80000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','Limpeza de pele',200);
INSERT INTO public.proposals(id,clinic_id,patient_id,proposal_number,total_amount,final_amount,notes) VALUES
('90000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','70000000-0000-0000-0000-0000000000a1','P-001',400,380,'Obs');
INSERT INTO public.proposal_items(proposal_id,treatment_id,quantity,unit_price,subtotal) VALUES
('90000000-0000-0000-0000-0000000000a1','80000000-0000-0000-0000-0000000000a1',2,200,400);

-- Paciente sem login
SET LOCAL ROLE anon;
CREATE TEMP TABLE t_p AS SELECT public.get_public_proposal('90000000-0000-0000-0000-0000000000a1') AS j;
SELECT pg_temp.assert_true((SELECT j->>'proposal_number' = 'P-001' FROM t_p), 'anon opens proposal');
SELECT pg_temp.assert_true((SELECT (j->>'final_amount')::numeric = 380 FROM t_p), 'final amount');
SELECT pg_temp.assert_true((SELECT jsonb_array_length(j->'items') = 1 AND j->'items'->0->>'treatment_name' = 'Limpeza de pele' FROM t_p), 'items with treatment name');
SELECT pg_temp.assert_true((SELECT j->'clinic'->>'name' = 'PP Clinica' FROM t_p), 'clinic data');
SELECT pg_temp.assert_true((SELECT j->'patient'->>'full_name' = 'Ana Lima' FROM t_p), 'patient name');
SELECT pg_temp.assert_true((SELECT NOT (j->'patient' ? 'cpf') AND NOT (j->'patient' ? 'email') AND NOT (j->'patient' ? 'date_of_birth') FROM t_p), 'no cpf, email or birth date exposed');
SELECT pg_temp.assert_true((SELECT public.get_public_proposal('90000000-0000-0000-0000-0000000000ff') IS NULL), 'unknown proposal returns null');
-- anon continua sem ler as tabelas direto
DO $$ BEGIN
  PERFORM 1 FROM public.proposals LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'ASSERT: anon should not read proposals'; END IF;
  RAISE NOTICE 'PASS: anon cannot read proposals table';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot read proposals table';
END $$;

ROLLBACK;
