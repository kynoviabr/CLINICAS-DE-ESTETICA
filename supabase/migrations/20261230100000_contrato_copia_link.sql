-- Cópia do contrato para o paciente (mesmo depois de aprovado/assinado).
-- Link próprio, só leitura: mostra o contrato e permite baixar o PDF; nunca serve para assinar.

ALTER TABLE public.contract_links ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'sign';
DO $$ BEGIN
  ALTER TABLE public.contract_links ADD CONSTRAINT contract_links_purpose_check CHECK (purpose IN ('sign', 'copy'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Link de cópia nunca registra assinatura.
CREATE OR REPLACE FUNCTION private.contract_signature_not_from_copy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.link_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.contract_links WHERE id = NEW.link_id AND purpose = 'copy') THEN
    RAISE EXCEPTION 'Link de cópia não serve para assinar.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS contract_signatures_not_from_copy ON public.contract_signatures;
CREATE TRIGGER contract_signatures_not_from_copy BEFORE INSERT ON public.contract_signatures
  FOR EACH ROW EXECUTE FUNCTION private.contract_signature_not_from_copy();

-- Equipe gera o link da cópia (contrato com documento, não cancelado). Vale 30 dias.
CREATE OR REPLACE FUNCTION public.create_contract_copy_link(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c public.contracts%ROWTYPE;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + interval '30 days';
BEGIN
  SELECT * INTO v_c FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_c.clinic_id) THEN
    RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(v_c.template_snapshot_html, v_c.template_html, '') = '' THEN
    RAISE EXCEPTION 'Este contrato não tem documento gerado.' USING ERRCODE = '22023';
  END IF;
  IF v_c.process_status = 'cancelled' OR v_c.status = 'cancelled' THEN
    RAISE EXCEPTION 'Contrato cancelado.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.contract_links (clinic_id, contract_id, token_hash, expires_at, created_by, purpose)
  VALUES (v_c.clinic_id, v_c.id, private.anamnese_token_hash(v_token), v_expires, auth.uid(), 'copy');
  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_contract_copy_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contract_copy_link(uuid) TO authenticated;

-- Paciente abre a cópia (sem login): só leitura.
CREATE OR REPLACE FUNCTION public.get_public_contract_copy(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.contract_links%ROWTYPE;
  v_c public.contracts%ROWTYPE;
  v_sig public.contract_signatures%ROWTYPE;
  v_clinic public.clinics%ROWTYPE;
BEGIN
  v_link := private.contract_link_by_token(p_token);
  IF v_link.id IS NULL OR v_link.purpose <> 'copy' THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
  IF v_link.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF;
  IF v_link.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF;
  SELECT * INTO v_c FROM public.contracts WHERE id = v_link.contract_id;
  IF v_c.process_status = 'cancelled' OR v_c.status = 'cancelled' THEN RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF;
  UPDATE public.contract_links SET first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now() WHERE id = v_link.id;
  SELECT * INTO v_sig FROM public.contract_signatures WHERE contract_id = v_c.id;
  SELECT * INTO v_clinic FROM public.clinics WHERE id = v_c.clinic_id;
  RETURN jsonb_build_object(
    'ok', true,
    'contract_number', v_c.contract_number,
    'html', coalesce(v_c.template_snapshot_html, v_c.template_html),
    'patient_name', (SELECT full_name FROM public.patients WHERE id = v_c.patient_id),
    'clinic', jsonb_build_object('name', v_clinic.name, 'phone', v_clinic.phone, 'logo_url', v_clinic.logo_url, 'primary_color', v_clinic.primary_color),
    'identity_check', 'none',
    'signature', CASE WHEN v_sig.id IS NULL THEN NULL ELSE jsonb_build_object('signed_at', v_sig.signed_at, 'signer_name', v_sig.signer_name, 'document_hash', v_sig.document_hash) END,
    'can_sign', false
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_contract_copy(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_contract_copy(text) TO anon, authenticated;
