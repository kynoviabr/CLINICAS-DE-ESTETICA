\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000b9','AO Clinica','ao-clinica');
INSERT INTO public.clinic_service_settings(clinic_id, online_booking_enabled) VALUES ('20000000-0000-0000-0000-0000000000b9', false);

SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT NOT (public.public_booking_page('ao-clinica') ->> 'ok')::boolean), 'off by default');
SELECT pg_temp.assert_true((SELECT public.public_booking_page('ao-clinica') -> 'clinic' ->> 'name' = 'AO Clinica'), 'clinic name public');
SELECT pg_temp.assert_true((SELECT public.public_booking_page('nao-existe') IS NULL), 'unknown slug');
RESET ROLE;
UPDATE public.clinic_service_settings SET online_booking_enabled = true WHERE clinic_id = '20000000-0000-0000-0000-0000000000b9';
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT (public.public_booking_page('ao-clinica') ->> 'ok')::boolean), 'on when enabled');
SELECT pg_temp.assert_true((SELECT (public.public_booking_page('ao-clinica') -> 'evaluation' ->> 'minutes')::int = 30), 'evaluation minutes');
ROLLBACK;
