-- Aceite eletrônico, etapa 3 (docs/ACEITE.md): anamnese, condições do sinal, recibo do sinal e cadastro do lead
-- passam a gravar no registro único (document_acceptances), com código de verificação, código de integridade
-- (SHA-256 do que foi aceito), telefone do cadastro e identidade conferida.
-- As funções que já guardam a prova continuam iguais; gatilhos copiam cada aceite para o registro.

CREATE OR REPLACE FUNCTION private.sha256_text(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex') $$;
REVOKE EXECUTE ON FUNCTION private.sha256_text(text) FROM PUBLIC, anon, authenticated;

-- ---------- Anamnese respondida pelo link ----------
-- Identidade: a data de nascimento é conferida antes de abrir o formulário (anamnese_link_check).
CREATE OR REPLACE FUNCTION private.record_anamnese_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub jsonb := NEW.form_data -> 'submission';
  v_name text := trim(coalesce(NEW.form_data #>> '{consent,signature_name}', ''));
BEGIN
  IF NEW.source_type <> 'patient_link' OR v_sub IS NULL OR v_name = '' THEN RETURN NEW; END IF;
  INSERT INTO public.document_acceptances (clinic_id, patient_id, document_kind, document_id, method, signer_name, verified_by,
    ip, user_agent, phone, document_hash, verification_code, source_id, accepted_at)
  SELECT NEW.clinic_id, NEW.patient_id, 'anamnese', NEW.id, 'link', v_name, 'birth_date',
    nullif(v_sub ->> 'ip', ''), nullif(v_sub ->> 'user_agent', ''), nullif(p.phone, ''),
    private.sha256_text((NEW.form_data - 'submission')::text), private.new_verification_code(), NEW.id,
    coalesce((v_sub ->> 'at')::timestamptz, now())
  FROM (SELECT NULL) x LEFT JOIN public.patients p ON p.id = NEW.patient_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.record_anamnese_acceptance() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS patient_anamneses_record_acceptance ON public.patient_anamneses;
CREATE TRIGGER patient_anamneses_record_acceptance AFTER INSERT ON public.patient_anamneses
  FOR EACH ROW EXECUTE FUNCTION private.record_anamnese_acceptance();

-- ---------- Condições do sinal ("Li e concordo") ----------
-- O link do sinal é pessoal (enviado ao WhatsApp da cliente); não há conferência de data de nascimento.
CREATE OR REPLACE FUNCTION private.record_deposit_policy_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.policy_accepted IS NULL OR OLD.policy_accepted IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO public.document_acceptances (clinic_id, patient_id, lead_id, document_kind, document_id, method, signer_name,
    ip, user_agent, phone, document_hash, snapshot, verification_code, source_id, accepted_at)
  SELECT NEW.clinic_id, NEW.patient_id, NEW.lead_id, 'deposit_policy', NEW.id, 'link',
    coalesce(nullif(p.full_name, ''), nullif(l.full_name, ''), 'Cliente'),
    nullif(NEW.policy_accepted ->> 'ip', ''), nullif(NEW.policy_accepted ->> 'user_agent', ''),
    coalesce(nullif(p.phone, ''), nullif(l.phone, '')),
    private.sha256_text(coalesce(NEW.policy_accepted ->> 'text', NEW.policy_text)),
    jsonb_build_object('policy_text', coalesce(NEW.policy_accepted ->> 'text', NEW.policy_text), 'amount', NEW.amount,
      'notice_hours', NEW.notice_hours, 'credit_days', NEW.credit_days),
    private.new_verification_code(), NEW.id,
    coalesce((NEW.policy_accepted ->> 'at')::timestamptz, now())
  FROM (SELECT NULL) x
  LEFT JOIN public.patients p ON p.id = NEW.patient_id
  LEFT JOIN public.leads l ON l.id = NEW.lead_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.record_deposit_policy_acceptance() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS appointment_deposits_record_policy ON public.appointment_deposits;
CREATE TRIGGER appointment_deposits_record_policy AFTER UPDATE OF policy_accepted ON public.appointment_deposits
  FOR EACH ROW EXECUTE FUNCTION private.record_deposit_policy_acceptance();

-- ---------- Recibo do sinal: "Recebi e estou de acordo" (opcional, pelo link do recibo) ----------
CREATE OR REPLACE FUNCTION public.deposit_receipt_ack(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dep public.appointment_deposits%ROWTYPE;
  v_ev jsonb := private.request_evidence();
BEGIN
  IF coalesce(p_token, '') = '' THEN RAISE EXCEPTION 'Link inválido.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_dep FROM public.appointment_deposits WHERE token_hash = private.anamnese_token_hash(p_token) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link inválido.' USING ERRCODE = '22023'; END IF;
  IF v_dep.receipt_number IS NULL OR v_dep.status NOT IN ('paid', 'applied', 'retained') THEN
    RAISE EXCEPTION 'Este recibo não está disponível.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.document_acceptances (clinic_id, patient_id, lead_id, document_kind, document_id, method, signer_name,
    ip, user_agent, phone, document_hash, snapshot, verification_code, source_id)
  SELECT v_dep.clinic_id, v_dep.patient_id, v_dep.lead_id, 'deposit_receipt', v_dep.id, 'link',
    coalesce(nullif(p.full_name, ''), nullif(l.full_name, ''), 'Cliente'),
    nullif(v_ev ->> 'ip', ''), nullif(v_ev ->> 'user_agent', ''), coalesce(nullif(p.phone, ''), nullif(l.phone, '')),
    private.sha256_text(concat_ws('|', v_dep.receipt_number, v_dep.amount::text, v_dep.paid_at::text, v_dep.payer_name, v_dep.payer_cpf)),
    jsonb_build_object('receipt_number', v_dep.receipt_number, 'amount', v_dep.amount, 'paid_at', v_dep.paid_at,
      'payer_name', v_dep.payer_name),
    private.new_verification_code(), v_dep.id
  FROM (SELECT NULL) x
  LEFT JOIN public.patients p ON p.id = v_dep.patient_id
  LEFT JOIN public.leads l ON l.id = v_dep.lead_id
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.deposit_receipt_ack(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deposit_receipt_ack(text) TO anon, authenticated;

-- ---------- Cadastro feito pelo lead (consentimento LGPD) ----------
-- Identidade: só o link pessoal; o telefone é o que o lead informou no cadastro.
CREATE OR REPLACE FUNCTION private.record_lead_signup_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_at timestamptz;
BEGIN
  IF NEW.signup_consent IS NULL OR NEW.signup_consent IS NOT DISTINCT FROM OLD.signup_consent THEN RETURN NEW; END IF;
  v_at := coalesce((NEW.signup_consent ->> 'at')::timestamptz, now());
  INSERT INTO public.document_acceptances (clinic_id, lead_id, document_kind, document_id, method, signer_name,
    ip, user_agent, phone, document_hash, snapshot, verification_code, source_id, accepted_at)
  VALUES (NEW.clinic_id, NEW.id, 'lead_signup', NEW.id, 'link', coalesce(nullif(trim(NEW.full_name), ''), 'Lead'),
    nullif(NEW.signup_consent ->> 'ip', ''), nullif(NEW.signup_consent ->> 'user_agent', ''),
    coalesce(nullif(NEW.signup_phone, ''), nullif(NEW.phone, '')),
    private.sha256_text(NEW.signup_consent ->> 'text'),
    jsonb_build_object('text', NEW.signup_consent ->> 'text'),
    private.new_verification_code(), md5('lead_signup:' || NEW.id::text || ':' || v_at::text)::uuid, v_at)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.record_lead_signup_acceptance() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS leads_record_signup_acceptance ON public.leads;
CREATE TRIGGER leads_record_signup_acceptance AFTER UPDATE OF signup_consent ON public.leads
  FOR EACH ROW EXECUTE FUNCTION private.record_lead_signup_acceptance();

-- ---------- Aceites já existentes ----------
INSERT INTO public.document_acceptances (clinic_id, patient_id, document_kind, document_id, method, signer_name, verified_by,
  ip, user_agent, phone, document_hash, verification_code, source_id, accepted_at)
SELECT a.clinic_id, a.patient_id, 'anamnese', a.id, 'link', trim(a.form_data #>> '{consent,signature_name}'), 'birth_date',
  nullif(a.form_data #>> '{submission,ip}', ''), nullif(a.form_data #>> '{submission,user_agent}', ''), nullif(p.phone, ''),
  private.sha256_text((a.form_data - 'submission')::text), private.new_verification_code(), a.id,
  coalesce((a.form_data #>> '{submission,at}')::timestamptz, a.created_at)
FROM public.patient_anamneses a LEFT JOIN public.patients p ON p.id = a.patient_id
WHERE a.source_type = 'patient_link' AND a.form_data ? 'submission'
  AND trim(coalesce(a.form_data #>> '{consent,signature_name}', '')) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.document_acceptances (clinic_id, patient_id, lead_id, document_kind, document_id, method, signer_name,
  ip, user_agent, phone, document_hash, snapshot, verification_code, source_id, accepted_at)
SELECT d.clinic_id, d.patient_id, d.lead_id, 'deposit_policy', d.id, 'link',
  coalesce(nullif(p.full_name, ''), nullif(l.full_name, ''), 'Cliente'),
  nullif(d.policy_accepted ->> 'ip', ''), nullif(d.policy_accepted ->> 'user_agent', ''),
  coalesce(nullif(p.phone, ''), nullif(l.phone, '')),
  private.sha256_text(coalesce(d.policy_accepted ->> 'text', d.policy_text)),
  jsonb_build_object('policy_text', coalesce(d.policy_accepted ->> 'text', d.policy_text), 'amount', d.amount,
    'notice_hours', d.notice_hours, 'credit_days', d.credit_days),
  private.new_verification_code(), d.id, coalesce((d.policy_accepted ->> 'at')::timestamptz, d.updated_at)
FROM public.appointment_deposits d
LEFT JOIN public.patients p ON p.id = d.patient_id
LEFT JOIN public.leads l ON l.id = d.lead_id
WHERE d.policy_accepted IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.document_acceptances (clinic_id, lead_id, document_kind, document_id, method, signer_name,
  ip, user_agent, phone, document_hash, snapshot, verification_code, source_id, accepted_at)
SELECT l.clinic_id, l.id, 'lead_signup', l.id, 'link', coalesce(nullif(trim(l.full_name), ''), 'Lead'),
  nullif(l.signup_consent ->> 'ip', ''), nullif(l.signup_consent ->> 'user_agent', ''),
  coalesce(nullif(l.signup_phone, ''), nullif(l.phone, '')),
  private.sha256_text(l.signup_consent ->> 'text'), jsonb_build_object('text', l.signup_consent ->> 'text'),
  private.new_verification_code(),
  md5('lead_signup:' || l.id::text || ':' || coalesce((l.signup_consent ->> 'at')::timestamptz, l.signup_completed_at, l.updated_at)::text)::uuid,
  coalesce((l.signup_consent ->> 'at')::timestamptz, l.signup_completed_at, l.updated_at)
FROM public.leads l
WHERE l.signup_consent IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------- Folha de assinatura no link da cliente: agora também o sinal e o recibo ----------
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
      'document_hash', a.document_hash, 'verification_code', a.verification_code
    ) ORDER BY a.accepted_at)
    FROM public.document_acceptances a WHERE a.document_kind = ANY (v_kinds) AND a.document_id = v_doc
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.document_acceptance_sheet(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_acceptance_sheet(text, text) TO anon, authenticated;
