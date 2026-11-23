-- Aceite eletrônico, etapa 4 (docs/ACEITE.md): aceite na clínica.
-- 1. Link na hora: a equipe mostra um QR Code; a cliente abre no próprio celular e aceita como pelo link.
--    O link fica marcado como presencial e o aceite sai como "Na clínica, pelo celular da própria cliente".
-- 2. Assinatura desenhada: no aparelho da clínica, com a equipe logada, a cliente confere o nome e desenha a
--    assinatura. Ficam a imagem, data e hora, aparelho da clínica e quem da equipe estava logado.

-- ---------- 1. Link presencial ----------
ALTER TABLE public.proposal_links ADD COLUMN IF NOT EXISTS in_person boolean NOT NULL DEFAULT false;
ALTER TABLE public.contract_links ADD COLUMN IF NOT EXISTS in_person boolean NOT NULL DEFAULT false;
ALTER TABLE public.anamnese_links ADD COLUMN IF NOT EXISTS in_person boolean NOT NULL DEFAULT false;

-- A equipe marca como presencial o link que acabou de gerar (antes de mostrar o QR Code).
CREATE OR REPLACE FUNCTION public.mark_link_in_person(p_kind text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash text := private.anamnese_token_hash(coalesce(p_token, ''));
  v_n integer := 0;
BEGIN
  IF p_kind = 'proposal' THEN
    UPDATE public.proposal_links SET in_person = true
    WHERE token_hash = v_hash AND public.is_clinic_staff(auth.uid(), clinic_id);
  ELSIF p_kind = 'contract' THEN
    UPDATE public.contract_links SET in_person = true
    WHERE token_hash = v_hash AND public.is_clinic_staff(auth.uid(), clinic_id);
  ELSIF p_kind = 'anamnese' THEN
    UPDATE public.anamnese_links SET in_person = true
    WHERE token_hash = v_hash AND used_at IS NULL AND public.is_clinic_staff(auth.uid(), clinic_id);
  ELSE
    RAISE EXCEPTION 'Tipo de documento inválido.' USING ERRCODE = '22023';
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Link não encontrado.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_link_in_person(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_link_in_person(text, text) TO authenticated;

-- Proposta e contrato: o meio do aceite segue o link usado.
CREATE OR REPLACE FUNCTION private.record_proposal_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.document_acceptances (clinic_id, patient_id, document_kind, document_id, method, signer_name, verified_by,
    ip, user_agent, document_hash, snapshot, verification_code, source_id, accepted_at)
  SELECT NEW.clinic_id, p.patient_id, 'proposal', NEW.proposal_id,
    CASE WHEN coalesce(l.in_person, false) THEN 'in_person_link' ELSE 'link' END,
    NEW.signer_name, NEW.verified_by, NEW.ip, NEW.user_agent, NEW.document_hash, NEW.snapshot,
    private.new_verification_code(), NEW.id, NEW.accepted_at
  FROM public.proposals p LEFT JOIN public.proposal_links l ON l.id = NEW.link_id
  WHERE p.id = NEW.proposal_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.record_contract_signature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.document_acceptances (clinic_id, patient_id, document_kind, document_id, method, signer_name, verified_by,
    ip, user_agent, document_hash, verification_code, source_id, accepted_at)
  SELECT NEW.clinic_id, c.patient_id, 'contract', NEW.contract_id,
    CASE WHEN coalesce(l.in_person, false) THEN 'in_person_link' ELSE 'link' END,
    NEW.signer_name, NEW.verified_by, NEW.ip, NEW.user_agent, NEW.document_hash,
    private.new_verification_code(), NEW.id, NEW.signed_at
  FROM public.contracts c LEFT JOIN public.contract_links l ON l.id = NEW.link_id
  WHERE c.id = NEW.contract_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Anamnese: o link é marcado como usado logo depois de gravar as respostas, na mesma transação.
CREATE OR REPLACE FUNCTION private.anamnese_link_mark_method()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.in_person AND NEW.used_at IS NOT NULL AND OLD.used_at IS NULL THEN
    UPDATE public.document_acceptances SET method = 'in_person_link'
    WHERE document_kind = 'anamnese' AND patient_id = NEW.patient_id AND method = 'link' AND created_at = now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.anamnese_link_mark_method() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS anamnese_links_mark_method ON public.anamnese_links;
CREATE TRIGGER anamnese_links_mark_method AFTER UPDATE OF used_at ON public.anamnese_links
  FOR EACH ROW EXECUTE FUNCTION private.anamnese_link_mark_method();

-- ---------- 2. Assinatura desenhada na tela da clínica ----------
-- A imagem fica no próprio registro (PNG pequeno), para sair no PDF da clínica e no link da cliente.
ALTER TABLE public.document_acceptances ADD COLUMN IF NOT EXISTS signature_image text;
ALTER TABLE public.document_acceptances DROP CONSTRAINT IF EXISTS document_acceptances_signature_image_check;
ALTER TABLE public.document_acceptances ADD CONSTRAINT document_acceptances_signature_image_check
  CHECK (signature_image IS NULL OR (signature_image LIKE 'data:image/png;base64,%' AND length(signature_image) <= 400000));

CREATE OR REPLACE FUNCTION public.sign_in_person(p_kind text, p_document_id uuid, p_signer_name text, p_signature_image text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ev jsonb := private.request_evidence();
  v_name text := regexp_replace(trim(coalesce(p_signer_name, '')), '\s+', ' ', 'g');
  v_patient uuid;
  v_registered text;
  v_source uuid;
  v_hash text;
  v_snapshot jsonb;
  v_p public.proposals%ROWTYPE;
  v_c public.contracts%ROWTYPE;
  v_a public.patient_anamneses%ROWTYPE;
BEGIN
  IF coalesce(p_signature_image, '') NOT LIKE 'data:image/png;base64,%' OR length(p_signature_image) > 400000
     OR length(p_signature_image) < 200 THEN
    RAISE EXCEPTION 'Desenhe a assinatura antes de confirmar.' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'proposal' THEN
    SELECT * INTO v_p FROM public.proposals WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_p.clinic_id) THEN
      RAISE EXCEPTION 'Proposta não encontrada.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.proposal_acceptances WHERE proposal_id = v_p.id) THEN
      RAISE EXCEPTION 'Esta proposta já foi aceita.' USING ERRCODE = '22023';
    END IF;
    IF v_p.status NOT IN ('draft', 'sent') OR (v_p.valid_until IS NOT NULL AND v_p.valid_until < (now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN
      RAISE EXCEPTION 'Esta proposta não pode mais ser aceita (vencida ou encerrada).' USING ERRCODE = '22023';
    END IF;
    v_patient := v_p.patient_id;
  ELSIF p_kind = 'contract' THEN
    SELECT * INTO v_c FROM public.contracts WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_c.clinic_id) THEN
      RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.contract_signatures WHERE contract_id = v_c.id) THEN
      RAISE EXCEPTION 'Este contrato já foi assinado.' USING ERRCODE = '22023';
    END IF;
    IF v_c.process_status = 'cancelled' OR v_c.status = 'cancelled' THEN
      RAISE EXCEPTION 'Contrato cancelado.' USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_c.template_snapshot_html, v_c.template_html, '') = '' THEN
      RAISE EXCEPTION 'Gere o documento do contrato antes de assinar.' USING ERRCODE = '22023';
    END IF;
    v_patient := v_c.patient_id;
  ELSIF p_kind = 'anamnese' THEN
    SELECT * INTO v_a FROM public.patient_anamneses WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_a.clinic_id) THEN
      RAISE EXCEPTION 'Anamnese não encontrada.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.document_acceptances WHERE document_kind = 'anamnese' AND document_id = v_a.id) THEN
      RAISE EXCEPTION 'Esta anamnese já tem o aceite da cliente.' USING ERRCODE = '22023';
    END IF;
    v_patient := v_a.patient_id;
  ELSE
    RAISE EXCEPTION 'Tipo de documento inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT full_name INTO v_registered FROM public.patients WHERE id = v_patient;
  IF NOT private.names_match(v_name, v_registered) THEN
    RAISE EXCEPTION 'O nome digitado não confere com o cadastro (%).', v_registered USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'proposal' THEN
    v_snapshot := jsonb_build_object(
      'proposal_number', v_p.proposal_number, 'total_amount', v_p.total_amount, 'discount_amount', v_p.discount_amount,
      'final_amount', v_p.final_amount, 'valid_until', v_p.valid_until, 'notes', v_p.notes,
      'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('treatment', t.name, 'quantity', pi.quantity, 'unit_price', pi.unit_price) ORDER BY pi.created_at), '[]'::jsonb)
                FROM public.proposal_items pi LEFT JOIN public.treatments t ON t.id = pi.treatment_id WHERE pi.proposal_id = v_p.id));
    v_hash := private.sha256_text(v_snapshot::text);
    INSERT INTO public.proposal_acceptances (clinic_id, proposal_id, signer_name, verified_by, ip, user_agent, document_hash, snapshot)
    VALUES (v_p.clinic_id, v_p.id, v_name, 'in_person_document', v_ev ->> 'ip', v_ev ->> 'user_agent', v_hash, v_snapshot)
    RETURNING id INTO v_source;
    UPDATE public.proposals SET status = 'accepted', updated_at = now() WHERE id = v_p.id;
    UPDATE public.leads SET kanban_stage = 'closed_won' WHERE clinic_id = v_p.clinic_id AND proposal_id = v_p.id;
  ELSIF p_kind = 'contract' THEN
    v_hash := private.sha256_text(coalesce(v_c.template_snapshot_html, v_c.template_html, ''));
    INSERT INTO public.contract_signatures (clinic_id, contract_id, signer_name, verified_by, ip, user_agent, document_hash)
    VALUES (v_c.clinic_id, v_c.id, v_name, 'in_person_document', v_ev ->> 'ip', v_ev ->> 'user_agent', v_hash)
    RETURNING id INTO v_source;
    UPDATE public.contracts
    SET signed_at = now(), document_hash = coalesce(document_hash, v_hash),
        process_status = CASE WHEN process_status IN ('confirmed') THEN process_status ELSE 'pending_confirmation' END,
        updated_at = now()
    WHERE id = v_c.id;
  ELSE
    v_hash := private.sha256_text((v_a.form_data - 'submission')::text);
    INSERT INTO public.document_acceptances (clinic_id, patient_id, document_kind, document_id, method, signer_name, verified_by,
      ip, user_agent, phone, document_hash, verification_code, source_id)
    VALUES (v_a.clinic_id, v_a.patient_id, 'anamnese', v_a.id, 'in_person_drawn', v_name, 'in_person_document',
      v_ev ->> 'ip', v_ev ->> 'user_agent', (SELECT nullif(phone, '') FROM public.patients WHERE id = v_patient),
      v_hash, private.new_verification_code(), v_a.id);
    v_source := v_a.id;
  END IF;

  -- Proposta e contrato: o gatilho já copiou para o registro; completa com o que é da assinatura na clínica.
  UPDATE public.document_acceptances
  SET method = 'in_person_drawn', verified_by = 'in_person_document', signature_image = p_signature_image,
      staff_user_id = auth.uid(), phone = coalesce(phone, (SELECT nullif(p.phone, '') FROM public.patients p WHERE p.id = v_patient))
  WHERE document_kind = p_kind AND source_id = v_source;

  RETURN jsonb_build_object('ok', true, 'document_hash', v_hash,
    'verification_code', (SELECT verification_code FROM public.document_acceptances WHERE document_kind = p_kind AND source_id = v_source));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sign_in_person(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_in_person(text, uuid, text, text) TO authenticated;

-- ---------- Folha no link da cliente: imagem da assinatura e quem da equipe acompanhou ----------
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
      'staff_name', (SELECT pr.full_name FROM public.professionals pr WHERE a.staff_user_id IS NOT NULL AND pr.user_id = a.staff_user_id LIMIT 1)
    ) ORDER BY a.accepted_at)
    FROM public.document_acceptances a WHERE a.document_kind = ANY (v_kinds) AND a.document_id = v_doc
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.document_acceptance_sheet(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_acceptance_sheet(text, text) TO anon, authenticated;
