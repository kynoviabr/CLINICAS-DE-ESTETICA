-- Aceite eletrônico, etapa 6 (docs/ACEITE.md): página pública de conferência de autenticidade.
-- Quem recebe um PDF (a cliente, um advogado, um juiz) digita o código de verificação da folha de
-- assinatura e vê se o aceite existe, de qual documento, quando, por qual meio e se o documento
-- guardado hoje ainda é o mesmo que foi aceito. Sem dados pessoais: só as iniciais de quem aceitou.

-- Código de integridade do documento como ele está hoje (mesmo cálculo usado no aceite).
CREATE OR REPLACE FUNCTION private.current_document_hash(p_kind text, p_document_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_kind
    WHEN 'proposal' THEN private.acceptance_document_hash('proposal', p_document_id)
    WHEN 'contract' THEN private.acceptance_document_hash('contract', p_document_id)
    WHEN 'anamnese' THEN (SELECT private.sha256_text((a.form_data - 'submission')::text) FROM public.patient_anamneses a WHERE a.id = p_document_id)
    WHEN 'deposit_policy' THEN (SELECT private.sha256_text(coalesce(d.policy_accepted ->> 'text', d.policy_text)) FROM public.appointment_deposits d WHERE d.id = p_document_id)
    WHEN 'deposit_receipt' THEN (SELECT private.sha256_text(concat_ws('|', d.receipt_number, d.amount::text, d.paid_at::text, d.payer_name, d.payer_cpf))
                                 FROM public.appointment_deposits d WHERE d.id = p_document_id)
    WHEN 'lead_signup' THEN (SELECT private.sha256_text(l.signup_consent ->> 'text') FROM public.leads l WHERE l.id = p_document_id)
  END
$$;
REVOKE EXECUTE ON FUNCTION private.current_document_hash(text, uuid) FROM PUBLIC, anon, authenticated;

-- "Maria Teste Silva" -> "M. T. S."
CREATE OR REPLACE FUNCTION private.name_initials(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT nullif(string_agg(upper(left(w, 1)) || '.', ' '), '')
  FROM regexp_split_to_table(trim(coalesce(p_name, '')), '\s+') AS w
  WHERE length(w) > 2 OR w ~ '^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]'
$$;
REVOKE EXECUTE ON FUNCTION private.name_initials(text) FROM PUBLIC, anon, authenticated;

-- Pública. p_hash (opcional): o código SHA-256 impresso no PDF, para conferir se é o mesmo do registro.
CREATE OR REPLACE FUNCTION public.verify_document(p_code text, p_hash text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw text := regexp_replace(upper(coalesce(p_code, '')), '[^0-9A-F]', '', 'g');
  v_code text;
  a public.document_acceptances%ROWTYPE;
  v_label text;
  v_current text;
  v_hash text := lower(regexp_replace(coalesce(p_hash, ''), '[^0-9A-Fa-f]', '', 'g'));
BEGIN
  IF length(v_raw) <> 10 THEN RETURN jsonb_build_object('found', false, 'reason', 'format'); END IF;
  v_code := substr(v_raw, 1, 5) || '-' || substr(v_raw, 6, 5);
  SELECT * INTO a FROM public.document_acceptances WHERE verification_code = v_code;
  IF a.id IS NULL THEN RETURN jsonb_build_object('found', false, 'reason', 'not_found'); END IF;

  v_label := CASE a.document_kind
    WHEN 'proposal' THEN 'Proposta nº ' || coalesce((SELECT proposal_number FROM public.proposals WHERE id = a.document_id), '—')
    WHEN 'contract' THEN 'Contrato nº ' || coalesce((SELECT contract_number FROM public.contracts WHERE id = a.document_id), '—')
    WHEN 'anamnese' THEN 'Anamnese (ficha de saúde)'
    WHEN 'deposit_policy' THEN 'Condições do sinal do agendamento'
    WHEN 'deposit_receipt' THEN 'Recibo do sinal' || coalesce(' nº ' || (SELECT receipt_number FROM public.appointment_deposits WHERE id = a.document_id), '')
    WHEN 'lead_signup' THEN 'Cadastro e consentimento de dados'
    ELSE 'Documento'
  END;
  v_current := private.current_document_hash(a.document_kind, a.document_id);

  RETURN jsonb_build_object(
    'found', true,
    'verification_code', a.verification_code,
    'document_kind', a.document_kind,
    'document_label', v_label,
    'clinic_name', (SELECT name FROM public.clinics WHERE id = a.clinic_id),
    'accepted_at', a.accepted_at,
    'method', a.method,
    'signer_initials', private.name_initials(a.signer_name),
    'document_hash', a.document_hash,
    -- same: o documento guardado hoje é igual ao aceito; changed: foi alterado depois; unavailable: não existe mais.
    'integrity', CASE WHEN v_current IS NULL THEN 'unavailable' WHEN v_current = a.document_hash THEN 'same' ELSE 'changed' END,
    'hash_matches', CASE WHEN v_hash = '' THEN NULL ELSE v_hash = lower(a.document_hash) END
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_document(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_document(text, text) TO anon, authenticated;
