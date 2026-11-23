-- Aceite eletrônico, etapa 5 (docs/ACEITE.md): "DE ACORDO" respondido no WhatsApp da Aura.
-- A equipe envia o link do documento pela conversa da Aura com a instrução "Responda DE ACORDO 1234".
-- Quando a resposta chega (aura-webhook -> whatsapp_messages), um gatilho liga a resposta ao pedido
-- pendente daquela conversa e registra o aceite: telefone, data e hora da mensagem, número da mensagem
-- no WhatsApp, texto exato da resposta e código de integridade do documento enviado.
-- O WhatsApp não informa IP nem aparelho; a folha diz claramente que o meio foi o WhatsApp.
-- Vale para proposta e contrato (documentos com link para a cliente ler inteiro antes de responder).

-- ---------- Pedidos de aceite enviados pela Aura ----------
CREATE TABLE IF NOT EXISTS public.whatsapp_acceptance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  document_kind text NOT NULL CHECK (document_kind IN ('proposal', 'contract')),
  document_id uuid NOT NULL,
  document_label text NOT NULL,
  document_hash text NOT NULL,
  link_url text NOT NULL,
  message text NOT NULL,
  code text NOT NULL CHECK (code ~ '^[0-9]{4}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired', 'changed', 'closed')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 days',
  reply_text text,
  accepted_message_id text,
  accepted_at timestamptz,
  acceptance_id uuid
);
CREATE INDEX IF NOT EXISTS whatsapp_acceptance_requests_conv_idx
  ON public.whatsapp_acceptance_requests (conversation_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_acceptance_requests_doc_idx
  ON public.whatsapp_acceptance_requests (document_kind, document_id, created_at DESC);

ALTER TABLE public.whatsapp_acceptance_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Equipe vê pedidos de aceite" ON public.whatsapp_acceptance_requests;
CREATE POLICY "Equipe vê pedidos de aceite" ON public.whatsapp_acceptance_requests
  FOR SELECT TO authenticated USING (public.is_clinic_staff(auth.uid(), clinic_id));
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_acceptance_requests FROM anon, authenticated;

-- Texto exato da resposta, guardado junto do aceite.
ALTER TABLE public.document_acceptances ADD COLUMN IF NOT EXISTS whatsapp_reply text;

-- ---------- Documento como foi enviado (mesmo cálculo do aceite pelo link) ----------
CREATE OR REPLACE FUNCTION private.proposal_acceptance_snapshot(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'proposal_number', p.proposal_number, 'total_amount', p.total_amount, 'discount_amount', p.discount_amount,
    'final_amount', p.final_amount, 'valid_until', p.valid_until, 'notes', p.notes,
    'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('treatment', t.name, 'quantity', pi.quantity, 'unit_price', pi.unit_price) ORDER BY pi.created_at), '[]'::jsonb)
              FROM public.proposal_items pi LEFT JOIN public.treatments t ON t.id = pi.treatment_id WHERE pi.proposal_id = p.id))
  FROM public.proposals p WHERE p.id = p_proposal_id
