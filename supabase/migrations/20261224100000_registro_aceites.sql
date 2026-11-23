-- Aceite eletrônico, etapa 2 (docs/ACEITE.md): registro único dos aceites de documentos, com código de
-- verificação, para a folha de assinatura dos PDFs.
-- Proposta e contrato continuam gravando nas tabelas atuais; um gatilho copia cada aceite para cá.
-- As próximas etapas (anamnese, sinal, recibo, cadastro, WhatsApp e presencial) gravam aqui também.

CREATE TABLE IF NOT EXISTS public.document_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  document_kind text NOT NULL CHECK (document_kind IN
    ('proposal', 'contract', 'anamnese', 'deposit_policy', 'deposit_receipt', 'lead_signup', 'consent_term')),
  document_id uuid NOT NULL,
  method text NOT NULL DEFAULT 'link' CHECK (method IN ('link', 'whatsapp', 'in_person_link', 'in_person_drawn')),
  signer_name text NOT NULL,
  verified_by text,
  ip text,
  user_agent text,
  phone text,
  geo jsonb,
  whatsapp_message_id text,
  signature_image_path text,
  document_hash text NOT NULL,
  snapshot jsonb,
  verification_code text NOT NULL UNIQUE,
  staff_user_id uuid,
  source_id uuid,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_acceptances_doc_idx ON public.document_acceptances (document_kind, document_id, accepted_at);
CREATE INDEX IF NOT EXISTS document_acceptances_patient_idx ON public.document_acceptances (patient_id, accepted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS document_acceptances_source_once ON public.document_acceptances (document_kind, source_id) WHERE source_id IS NOT NULL;

ALTER TABLE public.document_acceptances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff views document acceptances" ON public.document_acceptances;
CREATE POLICY "Staff views document acceptances" ON public.document_acceptances FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));
DROP POLICY IF EXISTS "Patient views own document acceptances" ON public.document_acceptances;
CREATE POLICY "Patient views own document acceptances" ON public.document_acceptances FOR SELECT TO authenticated
  USING (patient_id IN (SELECT public.get_patient_ids_for_user(auth.uid())));
REVOKE INSERT, UPDATE, DELETE ON public.document_acceptances FROM anon, authenticated;

-- Código curto de verificação (ex.: 7F3A9-C21DE), único.
CREATE OR REPLACE FUNCTION private.new_verification_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE v text;
BEGIN
  LOOP
    v := upper(substr(md5(gen_random_uuid()::text), 1, 10));
    v := substr(v, 1, 5) || '-' || substr(v, 6, 5);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.document_acceptances WHERE verification_code = v);
  END LOOP;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.new_verification_code() FROM PUBLIC, anon, authenticated;

-- ---------- Proposta: cópia do aceite ----------
CREATE OR REPLACE FUNCTION private.record_proposal_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.document_acceptances (clinic_id, patient_id, document_kind, document_id, method, signer_name, verified_by,
    ip, user_agent, document_hash, snapshot, verification_code, source_id, accepted_at)
  SELECT NEW.clinic_id, p.patient_id, 'proposal', NEW.proposal_id, 'link', NEW.signer_name, NEW.verified_by,
    NEW.ip, NEW.user_agent, NEW.document_hash, NEW.snapshot, private.new_verification_code(), NEW.id, NEW.accepted_at
  FROM public.proposals p WHERE p.id = NEW.proposal_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.record_proposal_acceptance() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS proposal_acceptances_record ON public.proposal_acceptances;
CREATE TRIGGER proposal_acceptances_record AFTER INSERT ON public.proposal_acceptances
  FOR EACH ROW EXECUTE FUNCTION private.record_proposal_acceptance();

-- ---------- Contrato: cópia da assinatura ----------
CREATE OR REPLACE FUNCTION private.record_contract_signature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.document_acceptances (clinic_id, patient_id, document_kind, document_id, method, signer_name, verified_by,
    ip, user_agent, document_hash, verification_code, source_id, accepted_at)
  SELECT NEW.clinic_id, c.patient_id, 'contract', NEW.contract_id, 'link', NEW.signer_name, NEW.verified_by,
    NEW.ip, NEW.user_agent, NEW.document_hash, private.new_verification_code(), NEW.id, NEW.signed_at
  FROM public.contracts c WHERE c.id = NEW.contract_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.record_contract_signature() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS contract_signatures_record ON public.contract_signatures;
CREATE TRIGGER contract_signatures_record AFTER INSERT ON public.contract_signatures
  FOR EACH ROW EXECUTE FUNCTION private.record_contract_signature();

-- Aceites já existentes.
INSERT INTO public.document_acceptances (clinic_id, patient_id, document_kind, document_id, method, signer_name, verified_by,
  ip, user_agent, document_hash, snapshot, verification_code, source_id, accepted_at)
SELECT a.clinic_id, p.patient_id, 'proposal', a.proposal_id, 'link', a.signer_name, a.verified_by,
  a.ip, a.user_agent, a.document_hash, a.snapshot, private.new_verification_code(), a.id, a.accepted_at
FROM public.proposal_acceptances a JOIN public.proposals p ON p.id = a.proposal_id
ON CONFLICT DO NOTHING;
INSERT INTO public.document_acceptances (clinic_id, patient_id, document_kind, document_id, method, signer_name, verified_by,
  ip, user_agent, document_hash, verification_code, source_id, accepted_at)
SELECT s.clinic_id, c.patient_id, 'contract', s.contract_id, 'link', s.signer_name, s.verified_by,
  s.ip, s.user_agent, s.document_hash, private.new_verification_code(), s.id, s.signed_at
FROM public.contract_signatures s JOIN public.contracts c ON c.id = s.contract_id
ON CONFLICT DO NOTHING;

-- ---------- Folha de assinatura no link da cliente ----------
-- Quem tem o link do documento recebe os aceites dele (são os dados da própria cliente).
CREATE OR REPLACE FUNCTION public.document_acceptance_sheet(p_kind text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_doc uuid;
BEGIN
  IF p_kind = 'proposal' THEN
    v_doc := (private.proposal_link_by_token(p_token)).proposal_id;
  ELSIF p_kind = 'contract' THEN
    v_doc := (private.contract_link_by_token(p_token)).contract_id;
  END IF;
  IF v_doc IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'signer_name', a.signer_name, 'verified_by', a.verified_by, 'method', a.method, 'ip', a.ip,
      'user_agent', a.user_agent, 'phone', a.phone, 'geo', a.geo, 'accepted_at', a.accepted_at,
      'document_hash', a.document_hash, 'verification_code', a.verification_code
    ) ORDER BY a.accepted_at)
    FROM public.document_acceptances a WHERE a.document_kind = p_kind AND a.document_id = v_doc
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.document_acceptance_sheet(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_acceptance_sheet(text, text) TO anon, authenticated;
