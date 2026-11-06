\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000a9','CT Nova','ct-nova');
SELECT public.provision_initial_contract_template('20000000-0000-0000-0000-0000000000a9');
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND bool_and(status = 'active') AND bool_and(content_html LIKE '%Cancelamento e reembolso%')
  FROM public.contract_templates WHERE clinic_id='20000000-0000-0000-0000-0000000000a9'), 'new clinic gets v2 active');
SELECT pg_temp.assert_true((SELECT content_html LIKE '%{{patient.name}}%' AND content_html LIKE '%{{#if payer}}%'
  FROM public.contract_templates WHERE clinic_id='20000000-0000-0000-0000-0000000000a9'), 'placeholders preserved');

ROLLBACK;
