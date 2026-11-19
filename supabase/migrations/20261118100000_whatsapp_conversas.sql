-- WhatsApp no CRM (provedor Zernio): o número da clínica, as conversas e as mensagens ficam no Clinova.
-- Os avisos da Zernio (webhooks) entram pela função whatsapp-webhook, que chama whatsapp_ingest_event.
-- Cada conversa se liga à paciente (pelo telefone) ou ao lead; sem nenhum dos dois, vira lead novo no funil.

-- Número conectado de cada clínica (um por clínica, por enquanto).
CREATE TABLE IF NOT EXISTS public.whatsapp_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'zernio',
  profile_id text,
  account_id text UNIQUE,
  phone_number text,
  display_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'disconnected')),
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  account_id text,
  contact_phone text,
  contact_key text,
  contact_name text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_direction text,
  last_incoming_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, external_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_conversations_list_idx ON public.whatsapp_conversations (clinic_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_lead_idx ON public.whatsapp_conversations (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_conversations_patient_idx ON public.whatsapp_conversations (patient_id) WHERE patient_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  external_id text,
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  body text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('received', 'sending', 'sent', 'delivered', 'read', 'failed')),
  error text,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, external_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_idx ON public.whatsapp_messages (conversation_id, sent_at);

-- Avisos já processados (a Zernio pode mandar o mesmo aviso mais de uma vez).
CREATE TABLE IF NOT EXISTS private.whatsapp_webhook_events (
  event_id text PRIMARY KEY,
  event text,
  received_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.whatsapp_webhook_events FROM PUBLIC, anon, authenticated;

ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- A equipe só lê; gravações passam pelas funções abaixo (ou pelo servidor).
DROP POLICY IF EXISTS "Staff views whatsapp channel" ON public.whatsapp_channels;
CREATE POLICY "Staff views whatsapp channel" ON public.whatsapp_channels FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
DROP POLICY IF EXISTS "Staff views whatsapp conversations" ON public.whatsapp_conversations;
CREATE POLICY "Staff views whatsapp conversations" ON public.whatsapp_conversations FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
DROP POLICY IF EXISTS "Staff views whatsapp messages" ON public.whatsapp_messages;
CREATE POLICY "Staff views whatsapp messages" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

REVOKE ALL ON public.whatsapp_channels, public.whatsapp_conversations, public.whatsapp_messages FROM anon, authenticated;
GRANT SELECT ON public.whatsapp_channels, public.whatsapp_conversations, public.whatsapp_messages TO authenticated;

-- Chave do telefone para comparar números do Brasil com e sem o 9 (DDD + últimos 8 dígitos).
CREATE OR REPLACE FUNCTION private.phone_key(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
BEGIN
  IF length(d) IN (12, 13) AND left(d, 2) = '55' THEN d := substr(d, 3); END IF;
  IF length(d) IN (10, 11) THEN RETURN left(d, 2) || right(d, 8); END IF;
  IF length(d) < 8 THEN RETURN NULL; END IF;
  RETURN d;
END;
$$;

-- Número para mostrar: +55 (11) 95021-0668
CREATE OR REPLACE FUNCTION private.phone_display(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  local text;
BEGIN
  IF length(d) IN (12, 13) AND left(d, 2) = '55' THEN
    local := substr(d, 3);
    RETURN '(' || left(local, 2) || ') ' || substr(local, 3, length(local) - 6) || '-' || right(local, 4);
  END IF;
  IF d = '' THEN RETURN NULL; END IF;
  RETURN '+' || d;
END;
$$;

-- Liga a conversa à paciente ou ao lead pelo telefone; sem nenhum, cria o lead (origem WhatsApp).
CREATE OR REPLACE FUNCTION private.whatsapp_link_contact(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.whatsapp_conversations%ROWTYPE;
  v_patient uuid;
  v_lead uuid;
BEGIN
  SELECT * INTO c FROM public.whatsapp_conversations WHERE id = p_conversation_id FOR UPDATE;
  IF c.id IS NULL OR c.contact_key IS NULL OR (c.patient_id IS NOT NULL OR c.lead_id IS NOT NULL) THEN RETURN; END IF;

  SELECT p.id INTO v_patient FROM public.patients p
  WHERE p.clinic_id = c.clinic_id AND p.phone IS NOT NULL AND private.phone_key(p.phone) = c.contact_key
  ORDER BY p.updated_at DESC LIMIT 1;

  SELECT l.id INTO v_lead FROM public.leads l
  WHERE l.clinic_id = c.clinic_id AND l.deleted_at IS NULL AND l.phone IS NOT NULL AND private.phone_key(l.phone) = c.contact_key
  ORDER BY l.updated_at DESC LIMIT 1;

  IF v_patient IS NULL AND v_lead IS NULL THEN
    INSERT INTO public.leads (clinic_id, full_name, phone, source, kanban_stage, last_interaction_at, notes)
    VALUES (c.clinic_id, coalesce(nullif(trim(c.contact_name), ''), private.phone_display(c.contact_phone), 'Contato do WhatsApp'),
      private.phone_display(c.contact_phone), 'whatsapp', 'new_lead', now(), 'Entrou pelo WhatsApp.')
    RETURNING id INTO v_lead;
  END IF;

  UPDATE public.whatsapp_conversations SET patient_id = v_patient, lead_id = v_lead WHERE id = c.id;
END;
$$;

-- Processa um aviso da Zernio. Chamada só pelo servidor (função whatsapp-webhook).
CREATE OR REPLACE FUNCTION public.whatsapp_ingest_event(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event text := p_event ->> 'event';
  v_event_id text := p_event ->> 'id';
  v_account text := coalesce(p_event #>> '{account,accountId}', p_event #>> '{account,id}');
  v_msg jsonb := p_event -> 'message';
  v_conv jsonb := p_event -> 'conversation';
  v_clinic uuid;
  v_conv_id uuid;
  v_direction text;
  v_body text;
  v_at timestamptz;
  v_phone text;
  v_name text;
  v_new_status text;
  v_inserted integer;
BEGIN
  IF v_event_id IS NULL OR v_event IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_event');
  END IF;
  IF v_event = 'webhook.test' OR coalesce((p_event ->> 'test')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'ignored', 'test');
  END IF;
  IF coalesce(v_msg ->> 'platform', 'whatsapp') <> 'whatsapp' THEN
    RETURN jsonb_build_object('ok', true, 'ignored', 'platform');
  END IF;

  SELECT clinic_id INTO v_clinic FROM public.whatsapp_channels WHERE account_id = v_account;
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_account');
  END IF;

  INSERT INTO private.whatsapp_webhook_events (event_id, event) VALUES (v_event_id, v_event) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN RETURN jsonb_build_object('ok', true, 'duplicate', true); END IF;

  IF v_event IN ('message.received', 'message.sent') THEN
    v_direction := CASE WHEN v_event = 'message.received' THEN 'incoming' ELSE coalesce(v_msg ->> 'direction', 'outgoing') END;
    v_body := v_msg ->> 'text';
    v_at := coalesce((v_msg ->> 'sentAt')::timestamptz, now());
    v_phone := coalesce(v_conv ->> 'participantId',
      CASE WHEN v_direction = 'incoming' THEN coalesce(v_msg #>> '{sender,phoneNumber}', v_msg #>> '{sender,id}') END);
    v_name := coalesce(nullif(v_conv ->> 'participantName', ''),
      CASE WHEN v_direction = 'incoming' THEN v_msg #>> '{sender,name}' END);

    INSERT INTO public.whatsapp_conversations (clinic_id, external_id, account_id, contact_phone, contact_key, contact_name)
    VALUES (v_clinic, coalesce(v_conv ->> 'id', v_msg ->> 'conversationId'), v_account,
      regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), private.phone_key(v_phone), v_name)
    ON CONFLICT (clinic_id, external_id) DO UPDATE
      SET contact_name = coalesce(public.whatsapp_conversations.contact_name, EXCLUDED.contact_name)
    RETURNING id INTO v_conv_id;

    INSERT INTO public.whatsapp_messages (clinic_id, conversation_id, external_id, direction, body, attachments, status, sent_at)
    VALUES (v_clinic, v_conv_id, v_msg ->> 'platformMessageId', v_direction, v_body,
      coalesce(v_msg -> 'attachments', '[]'::jsonb),
      CASE WHEN v_direction = 'incoming' THEN 'received' ELSE 'sent' END, v_at)
    ON CONFLICT (clinic_id, external_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted > 0 THEN
      UPDATE public.whatsapp_conversations SET
        last_message_at = greatest(coalesce(last_message_at, v_at), v_at),
        last_message_preview = CASE WHEN last_message_at IS NULL OR v_at >= last_message_at
          THEN left(coalesce(nullif(v_body, ''), '📎 Anexo'), 140) ELSE last_message_preview END,
        last_message_direction = CASE WHEN last_message_at IS NULL OR v_at >= last_message_at THEN v_direction ELSE last_message_direction END,
        last_incoming_at = CASE WHEN v_direction = 'incoming' THEN greatest(coalesce(last_incoming_at, v_at), v_at) ELSE last_incoming_at END,
        unread_count = unread_count + CASE WHEN v_direction = 'incoming' THEN 1 ELSE 0 END
      WHERE id = v_conv_id;
    END IF;

    PERFORM private.whatsapp_link_contact(v_conv_id);
    IF v_direction = 'incoming' THEN
      UPDATE public.leads SET last_interaction_at = now()
      WHERE id = (SELECT lead_id FROM public.whatsapp_conversations WHERE id = v_conv_id);
    END IF;
    RETURN jsonb_build_object('ok', true, 'conversation_id', v_conv_id);
  END IF;

  IF v_event IN ('message.delivered', 'message.read', 'message.failed') THEN
    v_new_status := CASE v_event WHEN 'message.delivered' THEN 'delivered' WHEN 'message.read' THEN 'read' ELSE 'failed' END;
    UPDATE public.whatsapp_messages SET
      status = v_new_status,
      error = CASE WHEN v_new_status = 'failed'
        THEN left(coalesce(p_event #>> '{error,message}', p_event ->> 'error', 'Falha no envio'), 500) ELSE error END
    WHERE clinic_id = v_clinic AND external_id = v_msg ->> 'platformMessageId'
      AND (v_new_status = 'failed'
        OR array_position(ARRAY['sending', 'sent', 'delivered', 'read'], status) < array_position(ARRAY['sending', 'sent', 'delivered', 'read'], v_new_status));
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'ignored', v_event);
END;
$$;

-- Mensagem enviada pela equipe (a função whatsapp-send grava depois que a Zernio aceita).
CREATE OR REPLACE FUNCTION public.whatsapp_record_outgoing(p_conversation_id uuid, p_external_id text, p_body text, p_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.whatsapp_conversations%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO c FROM public.whatsapp_conversations WHERE id = p_conversation_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Conversa não encontrada.' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.whatsapp_messages (clinic_id, conversation_id, external_id, direction, body, status, sent_by)
  VALUES (c.clinic_id, c.id, p_external_id, 'outgoing', p_body, 'sent', p_user)
  ON CONFLICT (clinic_id, external_id) DO UPDATE SET sent_by = coalesce(public.whatsapp_messages.sent_by, EXCLUDED.sent_by)
  RETURNING id INTO v_id;
  UPDATE public.whatsapp_conversations SET last_message_at = now(), last_message_preview = left(p_body, 140),
    last_message_direction = 'outgoing', unread_count = 0
  WHERE id = c.id;
  RETURN v_id;
END;
$$;

-- Equipe marca a conversa como lida.
CREATE OR REPLACE FUNCTION public.whatsapp_mark_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.whatsapp_conversations SET unread_count = 0
  WHERE id = p_conversation_id AND public.is_clinic_staff(auth.uid(), clinic_id);
END;
$$;

-- Equipe liga a conversa a outra paciente ou lead (ex.: o número não estava no cadastro).
CREATE OR REPLACE FUNCTION public.whatsapp_link_conversation(p_conversation_id uuid, p_patient_id uuid, p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic uuid;
BEGIN
  SELECT clinic_id INTO v_clinic FROM public.whatsapp_conversations WHERE id = p_conversation_id;
  IF v_clinic IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_clinic) THEN
    RAISE EXCEPTION 'Conversa não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF p_patient_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient_id AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'Paciente não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF p_lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'Lead não encontrado.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.whatsapp_conversations SET patient_id = p_patient_id, lead_id = p_lead_id WHERE id = p_conversation_id;
END;
$$;

-- Quando um lead vira paciente, a conversa passa a aparecer também na ficha da paciente.
CREATE OR REPLACE FUNCTION private.whatsapp_follow_lead_patient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.patient_id IS NOT NULL AND NEW.patient_id IS DISTINCT FROM OLD.patient_id THEN
    UPDATE public.whatsapp_conversations SET patient_id = NEW.patient_id
    WHERE lead_id = NEW.id AND patient_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_follow_lead_patient ON public.leads;
CREATE TRIGGER whatsapp_follow_lead_patient AFTER UPDATE OF patient_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION private.whatsapp_follow_lead_patient();

REVOKE EXECUTE ON FUNCTION private.phone_key(text), private.phone_display(text), private.whatsapp_link_contact(uuid),
  private.whatsapp_follow_lead_patient() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.whatsapp_ingest_event(jsonb), public.whatsapp_record_outgoing(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_ingest_event(jsonb), public.whatsapp_record_outgoing(uuid, text, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.whatsapp_mark_read(uuid), public.whatsapp_link_conversation(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_mark_read(uuid), public.whatsapp_link_conversation(uuid, uuid, uuid) TO authenticated;

-- Tela de conversas atualiza sozinha.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations, public.whatsapp_messages;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$$;
