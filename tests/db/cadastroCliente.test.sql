\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES
('20000000-0000-0000-0000-000000000041','CC A','cc-test-a'),('20000000-0000-0000-0000-000000000042','CC B','cc-test-b');

INSERT INTO public.patients(id,clinic_id,full_name,cpf,phone,address,address_number,address_complement) VALUES
('30000000-0000-0000-0000-000000000041','20000000-0000-0000-0000-000000000041','Ana','52998224725','(13) 99702-1099','Rua A','123','Apto 4');

SELECT pg_temp.assert_true((SELECT address_number='123' AND address_complement='Apto 4' FROM public.patients WHERE id='30000000-0000-0000-0000-000000000041'),'number and complement stored');

-- CPF repetido (formatado diferente) na mesma clínica é bloqueado
DO $$ BEGIN
  INSERT INTO public.patients(clinic_id,full_name,cpf) VALUES ('20000000-0000-0000-0000-000000000041','Bia','529.982.247-25');
  RAISE EXCEPTION 'ASSERT: duplicate cpf should fail';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate cpf blocked in same clinic';
END $$;

-- Mesma pessoa em outra clínica pode
INSERT INTO public.patients(clinic_id,full_name,cpf) VALUES ('20000000-0000-0000-0000-000000000042','Ana','52998224725');
SELECT pg_temp.assert_true(true,'same cpf allowed in another clinic');

-- Trocar o CPF de outro cliente para um já usado é bloqueado
INSERT INTO public.patients(id,clinic_id,full_name,cpf,phone) VALUES
('30000000-0000-0000-0000-000000000043','20000000-0000-0000-0000-000000000041','Carla',NULL,'13997021099');
DO $$ BEGIN
  UPDATE public.patients SET cpf='52998224725' WHERE id='30000000-0000-0000-0000-000000000043';
  RAISE EXCEPTION 'ASSERT: update to duplicate cpf should fail';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: update to duplicate cpf blocked';
END $$;

-- Editar outros campos de quem já tem CPF não dispara o bloqueio
UPDATE public.patients SET full_name='Ana Maria' WHERE id='30000000-0000-0000-0000-000000000041';
SELECT pg_temp.assert_true(true,'editing other fields is fine');

-- Sem CPF não bloqueia (conversão de lead sem CPF)
INSERT INTO public.patients(clinic_id,full_name) VALUES ('20000000-0000-0000-0000-000000000041','Sem CPF 1'),('20000000-0000-0000-0000-000000000041','Sem CPF 2');
SELECT pg_temp.assert_true(true,'patients without cpf allowed');

-- Função de duplicidade acha CPF e telefone ignorando formatação
SELECT pg_temp.assert_true((
  SELECT count(*)=1 FROM public.find_patient_duplicates('20000000-0000-0000-0000-000000000041','529.982.247-25',NULL,NULL) WHERE match_type='cpf'
),'finds cpf duplicate');
SELECT pg_temp.assert_true((
  SELECT count(*)=2 FROM public.find_patient_duplicates('20000000-0000-0000-0000-000000000041',NULL,'13 99702-1099',NULL) WHERE match_type='phone'
),'finds phone duplicates ignoring format');
SELECT pg_temp.assert_true((
  SELECT count(*)=1 FROM public.find_patient_duplicates('20000000-0000-0000-0000-000000000041',NULL,'13997021099','30000000-0000-0000-0000-000000000041') WHERE match_type='phone'
),'exclude id skips the patient being edited');
SELECT pg_temp.assert_true((
  SELECT count(*)=0 FROM public.find_patient_duplicates('20000000-0000-0000-0000-000000000042',NULL,'13997021099',NULL)
),'other clinic not matched');

ROLLBACK;
