\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-000000000091','EC Nova','ec-nova');
SELECT pg_temp.assert_true((SELECT count(*) = 10 FROM public.class_entities WHERE clinic_id='20000000-0000-0000-0000-000000000091'), 'new clinic gets 10 regional councils');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.class_entities WHERE clinic_id='20000000-0000-0000-0000-000000000091' AND abbreviation='COREN' AND status='active'), 'COREN active');
SELECT pg_temp.assert_true((SELECT public.seed_class_entities('20000000-0000-0000-0000-000000000091') = 0), 'seeding again adds nothing');

ROLLBACK;
