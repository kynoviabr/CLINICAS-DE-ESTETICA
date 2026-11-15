-- Épico 12: aceite digital da proposta e assinatura eletrônica do contrato pelo celular.
-- O paciente abre o link seguro, confirma a identidade (data de nascimento ou início do CPF),
-- digita o nome completo e aceita. Fica guardada a prova: data e hora, endereço de rede, aparelho,
-- código de integridade (SHA-256) e cópia do que foi aceito. Assinatura eletrônica simples (Lei 14.063/2020).

-- ---------- Avisos para a equipe (sininho) ----------
CREATE OR REPLACE FUNCTION private.notify_clinic_staff(p_clinic uuid, p_patient uuid, p_title text, p_message text, p_extra_user uuid DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.notifications (clinic_id, user_id, patient_id, title, message, channel, status, sent_at)
  SELECT p_clinic, u, p_patient, p_title, p_message, 'in_app', 'sent', now()
  FROM (
    SELECT user_id AS u FROM public.user_roles WHERE clinic_id = p_clinic AND is_active AND role IN ('admin', 'receptionist')
    UNION SELECT p_extra_user WHERE p_extra_user IS NOT NULL
  ) s;
$$;
REVOKE EXECUTE ON FUNCTION private.notify_clinic_staff(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ---------- Conferência de identidade ----------
-- Qual dado o paciente confirma: nascimento (preferido), 3 primeiros dígitos do CPF, ou nenhum (só nome).
CREATE OR REPLACE FUNCTION private.identity_check_kind(p_patient uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p.date_of_birth IS NOT NULL THEN 'birth_date'
    WHEN length(regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g')) = 11 THEN 'cpf'
    ELSE 'none' END
  FROM public.patients p WHERE p.id = p_patient;
$$;

CREATE OR REPLACE FUNCTION private.identity_matches(p_patient uuid, p_value text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE p public.patients%ROWTYPE; v text := trim(coalesce(p_value, ''));
BEGIN
  SELECT * INTO p FROM public.patients WHERE id = p_patient;
  IF p.date_of_birth IS NOT NULL THEN
    BEGIN RETURN v::date = p.date_of_birth; EXCEPTION WHEN others THEN RETURN false; END;
  END IF;
  IF length(regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g')) = 11 THEN
    RETURN left(regexp_replace(p.cpf, '\D', '', 'g'), 3) = regexp_replace(v, '\D', '', 'g');
  END IF;
  RETURN true;
END;
$$;

-- Endereço de rede e aparelho de quem chamou (cabeçalhos que o Supabase repassa).
CREATE OR REPLACE FUNCTION private.request_evidence()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'ip', split_part(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for', ''), ',', 1),
    'user_agent', left(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'user-agent', ''), 300)
  );
$$;

CREATE OR REPLACE FUNCTION private.names_match(p_typed text, p_registered text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(trim(coalesce(p_typed, '')), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(p_registered, '')), '\s+', ' ', 'g'))
$$;

-- ---------- Proposta ----------
ALTER TABLE public.proposal_links ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.proposal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  link_id uuid REFERENCES public.proposal_links(id) ON DELETE SET NULL,
  signer_name text NOT NULL,
  verified_by text NOT NULL,
  ip text,
  user_agent text,
  document_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS proposal_acceptances_once ON public.proposal_acceptances (proposal_id);
ALTER TABLE public.proposal_acceptances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views proposal acceptances" ON public.proposal_acceptances;
CREATE POLICY "Staff views proposal acceptances" ON public.proposal_acceptances FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
REVOKE INSERT, UPDATE, DELETE ON public.proposal_acceptances FROM anon, authenticated;

-- Link válido (ou motivo do erro).
CREATE OR REPLACE FUNCTION private.proposal_link_by_token(p_token text)
RETURNS public.proposal_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v public.proposal_links%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RETURN NULL; END IF;
  SELECT * INTO v FROM public.proposal_links WHERE token_hash = private.anamnese_token_hash(p_token);
  RETURN v;
END;
$$;

-- Mesma proposta pública, agora com o estado do aceite.
CREATE OR REPLACE FUNCTION public.get_public_proposal(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.proposal_links%ROWTYPE;
  v_result jsonb;
  v_acc public.proposal_acceptances%ROWTYPE;
BEGIN
  v_link := private.proposal_link_by_token(p_token);
  IF v_link.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
  IF v_link.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF;
  IF v_link.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF;

  UPDATE public.proposal_links
  SET first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now(), open_count = open_count + 1
  WHERE id = v_link.id;

  SELECT * INTO v_acc FROM public.proposal_acceptances WHERE proposal_id = v_link.proposal_id;

  SELECT jsonb_build_object(
    'ok', true,
    'link_expires_at', v_link.expires_at,
    'id', p.id,
    'proposal_number', p.proposal_number,
    'created_at', p.created_at,
    'valid_until', p.valid_until,
    'status', p.status,
    'total_amount', p.total_amount,
    'final_amount', p.final_amount,
    'discount_amount', p.discount_amount,
    'discount_percent', p.discount_percent,
    'notes', p.notes,
    'patient', jsonb_build_object('full_name', pt.full_name),
    'clinic', jsonb_build_object(
      'id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email, 'city', c.city,
      'state', c.state, 'address', c.address, 'primary_color', c.primary_color, 'logo_url', c.logo_url
    ),
    'items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', pi.id, 'treatment_id', pi.treatment_id, 'treatment_name', t.name,
        'quantity', pi.quantity, 'unit_price', pi.unit_price, 'num_sessions', t.num_sessions
      )), '[]'::jsonb)
      FROM public.proposal_items pi
      LEFT JOIN public.treatments t ON t.id = pi.treatment_id
      WHERE pi.proposal_id = p.id
    ),
    'acceptance', CASE WHEN v_acc.id IS NULL THEN NULL ELSE jsonb_build_object('accepted_at', v_acc.accepted_at, 'signer_name', v_acc.signer_name) END,
    'identity_check', private.identity_check_kind(p.patient_id),
    'can_accept', v_acc.id IS NULL AND p.status IN ('draft', 'sent') AND (p.valid_until IS NULL OR p.valid_until >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
      AND v_link.failed_attempts < 5
  ) INTO v_result
  FROM public.proposals p
  LEFT JOIN public.patients pt ON pt.id = p.patient_id
  LEFT JOIN public.clinics c ON c.id = p.clinic_id
  WHERE p.id = v_link.proposal_id;

  RETURN coalesce(v_result, jsonb_build_object('ok', false, 'reason', 'invalid'));
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_public_proposal(p_token text, p_full_name text, p_identity text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.proposal_links%ROWTYPE;
  v_p public.proposals%ROWTYPE;
  v_name text;
  v_kind text;
  v_snapshot jsonb;
  v_ev jsonb := private.request_evidence();
BEGIN
  v_link := private.proposal_link_by_token(p_token);
  IF v_link.id IS NULL OR v_link.revoked_at IS NOT NULL OR v_link.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF v_link.failed_attempts >= 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'locked'); END IF;
  SELECT * INTO v_p FROM public.proposals WHERE id = v_link.proposal_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.proposal_acceptances WHERE proposal_id = v_p.id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted');
  END IF;
  IF v_p.status NOT IN ('draft', 'sent') OR (v_p.valid_until IS NOT NULL AND v_p.valid_until < (now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_acceptable');
  END IF;
  SELECT full_name INTO v_name FROM public.patients WHERE id = v_p.patient_id;
  v_kind := private.identity_check_kind(v_p.patient_id);
  IF NOT private.names_match(p_full_name, v_name) OR NOT private.identity_matches(v_p.patient_id, p_identity) THEN
    UPDATE public.proposal_links SET failed_attempts = failed_attempts + 1 WHERE id = v_link.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'identity', 'attempts_left', greatest(0, 4 - v_link.failed_attempts));
  END IF;

  v_snapshot := jsonb_build_object(
    'proposal_number', v_p.proposal_number, 'total_amount', v_p.total_amount, 'discount_amount', v_p.discount_amount,
    'final_amount', v_p.final_amount, 'valid_until', v_p.valid_until, 'notes', v_p.notes,
    'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('treatment', t.name, 'quantity', pi.quantity, 'unit_price', pi.unit_price) ORDER BY pi.created_at), '[]'::jsonb)
              FROM public.proposal_items pi LEFT JOIN public.treatments t ON t.id = pi.treatment_id WHERE pi.proposal_id = v_p.id)
  );
  INSERT INTO public.proposal_acceptances (clinic_id, proposal_id, link_id, signer_name, verified_by, ip, user_agent, document_hash, snapshot)
  VALUES (v_p.clinic_id, v_p.id, v_link.id, trim(p_full_name), v_kind, v_ev ->> 'ip', v_ev ->> 'user_agent',
          encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex'), v_snapshot);
  UPDATE public.proposals SET status = 'accepted', updated_at = now() WHERE id = v_p.id;
  UPDATE public.leads SET kanban_stage = 'closed_won' WHERE clinic_id = v_p.clinic_id AND proposal_id = v_p.id;
  PERFORM private.notify_clinic_staff(v_p.clinic_id, v_p.patient_id, 'Proposta aceita pelo cliente',
    format('%s aceitou a proposta %s pelo link. Gere o contrato para assinatura.', v_name, v_p.proposal_number), v_p.created_by);
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_public_proposal(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_public_proposal(text, text, text) TO anon, authenticated;

-- ---------- Contrato ----------
CREATE TABLE IF NOT EXISTS public.contract_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_links_contract_idx ON public.contract_links (contract_id, created_at DESC);
ALTER TABLE public.contract_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views contract links" ON public.contract_links;
CREATE POLICY "Staff views contract links" ON public.contract_links FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
REVOKE INSERT, UPDATE, DELETE ON public.contract_links FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.contract_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  link_id uuid REFERENCES public.contract_links(id) ON DELETE SET NULL,
  signer_name text NOT NULL,
  verified_by text NOT NULL,
  ip text,
  user_agent text,
  document_hash text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contract_signatures_once ON public.contract_signatures (contract_id);
ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views contract signatures" ON public.contract_signatures;
CREATE POLICY "Staff views contract signatures" ON public.contract_signatures FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
DROP POLICY IF EXISTS "Patient views own contract signatures" ON public.contract_signatures;
CREATE POLICY "Patient views own contract signatures" ON public.contract_signatures FOR SELECT TO authenticated
  USING (contract_id IN (SELECT c.id FROM public.contracts c WHERE c.patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid()))));
REVOKE INSERT, UPDATE, DELETE ON public.contract_signatures FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_contract_link(p_contract_id uuid, p_days integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c public.contracts%ROWTYPE;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + make_interval(days => least(greatest(coalesce(p_days, 15), 1), 60));
BEGIN
  SELECT * INTO v_c FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND OR NOT public.is_clinic_staff(auth.uid(), v_c.clinic_id) THEN
    RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(v_c.template_snapshot_html, v_c.template_html, '') = '' THEN
    RAISE EXCEPTION 'Gere o documento do contrato antes de enviar para assinatura.' USING ERRCODE = '22023';
  END IF;
  IF v_c.process_status = 'cancelled' OR v_c.status = 'cancelled' THEN
    RAISE EXCEPTION 'Contrato cancelado.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contract_signatures WHERE contract_id = v_c.id) THEN
    RAISE EXCEPTION 'Este contrato já foi assinado.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.contract_links (clinic_id, contract_id, token_hash, expires_at, created_by)
  VALUES (v_c.clinic_id, v_c.id, private.anamnese_token_hash(v_token), v_expires, auth.uid());
  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_contract_link(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contract_link(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION private.contract_link_by_token(p_token text)
RETURNS public.contract_links
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v public.contract_links%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RETURN NULL; END IF;
  SELECT * INTO v FROM public.contract_links WHERE token_hash = private.anamnese_token_hash(p_token);
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_contract(p_token text)
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
  IF v_link.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
  SELECT * INTO v_sig FROM public.contract_signatures WHERE contract_id = v_link.contract_id;
  IF v_sig.id IS NULL AND v_link.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF;
  IF v_sig.id IS NULL AND v_link.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF;
  UPDATE public.contract_links SET first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now() WHERE id = v_link.id;
  SELECT * INTO v_c FROM public.contracts WHERE id = v_link.contract_id;
  SELECT * INTO v_clinic FROM public.clinics WHERE id = v_c.clinic_id;
  RETURN jsonb_build_object(
    'ok', true,
    'contract_number', v_c.contract_number,
    'html', coalesce(v_c.template_snapshot_html, v_c.template_html),
    'patient_name', (SELECT full_name FROM public.patients WHERE id = v_c.patient_id),
    'clinic', jsonb_build_object('name', v_clinic.name, 'phone', v_clinic.phone, 'logo_url', v_clinic.logo_url, 'primary_color', v_clinic.primary_color),
    'identity_check', private.identity_check_kind(v_c.patient_id),
    'signature', CASE WHEN v_sig.id IS NULL THEN NULL ELSE jsonb_build_object('signed_at', v_sig.signed_at, 'signer_name', v_sig.signer_name, 'document_hash', v_sig.document_hash) END,
    'can_sign', v_sig.id IS NULL AND v_c.process_status <> 'cancelled' AND v_c.status <> 'cancelled' AND v_link.failed_attempts < 5
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_public_contract(p_token text, p_full_name text, p_identity text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link public.contract_links%ROWTYPE;
  v_c public.contracts%ROWTYPE;
  v_name text;
  v_hash text;
  v_ev jsonb := private.request_evidence();
BEGIN
  v_link := private.contract_link_by_token(p_token);
  IF v_link.id IS NULL OR v_link.revoked_at IS NOT NULL OR v_link.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF v_link.failed_attempts >= 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'locked'); END IF;
  SELECT * INTO v_c FROM public.contracts WHERE id = v_link.contract_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.contract_signatures WHERE contract_id = v_c.id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_signed');
  END IF;
  IF v_c.process_status = 'cancelled' OR v_c.status = 'cancelled' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_signable'); END IF;
  SELECT full_name INTO v_name FROM public.patients WHERE id = v_c.patient_id;
  IF NOT private.names_match(p_full_name, v_name) OR NOT private.identity_matches(v_c.patient_id, p_identity) THEN
    UPDATE public.contract_links SET failed_attempts = failed_attempts + 1 WHERE id = v_link.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'identity', 'attempts_left', greatest(0, 4 - v_link.failed_attempts));
  END IF;
  v_hash := encode(sha256(convert_to(coalesce(v_c.template_snapshot_html, v_c.template_html, ''), 'UTF8')), 'hex');
  INSERT INTO public.contract_signatures (clinic_id, contract_id, link_id, signer_name, verified_by, ip, user_agent, document_hash)
  VALUES (v_c.clinic_id, v_c.id, v_link.id, trim(p_full_name), private.identity_check_kind(v_c.patient_id), v_ev ->> 'ip', v_ev ->> 'user_agent', v_hash);
  UPDATE public.contracts
  SET signed_at = now(), document_hash = coalesce(document_hash, v_hash),
      process_status = CASE WHEN process_status IN ('confirmed') THEN process_status ELSE 'pending_confirmation' END,
      updated_at = now()
  WHERE id = v_c.id;
  PERFORM private.notify_clinic_staff(v_c.clinic_id, v_c.patient_id, 'Contrato assinado pelo cliente',
    format('%s assinou o contrato %s pelo link. Confira e ative o contrato.', v_name, v_c.contract_number), v_c.created_by);
  RETURN jsonb_build_object('ok', true, 'document_hash', v_hash);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_contract(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sign_public_contract(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_contract(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_public_contract(text, text, text) TO anon, authenticated;
