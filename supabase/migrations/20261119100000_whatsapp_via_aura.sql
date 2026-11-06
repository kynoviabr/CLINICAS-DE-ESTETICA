-- WhatsApp do Clinova passa a vir da Aura IA (plataforma de WhatsApp e IA da Kynovia).
-- A Aura recebe da Zernio e avisa o Clinova (função aura-webhook), que guarda uma cópia aqui
-- para as telas (Conversas, aba WhatsApp) continuarem iguais e em tempo real.
-- external_id da conversa e da mensagem passam a ser os ids da Aura.

ALTER TABLE public.whatsapp_conversations ADD COLUMN IF NOT EXISTS aura_contact_id text;

-- Processa um aviso da Aura IA. Chamada só pelo servidor (função aura-webhook).
-- Devolve o lead/paciente ligado, para a função contar à Aura quem é o contato.
CREATE OR REPLACE FUNCTION public.whatsapp_ingest_aura_event(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type text := p_event ->> 'type';
  v_id text := p_event ->> 'id';
  v_data jsonb := p_event -> 'data';
  v_contact jsonb := p_event #> '{data,contact}';
  v_msg jsonb := p_event #> '{data,message}';
  v_clinic uuid;
  v_conv_id uuid;
  v_direction text;
  v_body text;
  v_at timestamptz;
  v_phone text;
  v_rows integer;
  c public.whatsapp_conversations%ROWTYPE;
BEGIN
  IF v_id IS NULL OR v_type IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_event'); END IF;

  BEGIN
    v_clinic := (v_data #>> '{workspace,external_id}')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_workspace');
  END;
  IF NOT EXISTS (SELECT 1 FROM public.clinics WHERE id = v_clinic) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_workspace');
  END IF;

  INSERT INTO private.whatsapp_webhook_events (event_id, event) VALUES ('aura:' || v_id, v_type) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RETURN jsonb_build_object('ok', true, 'duplicate', true); END IF;

  IF v_type IN ('message.received', 'message.sent') THEN
    v_direction := CASE WHEN v_type = 'message.received' THEN 'incoming' ELSE coalesce(v_msg ->> 'direction', 'outgoing') END;
    v_body := v_msg ->> 'body';
    v_at := coalesce((v_msg ->> 'sent_at')::timestamptz, now());
    v_phone := regexp_replace(coalesce(v_contact ->> 'phone', ''), '\D', '', 'g');

    INSERT INTO public.whatsapp_conversations (clinic_id, external_id, contact_phone, contact_key, contact_name, aura_contact_id)
    VALUES (v_clinic, v_data ->> 'conversation_id', v_phone, private.phone_key(v_phone), v_contact ->> 'name', v_contact ->> 'id')
    ON CONFLICT (clinic_id, external_id) DO UPDATE
      SET contact_name = coalesce(public.whatsapp_conversations.contact_name, EXCLUDED.contact_name),
          aura_contact_id = coalesce(public.whatsapp_conversations.aura_contact_id, EXCLUDED.aura_contact_id)
    RETURNING id INTO v_conv_id;

    INSERT INTO public.whatsapp_messages (clinic_id, conversation_id, external_id, direction, body, attachments, status, sent_at)
    VALUES (v_clinic, v_conv_id, v_msg ->> 'id', v_direction, v_body, coalesce(v_msg -> 'attachments', '[]'::jsonb),
      CASE WHEN v_direction = 'incoming' THEN 'received' ELSE 'sent' END, v_at)
    ON CONFLICT (clinic_id, external_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows > 0 THEN
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

    SELECT * INTO c FROM public.whatsapp_conversations WHERE id = v_conv_id;
    RETURN jsonb_build_object(
      'ok', true,
      'conversation_id', v_conv_id,
      'aura_contact_id', c.aura_contact_id,
      'patient_id', c.patient_id,
      'lead_id', c.lead_id,
      'known_ref', v_contact ->> 'external_ref',
      'name', coalesce((SELECT full_name FROM public.patients WHERE id = c.patient_id), (SELECT full_name FROM public.leads WHERE id = c.lead_id))
    );
  END IF;

  IF v_type = 'message.status' THEN
    UPDATE public.whatsapp_messages SET status = v_msg ->> 'status'
    WHERE clinic_id = v_clinic AND external_id = v_msg ->> 'id'
      AND v_msg ->> 'status' IN ('delivered', 'read', 'failed')
      AND (v_msg ->> 'status' = 'failed'
        OR array_position(ARRAY['sending', 'sent', 'delivered', 'read'], status) < array_position(ARRAY['sending', 'sent', 'delivered', 'read'], v_msg ->> 'status'));
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'ignored', v_type);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.whatsapp_ingest_aura_event(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_ingest_aura_event(jsonb) TO service_role;
