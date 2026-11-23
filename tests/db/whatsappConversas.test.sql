\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(v boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

INSERT INTO public.clinics(id,name,slug) VALUES ('20000000-0000-0000-0000-0000000000a1','WA Clinica','wa-clinica'),('20000000-0000-0000-0000-0000000000a2','WA Outra','wa-outra');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('10000000-0000-0000-0000-0000000000a1','wa-recep@test',now()),('10000000-0000-0000-0000-0000000000a2','wa-outra@test',now());
INSERT INTO public.user_roles(user_id,clinic_id,role,is_active) VALUES
('10000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','receptionist',true),
('10000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-0000000000a2','admin',true);
INSERT INTO public.whatsapp_channels(clinic_id, account_id, status) VALUES ('20000000-0000-0000-0000-0000000000a1','acc-1','connected');
-- Paciente cadastrada SEM o 9 e com máscara; WhatsApp manda com 55 e com 9.
INSERT INTO public.patients(id,clinic_id,full_name,phone) VALUES ('70000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','Maria Souza','(11) 5021-0668');

SELECT pg_temp.assert_true(private.phone_key('5511950210668') = private.phone_key('(11) 5021-0668'), 'phone key ignores 55 and 9th digit');
SELECT pg_temp.assert_true(private.phone_display('5511950210668') = '(11) 95021-0668', 'phone display');

-- Conta desconhecida: nada gravado
SELECT pg_temp.assert_true((public.whatsapp_ingest_event('{"id":"e0","event":"message.received","account":{"accountId":"acc-x"},"message":{"platform":"whatsapp"}}') ->> 'reason') = 'unknown_account', 'unknown account refused');

-- Mensagem de paciente conhecida
SELECT public.whatsapp_ingest_event('{"id":"e1","event":"message.received","account":{"accountId":"acc-1"},
 "conversation":{"id":"conv-1","participantId":"5511950210668","participantName":"Maria"},
 "message":{"platform":"whatsapp","platformMessageId":"wamid-1","direction":"incoming","text":"Oi, quero agendar","attachments":[],"sentAt":"2026-11-06T12:00:00Z","sender":{"id":"5511950210668"}}}');
SELECT pg_temp.assert_true((SELECT patient_id = '70000000-0000-0000-0000-0000000000a1' AND lead_id IS NULL AND unread_count = 1 AND last_message_preview = 'Oi, quero agendar'
  FROM public.whatsapp_conversations WHERE external_id='conv-1'), 'known patient linked, no lead created');
-- Repetição do mesmo aviso
SELECT pg_temp.assert_true((public.whatsapp_ingest_event('{"id":"e1","event":"message.received","account":{"accountId":"acc-1"},"message":{"platform":"whatsapp"}}') ->> 'duplicate')::boolean, 'duplicate event skipped');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.whatsapp_messages), 'one message stored');

-- Número novo vira lead
SELECT public.whatsapp_ingest_event('{"id":"e2","event":"message.received","account":{"accountId":"acc-1"},
 "conversation":{"id":"conv-2","participantId":"5521988887777","participantName":"Joana Lima"},
 "message":{"platform":"whatsapp","platformMessageId":"wamid-2","direction":"incoming","text":"Quanto custa?","attachments":[],"sentAt":"2026-11-06T12:05:00Z","sender":{"id":"5521988887777"}}}');
SELECT pg_temp.assert_true((SELECT l.full_name = 'Joana Lima' AND l.source = 'whatsapp' AND l.kanban_stage = 'new_lead' AND l.phone = '(21) 98888-7777'
  FROM public.whatsapp_conversations c JOIN public.leads l ON l.id = c.lead_id WHERE c.external_id='conv-2'), 'new number becomes lead');
-- Segunda mensagem do mesmo número: não cria outro lead
SELECT public.whatsapp_ingest_event('{"id":"e3","event":"message.received","account":{"accountId":"acc-1"},
 "conversation":{"id":"conv-2","participantId":"5521988887777"},
 "message":{"platform":"whatsapp","platformMessageId":"wamid-3","direction":"incoming","text":"Oi?","attachments":[],"sentAt":"2026-11-06T12:06:00Z","sender":{"id":"5521988887777"}}}');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.leads WHERE clinic_id='20000000-0000-0000-0000-0000000000a1'), 'no duplicate lead');
SELECT pg_temp.assert_true((SELECT unread_count = 2 FROM public.whatsapp_conversations WHERE external_id='conv-2'), 'unread counted');

-- Envio da equipe + status
SELECT public.whatsapp_record_outgoing((SELECT id FROM public.whatsapp_conversations WHERE external_id='conv-2'), 'wamid-out', 'Olá Joana!', '10000000-0000-0000-0000-0000000000a1');
SELECT public.whatsapp_ingest_event('{"id":"e4","event":"message.sent","account":{"accountId":"acc-1"},"conversation":{"id":"conv-2","participantId":"5521988887777"},
 "message":{"platform":"whatsapp","platformMessageId":"wamid-out","direction":"outgoing","text":"Olá Joana!","attachments":[],"sentAt":"2026-11-06T12:07:00Z","sender":{"id":"biz"}}}');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.whatsapp_messages WHERE external_id='wamid-out'), 'sent echo not duplicated');
SELECT public.whatsapp_ingest_event('{"id":"e5","event":"message.read","account":{"accountId":"acc-1"},"message":{"platform":"whatsapp","platformMessageId":"wamid-out"}}');
SELECT public.whatsapp_ingest_event('{"id":"e6","event":"message.delivered","account":{"accountId":"acc-1"},"message":{"platform":"whatsapp","platformMessageId":"wamid-out"}}');
SELECT pg_temp.assert_true((SELECT status = 'read' FROM public.whatsapp_messages WHERE external_id='wamid-out'), 'late delivered does not downgrade read');

-- Lead vira paciente: conversa acompanha
UPDATE public.leads SET patient_id = '70000000-0000-0000-0000-0000000000a1' WHERE clinic_id='20000000-0000-0000-0000-0000000000a1';
SELECT pg_temp.assert_true((SELECT patient_id IS NOT NULL FROM public.whatsapp_conversations WHERE external_id='conv-2'), 'conversation follows converted lead');

-- Acesso
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000a2';
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.whatsapp_conversations), 'other clinic sees nothing');
DO $$ BEGIN
  PERFORM public.whatsapp_ingest_event('{"id":"x","event":"message.received"}');
  RAISE EXCEPTION 'ASSERT: staff cannot ingest';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: staff cannot call ingest';
END $$;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000a1';
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.whatsapp_conversations), 'staff sees own conversations');
SELECT public.whatsapp_mark_read((SELECT id FROM public.whatsapp_conversations WHERE external_id='conv-1'));
SELECT pg_temp.assert_true((SELECT unread_count = 0 FROM public.whatsapp_conversations WHERE external_id='conv-1'), 'mark read');
DO $$ BEGIN
  INSERT INTO public.whatsapp_messages(clinic_id, conversation_id, direction, body) VALUES ('20000000-0000-0000-0000-0000000000a1', (SELECT id FROM public.whatsapp_conversations LIMIT 1), 'outgoing', 'x');
  RAISE EXCEPTION 'ASSERT: staff cannot insert directly';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: no direct insert';
END $$;
RESET ROLE;

ROLLBACK;