$$;
REVOKE EXECUTE ON FUNCTION private.proposal_acceptance_snapshot(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.acceptance_document_hash(p_kind text, p_document_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_kind
    WHEN 'proposal' THEN private.sha256_text(private.proposal_acceptance_snapshot(p_document_id)::text)
    WHEN 'contract' THEN (SELECT private.sha256_text(coalesce(c.template_snapshot_html, c.template_html, '')) FROM public.contracts c WHERE c.id = p_document_id)
  END
$$;
REVOKE EXECUTE ON FUNCTION private.acceptance_document_hash(text, uuid) FROM PUBLIC, anon, authenticated;

-- Reconhece a resposta: "DE ACORDO", "Estou de acordo", "Sim, de acordo 1234", "Concordo"...
-- Devolve null quando não é um de acordo; '' quando é sem código; o código de 4 dígitos quando veio junto.
-- "Não estou de acordo" não passa (precisa começar pelo de acordo).
CREATE OR REPLACE FUNCTION private.whatsapp_agree_code(p_body text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  t text := upper(translate(coalesce(p_body, ''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'));
  m text[];
BEGIN
  t := trim(regexp_replace(regexp_replace(t, '[^A-Z0-9]+', ' ', 'g'), '\s+', ' ', 'g'));
  m := regexp_match(t, '^(?:SIM |OK )?(?:LI E )?(?:ESTOU |TO |TOU )?(?:DE ACORDO|CONCORDO|ACEITO)(?: ([0-9]{4}))?$');
  IF m IS NULL THEN RETURN NULL; END IF;
  RETURN coalesce(m[1], '');
END;
$$;
REVOKE EXECUTE ON FUNCTION private.whatsapp_agree_code(text) FROM PUBLIC, anon, authenticated;

-- ---------- Equipe: criar o pedido (antes de enviar pela Aura) ----------
-- Devolve a mensagem exata a enviar. O envio é feito pela função whatsapp (send_text), dentro da janela de 24h.
CREATE OR REPLACE FUNCTION public.create_whatsapp_acceptance(p_kind text, p_document_id uuid, p_link_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic uuid;
  v_patient uuid;
  v_label text;
  v_number text;
  v_name text;
  v_phone text;
  v_conv public.whatsapp_conversations%ROWTYPE;
  v_code text;
  v_msg text;
  v_id uuid;
  v_clinic_name text;
BEGIN
  IF coalesce(p_link_url, '') !~ '^https://[^\s]+$' OR length(p_link_url) > 500 THEN
    RAISE EXCEPTION 'Link do documento inválido.' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'proposal' THEN
    SELECT p.clinic_id, p.patient_id, p.proposal_number INTO v_clinic, v_patient, v_number
    FROM public.proposals p WHERE p.id = p_document_id
      AND p.status IN ('draft', 'sent')
      AND (p.valid_until IS NULL OR p.valid_until >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
      AND NOT EXISTS (SELECT 1 FROM public.proposal_acceptances a WHERE a.proposal_id = p.id);
    v_label := 'Proposta ' || v_number;
  ELSIF p_kind = 'contract' THEN
    SELECT c.clinic_id, c.patient_id, c.contract_number INTO v_clinic, v_patient, v_number
    FROM public.contracts c WHERE c.id = p_document_id
      AND c.process_status <> 'cancelled' AND c.status <> 'cancelled'
      AND coalesce(c.template_snapshot_html, c.template_html, '') <> ''
      AND NOT EXISTS (SELECT 1 FROM public.contract_signatures s WHERE s.contract_id = c.id);
    v_label := 'Contrato nº ' || v_number;
  ELSE
    RAISE EXCEPTION 'Tipo de documento inválido.' USING ERRCODE = '22023';
  END IF;
  IF v_clinic IS NULL OR NOT public.is_clinic_staff(auth.uid(), v_clinic) THEN
    RAISE EXCEPTION 'Documento não encontrado ou já aceito.' USING ERRCODE = '42501';
  END IF;
  IF v_patient IS NULL THEN RAISE EXCEPTION 'O documento não tem cliente cadastrada.' USING ERRCODE = '22023'; END IF;

  SELECT full_name, phone INTO v_name, v_phone FROM public.patients WHERE id = v_patient;
  IF private.phone_key(v_phone) IS NULL THEN
    RAISE EXCEPTION 'A cliente não tem telefone no cadastro.' USING ERRCODE = '22023';
  END IF;

  -- A conversa precisa ser do telefone do cadastro: é ele que comprova quem respondeu.
  SELECT * INTO v_conv FROM public.whatsapp_conversations
  WHERE clinic_id = v_clinic AND contact_key = private.phone_key(v_phone)
  ORDER BY last_incoming_at DESC NULLS LAST, last_message_at DESC NULLS LAST LIMIT 1;
  IF v_conv.id IS NULL THEN
    RAISE EXCEPTION 'Ainda não há conversa no WhatsApp da clínica com o telefone do cadastro. Peça para a cliente mandar uma mensagem ou envie um modelo aprovado em Conversas.'
      USING ERRCODE = '22023', HINT = 'no_conversation';
  END IF;
  IF v_conv.last_incoming_at IS NULL OR v_conv.last_incoming_at < now() - interval '24 hours' THEN
    RAISE EXCEPTION 'A cliente não escreveu nas últimas 24 horas. Pelas regras do WhatsApp, envie antes um modelo aprovado em Conversas e peça o de acordo quando ela responder.'
      USING ERRCODE = '22023', HINT = 'window_closed';
  END IF;

  -- Um pedido aberto por documento: o novo substitui o anterior.
  UPDATE public.whatsapp_acceptance_requests SET status = 'cancelled'
  WHERE document_kind = p_kind AND document_id = p_document_id AND status = 'pending';

  LOOP
    v_code := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.whatsapp_acceptance_requests
      WHERE conversation_id = v_conv.id AND status = 'pending' AND code = v_code);
  END LOOP;

  SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_clinic;
  v_msg := format(E'Olá, %s! Segue %s da %s para você ler com calma:\n%s\n\nSe estiver tudo certo, responda esta mensagem com:\nDE ACORDO %s\n\nSua resposta fica registrada como aceite eletrônico do documento.',
    split_part(trim(v_name), ' ', 1), CASE WHEN p_kind = 'proposal' THEN 'a ' || v_label ELSE 'o ' || v_label END,
    coalesce(v_clinic_name, 'clínica'), p_link_url, v_code);

  INSERT INTO public.whatsapp_acceptance_requests (clinic_id, patient_id, conversation_id, document_kind, document_id,
    document_label, document_hash, link_url, message, code, created_by)
  VALUES (v_clinic, v_patient, v_conv.id, p_kind, p_document_id, v_label,
    private.acceptance_document_hash(p_kind, p_document_id), p_link_url, v_msg, v_code, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('request_id', v_id, 'conversation_id', v_conv.id, 'message', v_msg, 'code', v_code);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_whatsapp_acceptance(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_whatsapp_acceptance(text, uuid, text) TO authenticated;

-- Envio falhou ou a equipe desistiu: o pedido deixa de valer.
CREATE OR REPLACE FUNCTION public.cancel_whatsapp_acceptance(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.whatsapp_acceptance_requests SET status = 'cancelled'
  WHERE id = p_request_id AND status = 'pending' AND public.is_clinic_staff(auth.uid(), clinic_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_whatsapp_acceptance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_whatsapp_acceptance(uuid) TO authenticated;

-- ---------- Resposta chegou: registra o aceite ----------
CREATE OR REPLACE FUNCTION private.apply_whatsapp_acceptance(p_req public.whatsapp_acceptance_requests, p_msg public.whatsapp_messages)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_phone text;
  v_contact text;
  v_at timestamptz := coalesce(p_msg.sent_at, now());
  v_source uuid;
  v_acc uuid;
  v_p public.proposals%ROWTYPE;
  v_c public.contracts%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  SELECT full_name, phone INTO v_name, v_phone FROM public.patients WHERE id = p_req.patient_id;
  SELECT contact_phone INTO v_contact FROM public.whatsapp_conversations WHERE id = p_req.conversation_id;

  -- O documento não pode ter mudado depois do envio, e o telefone tem de continuar sendo o do cadastro.
  IF private.acceptance_document_hash(p_req.document_kind, p_req.document_id) IS DISTINCT FROM p_req.document_hash
     OR private.phone_key(v_phone) IS DISTINCT FROM private.phone_key(v_contact) THEN
    UPDATE public.whatsapp_acceptance_requests SET status = 'changed', reply_text = p_msg.body WHERE id = p_req.id;
    PERFORM private.notify_clinic_staff(p_req.clinic_id, p_req.patient_id, 'De acordo não registrado',
      format('%s respondeu DE ACORDO, mas %s mudou depois do envio (ou o telefone do cadastro mudou). Envie de novo.', v_name, p_req.document_label),
      p_req.created_by);
    RETURN;
  END IF;

  IF p_req.document_kind = 'proposal' THEN
    SELECT * INTO v_p FROM public.proposals WHERE id = p_req.document_id FOR UPDATE;
    IF v_p.status NOT IN ('draft', 'sent') OR (v_p.valid_until IS NOT NULL AND v_p.valid_until < (now() AT TIME ZONE 'America/Sao_Paulo')::date)
       OR EXISTS (SELECT 1 FROM public.proposal_acceptances WHERE proposal_id = v_p.id) THEN
      UPDATE public.whatsapp_acceptance_requests SET status = 'closed', reply_text = p_msg.body WHERE id = p_req.id;
      RETURN;
    END IF;
    v_snapshot := private.proposal_acceptance_snapshot(v_p.id);
    INSERT INTO public.proposal_acceptances (clinic_id, proposal_id, signer_name, verified_by, document_hash, snapshot, accepted_at)
    VALUES (v_p.clinic_id, v_p.id, v_name, 'whatsapp_phone', p_req.document_hash, v_snapshot, v_at)
    RETURNING id INTO v_source;
    UPDATE public.proposals SET status = 'accepted', updated_at = now() WHERE id = v_p.id;
    UPDATE public.leads SET kanban_stage = 'closed_won' WHERE clinic_id = v_p.clinic_id AND proposal_id = v_p.id;
    PERFORM private.notify_clinic_staff(v_p.clinic_id, v_p.patient_id, 'Proposta aceita pelo WhatsApp',
      format('%s respondeu DE ACORDO à proposta %s. Gere o contrato para assinatura.', v_name, v_p.proposal_number), p_req.created_by);
  ELSE
    SELECT * INTO v_c FROM public.contracts WHERE id = p_req.document_id FOR UPDATE;
    IF v_c.process_status = 'cancelled' OR v_c.status = 'cancelled'
       OR EXISTS (SELECT 1 FROM public.contract_signatures WHERE contract_id = v_c.id) THEN
      UPDATE public.whatsapp_acceptance_requests SET status = 'closed', reply_text = p_msg.body WHERE id = p_req.id;
      RETURN;
    END IF;
    INSERT INTO public.contract_signatures (clinic_id, contract_id, signer_name, verified_by, document_hash, signed_at)
    VALUES (v_c.clinic_id, v_c.id, v_name, 'whatsapp_phone', p_req.document_hash, v_at)
    RETURNING id INTO v_source;
    UPDATE public.contracts
    SET signed_at = v_at, document_hash = coalesce(document_hash, p_req.document_hash),
        process_status = CASE WHEN process_status IN ('confirmed') THEN process_status ELSE 'pending_confirmation' END,
        updated_at = now()
    WHERE id = v_c.id;
    PERFORM private.notify_clinic_staff(v_c.clinic_id, v_c.patient_id, 'Contrato aceito pelo WhatsApp',
      format('%s respondeu DE ACORDO ao contrato %s. Confira e confirme o contrato.', v_name, v_c.contract_number), p_req.created_by);
  END IF;

  -- O gatilho do aceite já copiou para o registro; completa com as provas do WhatsApp.
  UPDATE public.document_acceptances
  SET method = 'whatsapp', verified_by = 'whatsapp_phone', phone = v_contact, whatsapp_message_id = p_msg.external_id,
      whatsapp_reply = p_msg.body, staff_user_id = p_req.created_by, accepted_at = v_at
  WHERE document_kind = p_req.document_kind AND source_id = v_source
  RETURNING id INTO v_acc;

  UPDATE public.whatsapp_acceptance_requests
  SET status = 'accepted', reply_text = p_msg.body, accepted_message_id = p_msg.external_id, accepted_at = v_at, acceptance_id = v_acc
  WHERE id = p_req.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.apply_whatsapp_acceptance(public.whatsapp_acceptance_requests, public.whatsapp_messages) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.whatsapp_acceptance_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text := private.whatsapp_agree_code(NEW.body);
  v_req public.whatsapp_acceptance_requests%ROWTYPE;
  v_open integer;
BEGIN
  IF v_code IS NULL THEN RETURN NEW; END IF;
  -- Uma falha aqui nunca pode impedir a mensagem de entrar na conversa.
  BEGIN
    UPDATE public.whatsapp_acceptance_requests SET status = 'expired'
    WHERE conversation_id = NEW.conversation_id AND status = 'pending' AND expires_at < now();

    IF v_code <> '' THEN
      -- Com código: só o pedido daquele código (código de um pedido antigo não aceita outro documento).
      SELECT * INTO v_req FROM public.whatsapp_acceptance_requests
      WHERE conversation_id = NEW.conversation_id AND status = 'pending' AND code = v_code
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    ELSE
      -- Sem código: só aceita quando há um único pedido aberto na conversa.
      SELECT count(*) INTO v_open FROM public.whatsapp_acceptance_requests
      WHERE conversation_id = NEW.conversation_id AND status = 'pending';
      IF v_open = 1 THEN
        SELECT * INTO v_req FROM public.whatsapp_acceptance_requests
        WHERE conversation_id = NEW.conversation_id AND status = 'pending' FOR UPDATE;
      END IF;
    END IF;
    IF v_req.id IS NOT NULL THEN
      PERFORM private.apply_whatsapp_acceptance(v_req, NEW);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'whatsapp_acceptance_on_message: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.whatsapp_acceptance_on_message() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS whatsapp_messages_acceptance ON public.whatsapp_messages;
CREATE TRIGGER whatsapp_messages_acceptance AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW WHEN (NEW.direction = 'incoming') EXECUTE FUNCTION private.whatsapp_acceptance_on_message();

-- ---------- Folha no link da cliente: resposta do WhatsApp ----------
CREATE OR REPLACE FUNCTION public.document_acceptance_sheet(p_kind text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc uuid;
  v_kinds text[] := ARRAY[p_kind];
BEGIN
  IF coalesce(p_token, '') = '' THEN RETURN '[]'::jsonb; END IF;
  IF p_kind = 'proposal' THEN
    v_doc := (private.proposal_link_by_token(p_token)).proposal_id;
  ELSIF p_kind = 'contract' THEN
    v_doc := (private.contract_link_by_token(p_token)).contract_id;
  ELSIF p_kind = 'deposit' THEN
    SELECT id INTO v_doc FROM public.appointment_deposits WHERE token_hash = private.anamnese_token_hash(p_token);
    v_kinds := ARRAY['deposit_policy', 'deposit_receipt'];
  END IF;
  IF v_doc IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'document_kind', a.document_kind,
      'signer_name', a.signer_name, 'verified_by', a.verified_by, 'method', a.method, 'ip', a.ip,
      'user_agent', a.user_agent, 'phone', a.phone, 'geo', a.geo, 'accepted_at', a.accepted_at,
      'document_hash', a.document_hash, 'verification_code', a.verification_code,
      'signature_image', a.signature_image,
      'whatsapp_reply', a.whatsapp_reply, 'whatsapp_message_id', a.whatsapp_message_id,
      'staff_name', (SELECT pr.full_name FROM public.professionals pr WHERE a.staff_user_id IS NOT NULL AND pr.user_id = a.staff_user_id LIMIT 1)
    ) ORDER BY a.accepted_at)
    FROM public.document_acceptances a WHERE a.document_kind = ANY (v_kinds) AND a.document_id = v_doc
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.document_acceptance_sheet(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_acceptance_sheet(text, text) TO anon, authenticated;
