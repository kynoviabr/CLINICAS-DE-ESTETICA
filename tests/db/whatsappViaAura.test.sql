\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000b1','Aura Clinica','aura-clinica');
INSERT INTO public.patients(id,clinic_id,full_name,phone) VALUES ('70000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-0000000000b1','Maria Souza','(11) 5021-0668');

SELECT pg_temp.assert_true((public.whatsapp_ingest_aura_event('{"id":"x","type":"message.received","data":{"workspace":{"external_id":"nao-e-uuid"}}}') ->> 'reason') = 'unknown_workspace', 'invalid workspace refused');

-- Paciente conhecida
SELECT pg_temp.assert_true((
  SELECT r ->> 'patient_id' = '70000000-0000-0000-0000-0000000000b1' AND r ->> 'aura_contact_id' = 'ct-1' AND r ->> 'name' = 'Maria Souza'
  FROM (SELECT public.whatsapp_ingest_aura_event('{"id":"a1","type":"message.received","data":{"workspace":{"id":"w","external_id":"20000000-0000-0000-0000-0000000000b1"},
    "conversation_id":"aconv-1","contact":{"id":"ct-1","phone":"5511950210668","name":"Maria","external_ref":null},
    "message":{"id":"amsg-1","direction":"incoming","body":"Oi","attachments":[],"sent_at":"2026-11-07T12:00:00Z"}}}') r) t), 'patient linked and returned');
SELECT pg_temp.assert_true((SELECT unread_count = 1 AND last_message_preview = 'Oi' FROM public.whatsapp_conversations WHERE external_id = 'aconv-1'), 'conversation mirrored');
SELECT pg_temp.assert_true((public.whatsapp_ingest_aura_event('{"id":"a1","type":"message.received","data":{"workspace":{"external_id":"20000000-0000-0000-0000-0000000000b1"}}}') ->> 'duplicate')::boolean, 'duplicate skipped');

-- Número novo vira lead
SELECT pg_temp.assert_true((
  SELECT r ->> 'lead_id' IS NOT NULL AND r ->> 'patient_id' IS NULL
  FROM (SELECT public.whatsapp_ingest_aura_event('{"id":"a2","type":"message.received","data":{"workspace":{"external_id":"20000000-0000-0000-0000-0000000000b1"},
    "conversation_id":"aconv-2","contact":{"id":"ct-2","phone":"5521988887777","name":"Joana"},
    "message":{"id":"amsg-2","direction":"incoming","body":"Quanto custa?","attachments":[],"sent_at":"2026-11-07T12:05:00Z"}}}') r) t), 'new number becomes lead');
SELECT pg_temp.assert_true((SELECT source = 'whatsapp' AND full_name = 'Joana' FROM public.leads WHERE clinic_id = '20000000-0000-0000-0000-0000000000b1'), 'lead from whatsapp');

-- Resposta da equipe (gravada pela função whatsapp) + status vindo da Aura
SELECT public.whatsapp_record_outgoing((SELECT id FROM public.whatsapp_conversations WHERE external_id='aconv-2'), 'amsg-out', 'Olá Joana', NULL);
SELECT public.whatsapp_ingest_aura_event('{"id":"a3","type":"message.status","data":{"workspace":{"external_id":"20000000-0000-0000-0000-0000000000b1"},"conversation_id":"aconv-2","message":{"id":"amsg-out","status":"read"}}}');
SELECT public.whatsapp_ingest_aura_event('{"id":"a4","type":"message.status","data":{"workspace":{"external_id":"20000000-0000-0000-0000-0000000000b1"},"conversation_id":"aconv-2","message":{"id":"amsg-out","status":"delivered"}}}');
SELECT pg_temp.assert_true((SELECT status = 'read' FROM public.whatsapp_messages WHERE external_id = 'amsg-out'), 'status read kept');

-- Mensagem mandada pelo celular (fora do Clinova) aparece
SELECT public.whatsapp_ingest_aura_event('{"id":"a5","type":"message.sent","data":{"workspace":{"external_id":"20000000-0000-0000-0000-0000000000b1"},
  "conversation_id":"aconv-2","contact":{"id":"ct-2","phone":"5521988887777"},"message":{"id":"amsg-phone","direction":"outgoing","body":"Te ligo já","sent_at":"2026-11-07T12:10:00Z"}}}');
SELECT pg_temp.assert_true((SELECT last_message_direction = 'outgoing' AND unread_count = 0 FROM public.whatsapp_conversations WHERE external_id='aconv-2'), 'phone message mirrored');

SET LOCAL ROLE authenticated;
DO $$ BEGIN PERFORM public.whatsapp_ingest_aura_event('{}'); RAISE EXCEPTION 'ASSERT: staff ingest';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: staff cannot ingest aura events'; END $$;
RESET ROLE;
ROLLBACK;
